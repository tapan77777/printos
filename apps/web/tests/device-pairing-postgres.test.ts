import {it,expect} from "vitest";
import {PrismaClient} from "@prisma/client";
import {generateKeyPairSync,sign,randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {pairingService,proofMessage} from "../lib/pairing";
import {deviceCredential} from "../lib/deviceCredential";
const target=process.env.PRINTOS_DISPOSABLE_DATABASE;
it.skipIf(!target)("pairing proof, scoped owner approval, single-use redemption, receipt, expiry and revocation",async()=>{
 const url=new URL(target!);if(url.hostname!=="localhost"||!url.searchParams.get("host")?.includes("printos-tenant-pg-"))throw Error("Private disposable database required");const db=new PrismaClient({datasources:{db:{url:target!}}});
 try{
 const a="pair-shop-a",b="pair-shop-b",user="pair-owner";await db.user.create({data:{id:user,name:"Fixture",email:"pair-owner@example.test",emailVerified:true}});await db.organization.createMany({data:[{id:a,name:"Pair A",slug:a},{id:b,name:"Pair B",slug:b}]});await db.member.create({data:{id:randomUUID(),userId:user,organizationId:a,role:"owner"}});
 await db.printer.createMany({data:[{id:"pair-printer-a",name:"Pair A",deviceId:"PAIR-A",shopId:a,simulationOnly:true},{id:"pair-printer-b",name:"Pair B",deviceId:"PAIR-B",shopId:b,simulationOnly:true}]});
 const svc=pairingService(db);const owner={userId:user,shopId:a,role:"owner" as const};const keys=generateKeyPairSync("ed25519");const publicKey=keys.publicKey.export({format:"der",type:"spki"}).toString("base64");const begin=()=>svc.begin({label:"Fixture counter",mode:"mock",publicKey});const proof=(pair:{id:string;nonce:string},op:"poll"|"consume")=>sign(null,Buffer.from(proofMessage(pair.id,pair.nonce,op)),keys.privateKey).toString("base64");
 const pair=await begin();await expect(svc.approve(pair.id,{...owner,role:"staff"},pair.code,"pair-printer-a")).rejects.toMatchObject({status:403});await expect(svc.approve(pair.id,owner,pair.code,"pair-printer-b")).rejects.toMatchObject({status:404});
 await svc.approve(pair.id,owner,pair.code,"pair-printer-a");await expect(svc.inspect(pair.id,{...owner,shopId:b})).rejects.toMatchObject({status:404});
 await expect(svc.consume(pair.id,"A".repeat(86)+"==")).rejects.toMatchObject({status:401});
 const results=await Promise.allSettled([svc.consume(pair.id,proof(pair,"consume")),svc.consume(pair.id,proof(pair,"consume"))]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const credential=(results.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<any>).value;
 expect(credential.shopId).toBe(a);expect(credential.printerDeviceId).toBe("PAIR-A");expect(credential.confirmed).toBe(false);expect((await db.deviceCredential.findFirstOrThrow({where:{deviceId:credential.deviceId}})).tokenHash).not.toContain(credential.token);
 const headers=new Headers({authorization:`Bearer ${credential.token}`,"x-printos-agent":credential.deviceId});expect(await deviceCredential(db,headers)).toBeNull();expect(await deviceCredential(db,headers,true)).not.toBeNull();
 const {POST:confirm}=await import("../app/api/devices/confirm/route");expect((await confirm(new NextRequest("http://localhost:3999/api/devices/confirm",{method:"POST",headers}))).status).toBe(200);expect(await deviceCredential(db,headers)).not.toBeNull();
 const {POST:claim}=await import("../app/api/jobs/claim/route");expect((await claim(new NextRequest("http://localhost:3999/api/jobs/claim",{method:"POST",headers:new Headers([...headers,["Content-Type","application/json"]]),body:JSON.stringify({attemptId:randomUUID()})}))).status).toBe(403);
 await expect(db.desktopDevice.update({where:{id:credential.deviceId},data:{processingEnabled:true}})).rejects.toThrow();
 await expect(svc.revoke(credential.deviceId,{...owner,shopId:b})).rejects.toMatchObject({status:404});
 await db.printJob.create({data:{id:"pair-active-job",shopId:a,printerId:"pair-printer-a",fileId:"fixture-only.pdf",customerSessionId:"fixture-session",printStatus:"PRINTING",claimedBy:credential.deviceId,attemptId:randomUUID(),submissionAuthorizedAt:new Date(),price:12345}});
 await svc.revoke(credential.deviceId,owner);expect(await deviceCredential(db,headers)).toBeNull();const job=await db.printJob.findUniqueOrThrow({where:{id:"pair-active-job"}});expect(job.price).toBe(12345);expect(job.printStatus).toBe("RECONCILIATION_REQUIRED");expect(job.submissionAuthorizedAt).not.toBeNull();
 const expired=await begin();await db.devicePairing.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1000)}});await expect(svc.poll(expired.id,proof(expired,"poll"))).rejects.toMatchObject({status:410});
 const locked=await begin();for(let i=0;i<5;i++)await expect(svc.approve(locked.id,owner,"FFFFFFFFFF"===locked.code?"0000000000":"FFFFFFFFFF","pair-printer-a")).rejects.toThrow();await expect(svc.approve(locked.id,owner,locked.code,"pair-printer-a")).rejects.toMatchObject({status:409});
 const lost=await begin();await svc.approve(lost.id,owner,lost.code,"pair-printer-a");const unretrieved=await svc.consume(lost.id,proof(lost,"consume"));await expect(svc.consume(lost.id,proof(lost,"consume"))).rejects.toMatchObject({status:409});await db.desktopDevice.update({where:{id:unretrieved.deviceId},data:{createdAt:new Date(Date.now()-6*60000)}});expect(await deviceCredential(db,new Headers({authorization:`Bearer ${unretrieved.token}`,"x-printos-agent":unretrieved.deviceId}),true)).toBeNull();
 const denied=await db.$queryRaw<any[]>`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN ('DesktopDevice','DevicePairing','DeviceCredential')`;expect(denied).toHaveLength(3);expect(denied.every(t=>t.relrowsecurity)).toBe(true);
 }finally{await db.$disconnect();}
},30000);
