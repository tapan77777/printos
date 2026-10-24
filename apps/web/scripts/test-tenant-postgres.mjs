// Creates and tears down ONLY a new private local fixture cluster. Never loads .env.
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const bin=process.env.PRINTOS_TEST_PG_BIN;
if(!bin||!path.isAbsolute(bin))throw Error('Set PRINTOS_TEST_PG_BIN to trusted local PostgreSQL binaries.');
const root=await mkdtemp(path.join(os.tmpdir(),'printos-tenant-pg-'));const socket=path.join(root,'socket');await mkdir(socket,{mode:0o700});const data=path.join(root,'data');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const port='55493';
function run(file,args,env=process.env){return new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:project,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.once('error',reject);child.once('exit',code=>code===0?resolve(output):reject(Error('Disposable fixture command failed: '+path.basename(file)+'\n'+output)));});}
let started=false;
try{
 await run(path.join(bin,'initdb'),['-D',data,'-U','printos_fixture','--auth=trust','--no-locale','--encoding=UTF8']);
 // Unix socket only, inside a mode-0700 temporary directory. No TCP listener.
 await run(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-h '' -k ${socket} -p ${port}`,'-w','start']);started=true;
 await run(path.join(bin,'psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-U','printos_fixture','-d','postgres','-f',path.join(project,'scripts/fixtures/prisma-migration-ledger.sql')]);
 const files=['20260813082625_init','20261013000000_approval_flow','20261023000000_reliable_attempts','20261023010000_tenant_accounts','20261023020000_device_enrollment','20261023030000_shop_pricing','20261023040000_private_documents','20261024000000_mvp_agent_activation'];
 for(const migration of files)await run(path.join(bin,'psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-U','printos_fixture','-d','postgres','-f',path.resolve(project,'../../prisma/migrations',migration,'migration.sql')]);
 const url=`postgresql://printos_fixture@localhost:${port}/postgres?host=${encodeURIComponent(socket)}`;
 const env={...process.env,DATABASE_URL:url,PRINTOS_DISPOSABLE_DATABASE:url,PRINTOS_AUTH_MODE:'tenant',PRINTOS_DEVICE_ENROLLMENT:'enabled',BETTER_AUTH_URL:'http://localhost:3999',BETTER_AUTH_SECRET:'fixture-only-secret-'.repeat(4),RESEND_API_KEY:'never-used-fixture-key',AUTH_EMAIL_FROM:'fixture@example.test'};
 delete env.AGENT_TOKEN;delete env.AGENT_CREDENTIALS_JSON;
 const output=await run(process.execPath,[path.join(project,'node_modules/vitest/vitest.mjs'),'run','tests/tenant-postgres.test.ts','tests/device-pairing-postgres.test.ts','tests/shop-pricing-postgres.test.ts','tests/private-documents-postgres.test.ts','tests/mvp-activation-postgres.test.ts'],env);console.log(output);console.log('Disposable PostgreSQL adapter integration passed. Supabase was not accessed.');
}finally{
 if(started)await run(path.join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
