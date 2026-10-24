// READ-ONLY remote operations. No migration/apply code. Never logs credentials or rows.
import {readFile,writeFile,mkdir,chmod,stat} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseEnv,promisify} from 'node:util';import {execFile} from 'node:child_process';import {createHash} from 'node:crypto';import {PrismaClient} from '@prisma/client';
const exec=promisify(execFile);const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const root=path.resolve(web,'../..');const ref='xkqetjzplwusogbrilja';const sha=b=>createHash('sha256').update(b).digest('hex');let db;let stage='identity';
try{
 const config=parseEnv(await readFile(path.join(web,'.env'),'utf8'));const url=new URL(config.DATABASE_URL);
 if(url.hostname!==`db.${ref}.supabase.co`||(url.port&&url.port!=='5432')||url.pathname!=='/postgres')throw Error();
 const bin=process.env.PRINTOS_PG_BIN;if(!bin||!path.isAbsolute(bin))throw Error();
 const sql=await readFile(path.join(root,'prisma/migrations/20261023010000_tenant_accounts/migration.sql'));
 if(sha(sql)!=='8292cd25efc29a07927ae88861f0943f7a1e80e9729e83927fee7dcc13d95363')throw Error();
 const folder=path.join(root,'.printos-backups',new Date().toISOString().replaceAll(':','-')+'-phase2e1');await mkdir(folder,{recursive:true,mode:0o700});await chmod(path.dirname(folder),0o700);await chmod(folder,0o700);
 const env={...process.env,PGHOST:url.hostname,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
 db=new PrismaClient({datasources:{db:{url:config.DATABASE_URL}},log:[]});
 const manifest={projectRef:ref,host:url.hostname,database:'postgres',createdAt:new Date().toISOString(),migrationSha256:sha(sql),lockdownSha256:sha(await readFile(path.join(root,'docs/rollout/phase-2e1-supabase-lockdown.sql'))),complete:false};
 await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 stage='consistent-backup';
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const identity=await tx.$queryRawUnsafe("SELECT current_database() AS database,current_user AS role,current_setting('server_version') AS version,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl");
  if(identity[0].database!=='postgres'||identity[0].ssl!==true)throw Error();
  const exported=await tx.$queryRawUnsafe('SELECT pg_export_snapshot() AS snapshot');const snapshot=exported[0].snapshot;if(!/^[0-9A-F-]+$/i.test(snapshot))throw Error();
  const jobs=await tx.$queryRawUnsafe('SELECT * FROM "PrintJob" ORDER BY id');const printers=await tx.$queryRawUnsafe('SELECT * FROM "Printer" ORDER BY id');const health=await tx.$queryRawUnsafe('SELECT * FROM "AgentHealth" ORDER BY "agentId"');const migrations=await tx.$queryRawUnsafe('SELECT * FROM "_prisma_migrations" ORDER BY started_at');
  const expected=['20260813082625_init','20261013000000_approval_flow','20261023000000_reliable_attempts'];if(JSON.stringify(migrations.map(x=>x.migration_name))!==JSON.stringify(expected)||migrations.some(x=>!x.finished_at||x.rolled_back_at))throw Error();
  for(const item of migrations){const bytes=await readFile(path.join(root,'prisma/migrations',item.migration_name,'migration.sql'));if(sha(bytes)!==item.checksum)throw Error();}
  const rows=JSON.stringify({jobs,printers,health,migrations});await writeFile(path.join(folder,'before-records.json'),rows,{mode:0o600});
  const authConfig=Object.fromEntries(['PRINTOS_AUTH_MODE','BETTER_AUTH_URL','BETTER_AUTH_SECRET','RESEND_API_KEY','AUTH_EMAIL_FROM'].map(key=>[key,key==='PRINTOS_AUTH_MODE'?config[key]==='tenant':Boolean(config[key])]));
  Object.assign(manifest,{identity:identity[0],jobs:jobs.length,printers:printers.length,agentHealth:health.length,activeOrUncertain:jobs.filter(j=>['DOWNLOADING','PRINTING','RECONCILIATION_REQUIRED'].includes(j.printStatus)).length,snapshotSha256:sha(rows),authConfigPresent:authConfig});
  const result=await exec(path.join(bin,'pg_dump'),['--format=custom','--no-owner','--no-privileges','--lock-wait-timeout=10000',`--snapshot=${snapshot}`,`--file=${path.join(folder,'database.dump')}`],{env,timeout:180000,maxBuffer:1024*1024});
  if(result.stderr)await writeFile(path.join(folder,'dump-notices.txt'),result.stderr,{mode:0o600});
 },{isolationLevel:'RepeatableRead',timeout:240000,maxWait:15000});
 stage='archive-validation';const dump=path.join(folder,'database.dump');await chmod(dump,0o600);
 const listing=await exec(path.join(bin,'pg_restore'),['--list',dump],{timeout:30000,maxBuffer:4*1024*1024});
 for(const name of ['PrintJob','Printer','AgentHealth','_prisma_migrations'])if(!listing.stdout.includes(`TABLE DATA public ${name} `))throw Error();
 await exec(path.join(bin,'pg_restore'),['--no-owner','--no-privileges','--file=/dev/null',dump],{timeout:60000,maxBuffer:1024*1024});
 await writeFile(path.join(folder,'archive-list.txt'),listing.stdout,{mode:0o600});const bytes=await readFile(dump);if(bytes.length<1024)throw Error();
 Object.assign(manifest,{complete:true,archiveValidated:true,dumpSha256:sha(bytes),bytes:(await stat(dump)).size});await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 // Dedicated pointer; never overwrite the Phase 2A rollout helper's backup pointer.
 await writeFile(path.join(root,'.printos-backups/latest-phase2e1.json'),JSON.stringify({folder}),{mode:0o600});
 console.log(JSON.stringify({backupComplete:true,folder,...manifest}));
}catch{console.error(`PHASE2E_BACKUP_FAILED stage=${stage}; no target database writes attempted. Migration must not proceed.`);process.exitCode=1;}finally{await db?.$disconnect();}
