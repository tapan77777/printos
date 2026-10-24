// Local inspection only. Prints no secret values and never sends email or creates accounts.
import {readFile} from 'node:fs/promises';import {parseEnv} from 'node:util';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const env={};
// Match Next development precedence (later values win here).
for(const file of ['.env','.env.development','.env.local','.env.development.local']){try{Object.assign(env,parseEnv(await readFile(path.join(root,file),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
Object.assign(env,process.env);
const required=['PRINTOS_AUTH_MODE','BETTER_AUTH_URL','BETTER_AUTH_SECRET','RESEND_API_KEY','AUTH_EMAIL_FROM'];const configured=Object.fromEntries(required.map(k=>[k,!!env[k]]));const problems=[];
if(env.PRINTOS_AUTH_MODE!=='tenant')problems.push('Set PRINTOS_AUTH_MODE=tenant.');
if(!env.BETTER_AUTH_URL)problems.push('Set the exact local application origin (recommended http://localhost:3001).');else{try{const u=new URL(env.BETTER_AUTH_URL);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error();}catch{problems.push('BETTER_AUTH_URL must be an exact HTTPS origin or local development loopback HTTP origin.');}}
if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)problems.push('Manually generate and store a dedicated random development auth secret (32+ characters).');
if(!env.RESEND_API_KEY)problems.push('Create a development-scoped Resend sending key and store it server-side.');
if(!env.AUTH_EMAIL_FROM)problems.push('Set a sender authorized by your Resend account.');
console.log(JSON.stringify({databaseConfigured:!!env.DATABASE_URL,configured,problems,ready:problems.length===0,emailVerificationRequired:true,externalEmailDeliveryTested:false,accountsCreated:false,secretsChanged:false,deviceEnrollmentEnabled:env.PRINTOS_DEVICE_ENROLLMENT==='enabled'},null,2));
