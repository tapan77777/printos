import {it,expect,vi} from "vitest";
import {PrismaClient} from "@prisma/client";
import {prismaAdapter} from "better-auth/adapters/prisma";
import {NextRequest} from "next/server";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {createAccountAuth} from "../lib/auth";
const target=process.env.PRINTOS_DISPOSABLE_DATABASE;
it.skipIf(!target)("real Prisma/PostgreSQL accounts, memberships, tenant reads and session revocation",async()=>{
 const url=new URL(target!);if(url.hostname!=="localhost"||!url.searchParams.get("host")?.includes("printos-tenant-pg-"))throw Error("Disposable private socket database required");
 const db=new PrismaClient({datasources:{db:{url:target!}}});
 const realFetch=globalThis.fetch;
 vi.stubGlobal("fetch",()=>{throw Error("External network forbidden in disposable auth test");});
 let server:ReturnType<typeof spawn>|undefined;
 const emails:{email:string;url:string}[]=[];
 try{
 const auth=createAccountAuth(prismaAdapter(db,{provider:"postgresql",transaction:true}),async(email,_subject,url)=>{emails.push({email,url});},"http://localhost:3999","fixture-only-secret-".repeat(4));
 const call=(route:string,body?:object,cookie?:string)=>auth.handler(new Request("http://localhost:3999/api/account-auth"+route,{method:body?"POST":"GET",headers:{origin:"http://localhost:3999","Content-Type":"application/json",...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 async function account(email:string){expect((await call("/sign-up/email",{name:"Fixture",email,password:"fixture-only-strong-password"})).status).toBe(200);expect((await auth.handler(new Request(emails.at(-1)!.url))).status).toBe(302);const login=await call("/sign-in/email",{email,password:"fixture-only-strong-password"});expect(login.status).toBe(200);return login.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");}
 const owner=await account("owner@example.test");const staff=await account("staff@example.test");
 const first=await call("/organization/create",{name:"First Fixture",slug:"first-fixture"},owner);expect(first.status).toBe(200);const a=await first.json();
 const second=await call("/organization/create",{name:"Second Fixture",slug:"second-fixture"},owner);expect(second.status).toBe(200);const b=await second.json();
 expect((await call("/organization/set-active",{organizationId:a.id},staff)).status).not.toBe(200);
 const invite=await call("/organization/invite-member",{email:"staff@example.test",role:"staff",organizationId:a.id},owner);expect(invite.status).toBe(200);const invitation=await invite.json();
 expect((await call("/organization/accept-invitation",{invitationId:invitation.id},staff)).status).toBe(200);
 expect((await call("/organization/set-active",{organizationId:a.id},staff)).status).toBe(200);
 await db.printer.createMany({data:[{id:"fixture-a",deviceId:"FIXTURE-A",name:"Fixture A",shopId:a.id},{id:"fixture-b",deviceId:"FIXTURE-B",name:"Fixture B",shopId:b.id}]});
 const {GET}=await import("../app/api/admin/printers/route");
 const response=await GET(new NextRequest("http://localhost:3999/api/admin/printers?shopId="+b.id,{headers:{cookie:staff}}));expect(response.status).toBe(200);expect((await response.json()).map((p:any)=>p.deviceId)).toEqual(["FIXTURE-A"]);
 // Exercise the actual built Next server and SSR against this same disposable DB.
 await db.printJob.createMany({data:[{id:"fixture-job-a",printerId:"fixture-a",shopId:a.id,fileId:"fixture-only.pdf",customerSessionId:"fixture-session-a",price:1200,printStatus:"COMPLETED",completedAt:new Date()},{id:"fixture-job-b",printerId:"fixture-b",shopId:b.id,fileId:"fixture-only.pdf",customerSessionId:"fixture-session-b",price:9900,printStatus:"COMPLETED",completedAt:new Date()}]});
 const reservation=createServer();reservation.listen(0,"127.0.0.1");await once(reservation,"listening");const port=(reservation.address() as {port:number}).port;await new Promise<void>(resolve=>reservation.close(()=>resolve()));
 server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",BETTER_AUTH_URL:"https://printos-fixture.invalid"},stdio:"ignore"});
 const base="http://127.0.0.1:"+port;let available=false;for(let i=0;i<100;i++){try{await realFetch(base+"/login");available=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}expect(available).toBe(true);
 const secureCookie=staff.replace(/printos-account.session_token=/g,"__Secure-printos-account.session_token=");
 const jobs=await realFetch(base+"/dashboard/jobs",{headers:{cookie:secureCookie}});expect(jobs.status).toBe(200);const html=await jobs.text();expect(html).toContain("Fixture A");expect(html).not.toContain("Fixture B");
 const reports=await realFetch(base+"/dashboard/reports",{headers:{cookie:secureCookie}});expect(reports.status).toBe(200);const report=await reports.text();expect(report).toContain("12.00");expect(report).not.toContain("99.00");
 const foreignPdf=await realFetch(base+"/api/jobs/fixture-job-b/file?preview=1",{headers:{cookie:secureCookie}});expect(foreignPdf.status).toBe(404);expect((await foreignPdf.json()).error).toBe("Not found");
 expect((await realFetch(base+"/api/jobs/fixture-job-b",{headers:{cookie:secureCookie}})).status).toBe(404);
 const staffUser=await db.user.findUniqueOrThrow({where:{email:"staff@example.test"}});
 await db.member.delete({where:{organizationId_userId:{organizationId:a.id,userId:staffUser.id}}});
 expect((await GET(new NextRequest("http://localhost:3999/api/admin/printers",{headers:{cookie:staff}}))).status).toBe(401);
 expect((await call("/sign-out",{},owner)).status).toBe(200);expect(await(await call("/get-session",undefined,owner)).json()).toBeNull();
 expect((await db.rateLimit.count())).toBeGreaterThan(0);expect((await db.account.findFirstOrThrow()).password).not.toBe("fixture-only-strong-password");
 }finally{if(server&&server.exitCode===null){server.kill("SIGTERM");await once(server,"exit");}await db.$disconnect();vi.unstubAllGlobals();}
},30000);
