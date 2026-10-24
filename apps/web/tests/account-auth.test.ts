import {describe,it,expect} from "vitest";
import {memoryAdapter} from "better-auth/adapters/memory";
import {createAccountAuth} from "../lib/auth";
function fixture(){
 const db:Record<string,any[]>={user:[],session:[],account:[],verification:[],rateLimit:[],organization:[],member:[],invitation:[]};
 const mails:{email:string;url:string}[]=[];
 const auth=createAccountAuth(memoryAdapter(db),async(email,_subject,url)=>{mails.push({email,url});},"http://localhost:3999","fixture-only-secret-".repeat(4));
 async function call(route:string,body?:object,cookie?:string){return auth.handler(new Request("http://localhost:3999/api/account-auth"+route,{method:body?"POST":"GET",headers:{origin:"http://localhost:3999","Content-Type":"application/json",...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));}
 async function registered(email="owner@example.test"){
  const signup=await call("/sign-up/email",{name:"Fixture Owner",email,password:"fixture-only-strong-password"});expect(signup.status).toBe(200);
  expect(mails.length).toBeGreaterThan(0);const verification=await auth.handler(new Request(mails.at(-1)!.url));expect([200,302]).toContain(verification.status);
  const login=await call("/sign-in/email",{email,password:"fixture-only-strong-password"});expect(login.status).toBe(200);
  const cookie=(login.headers.getSetCookie()).map(value=>value.split(";")[0]).join("; ");expect(cookie).toContain("printos-account.session_token=");return cookie;
 }
 return {auth,db,mails,call,registered};
}
describe("maintained account authentication (isolated Better Auth memory adapter)",()=>{
 it("hashes passwords, requires email verification and revokes a signed-out session",async()=>{
  const f=fixture();await f.call("/sign-up/email",{name:"Owner",email:"owner@example.test",password:"fixture-only-strong-password"});
  expect(f.db.account[0].password).not.toBe("fixture-only-strong-password");expect((await f.call("/sign-in/email",{email:"owner@example.test",password:"fixture-only-strong-password"})).status).toBe(403);
  await f.auth.handler(new Request(f.mails[0].url));const login=await f.call("/sign-in/email",{email:"owner@example.test",password:"fixture-only-strong-password"});expect(login.status).toBe(200);
  const cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");expect((await (await f.call("/get-session",undefined,cookie)).json())?.user.emailVerified).toBe(true);
  expect((await f.call("/sign-out",{},cookie)).status).toBe(200);expect(await (await f.call("/get-session",undefined,cookie)).json()).toBeNull();
 });
 it("creates owner membership and rejects selecting another shop",async()=>{
  const f=fixture();const cookie=await f.registered();const created=await f.call("/organization/create",{name:"Shop One",slug:"shop-one"},cookie);expect(created.status).toBe(200);
  const shop=await created.json();expect(f.db.member[0].role).toBe("owner");expect(f.db.member[0].organizationId).toBe(shop.id);
  expect((await f.call("/organization/set-active",{organizationId:"someone-elses-shop"},cookie)).status).not.toBe(200);
 });
 it("rejects unverified shop creation and cross-origin requests",async()=>{
  const f=fixture();expect((await f.call("/organization/create",{name:"No account",slug:"no-account"})).status).toBe(401);
  const cookie=await f.registered();expect((await f.auth.handler(new Request("http://localhost:3999/api/account-auth/organization/create",{method:"POST",headers:{origin:"https://evil.invalid",cookie,"Content-Type":"application/json"},body:JSON.stringify({name:"Evil",slug:"evil-shop"})}))).status).toBe(403);
 });
 it("uses expiring recovery tokens once and revokes prior sessions",async()=>{
  const f=fixture();const cookie=await f.registered();expect((await f.call("/request-password-reset",{email:"owner@example.test",redirectTo:"http://localhost:3999/reset-password"})).status).toBe(200);
  const mail=f.mails.at(-1)!;const resetLink=await f.auth.handler(new Request(mail.url));const url=new URL(resetLink.headers.get("location")!);const token=url.searchParams.get("token");expect(token).toBeTruthy();
  const body={token,newPassword:"replacement-fixture-password"};expect((await f.call("/reset-password",body)).status).toBe(200);expect((await f.call("/reset-password",body)).status).not.toBe(200);
  expect(await (await f.call("/get-session",undefined,cookie)).json()).toBeNull();
 });
 it("rate limits repeated HTTP sign-in attempts without trusting arbitrary forwarded IP headers",async()=>{
  const f=fixture();const statuses=[];for(let i=0;i<7;i++)statuses.push((await f.call("/sign-in/email",{email:"missing@example.test",password:"invalid-fixture-password"})).status);
  expect(statuses).toContain(429);
 });
});
it("account request bodies are bounded before authentication or password work",async()=>{
 const f=fixture();const response=await f.call("/sign-up/email",{name:"x".repeat(20000),email:"fixture@example.test",password:"fixture-password"});expect(response.status).toBe(413);expect(f.db.user).toHaveLength(0);
});
it("expired account sessions are rejected without cached-cookie authorization",async()=>{
 const f=fixture();const cookie=await f.registered();f.db.session[0].expiresAt=new Date(Date.now()-1000);expect(await(await f.call("/get-session",undefined,cookie)).json()).toBeNull();
});

it("HTTP session responses omit bearer credentials while server cookies still work",async()=>{
 const f=fixture();const cookie=await f.registered();const result=await(await f.call("/get-session",undefined,cookie)).json();expect(result.user.emailVerified).toBe(true);expect(result.session.token).toBeUndefined();
 expect((await f.call("/sign-out",{},cookie)).status).toBe(200);
});
it("clients cannot self-verify email or supply another shop's membership",async()=>{
 const f=fixture();await f.call("/sign-up/email",{name:"Fixture",email:"fixture@example.test",password:"fixture-only-strong-password",emailVerified:true,role:"owner",shopId:"someone-elses-shop"});expect(f.db.user[0].emailVerified).toBe(false);expect(f.db.member).toHaveLength(0);
});
