// Real Next.js HTTP boundary with isolated in-memory auth and captured email.
// Never imports application .env files or uses a production database/mail service.
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=await mkdtemp(path.join(tmpdir(),'printos-auth-http-'));
const port=await new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const origin=`http://127.0.0.1:${port}`;
let child;let output='';
try{
 await symlink(path.join(web,'node_modules'),path.join(fixture,'node_modules'),'dir');
 await mkdir(path.join(fixture,'app/api/account-auth/[...all]'),{recursive:true});
 await writeFile(path.join(fixture,'package.json'),JSON.stringify({private:true}));
 await writeFile(path.join(fixture,'next.config.mjs'),'export default {experimental:{externalDir:true}};');
 await writeFile(path.join(fixture,'app/layout.tsx'),'export default function Layout({children}){return <html><body>{children}</body></html>}');
 await writeFile(path.join(fixture,'app/api/account-auth/[...all]/route.ts'),`
import {createAccountAuth} from ${JSON.stringify(path.join(web,'lib/auth'))};
import {memoryAdapter} from "better-auth/adapters/memory";
import {withRequestPerformance} from ${JSON.stringify(path.join(web,'lib/requestPerformance'))};
const db={user:[],session:[],account:[],verification:[],rateLimit:[],organization:[],member:[],invitation:[]};
let emails=0;let verificationUrl="";
const auth=createAccountAuth(memoryAdapter(db),async(_to,_subject,url)=>{emails++;verificationUrl=url;},${JSON.stringify(origin)},"isolated-http-fixture-secret-at-least-32-characters");
export const runtime="nodejs";
export async function GET(request:Request){if(new URL(request.url).pathname.endsWith('/fixture-verify')){const result=await auth.handler(new Request(verificationUrl));return new Response(null,{status:result.status});}if(new URL(request.url).pathname.endsWith('/fixture-status'))return Response.json({users:db.user.length,emails});return withRequestPerformance("account",()=>auth.handler(request));}
export async function POST(request:Request){return withRequestPerformance("account",()=>auth.handler(request));}
`);
 // Environment is allowlisted: no credentials inherited and fixture has no .env.
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://unused:unused@127.0.0.1:1/unused'};
 child=spawn(process.execPath,[path.join(web,'node_modules/next/dist/bin/next'),'dev',fixture,'--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 const deadline=Date.now()+60000;
 while(true){try{const r=await fetch(origin+'/api/account-auth/ok');if(r.ok)break;}catch{}if(Date.now()>deadline)throw Error('Fixture startup failed');await new Promise(r=>setTimeout(r,250));}
 async function post(body,headers={}){return fetch(origin+'/api/account-auth/sign-up/email',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
 let r=await post({name:'HTTP Fixture',email:'fixture@example.test',password:'isolated-fixture-password'});
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.user.emailVerified,false);assert.equal(data.token,undefined);
 assert.deepEqual(await(await fetch(origin+'/api/account-auth/fixture-status')).json(),{users:1,emails:1});
 const verified=await fetch(origin+'/api/account-auth/fixture-verify',{redirect:'manual'});assert.ok([200,302].includes(verified.status));
 const login=await fetch(origin+'/api/account-auth/sign-in/email',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email:'fixture@example.test',password:'isolated-fixture-password'})});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const created=await fetch(origin+'/api/account-auth/organization/create',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie},body:JSON.stringify({name:'HTTP shop',slug:'http-fixture-shop',keepCurrentActiveOrganization:false,metadata:{printos:{orderingEnabled:true}}})});assert.equal(created.status,200);const shop=await created.json();assert.equal(shop.metadata.printos.orderingEnabled,false);
 const session=await(await fetch(origin+'/api/account-auth/get-session',{headers:{cookie}})).json();assert.equal(session.session.activeOrganizationId,shop.id);
 const bypass=await fetch(origin+'/api/account-auth/organization/update',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie},body:JSON.stringify({organizationId:shop.id,data:{metadata:{printos:{orderingEnabled:true}}}})});assert.equal(bypass.status,400);
 r=await post({name:'x'.repeat(20000)});assert.equal(r.status,413);
 r=await post({}, {origin:'https://untrusted.invalid'});assert.equal(r.status,403);
 assert.deepEqual(await(await fetch(origin+'/api/account-auth/fixture-status')).json(),{users:1,emails:1});
 console.log('PASS: real Next.js HTTP registration 200, verification email captured, bearer token omitted, oversized body 413, foreign origin 403; all data in memory. Shop creation selects the shop and forces ordering off; generic metadata bypass rejected.');
}catch(error){console.error('HTTP integration failed:',error.message);console.error(output);process.exitCode=1;}
finally{if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}await rm(fixture,{recursive:true,force:true});}
