// Read-only target recheck. Confirms preparation did not apply SQL or change data.
import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseEnv} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {PrismaClient} from '@prisma/client';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const root=path.resolve(web,'../..');let db;
try{
 const config=parseEnv(await readFile(path.join(web,'.env'),'utf8'));const url=new URL(config.DATABASE_URL);if(url.hostname!=='db.xkqetjzplwusogbrilja.supabase.co'||url.pathname!=='/postgres')throw Error();
 const pointer=JSON.parse(await readFile(path.join(root,'.printos-backups/latest-phase2e1.json'),'utf8'));const folder=path.resolve(pointer.folder);if(!folder.startsWith(path.join(root,'.printos-backups')+path.sep))throw Error();
 const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));const bytes=await readFile(path.join(folder,'before-records.json'));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.snapshotSha256);const before=JSON.parse(bytes);
 db=new PrismaClient({datasources:{db:{url:config.DATABASE_URL}},log:[]});const result=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const current={jobs:await tx.$queryRawUnsafe('SELECT * FROM "PrintJob" ORDER BY id'),printers:await tx.$queryRawUnsafe('SELECT * FROM "Printer" ORDER BY id'),health:await tx.$queryRawUnsafe('SELECT * FROM "AgentHealth" ORDER BY "agentId"'),migrations:await tx.$queryRawUnsafe('SELECT * FROM "_prisma_migrations" ORDER BY started_at')};assert.deepEqual(JSON.parse(JSON.stringify(current)),before);
 const newObjects=await tx.$queryRawUnsafe("SELECT to_regclass('public.\"User\"') IS NULL AS no_accounts,to_regclass('public.\"Shop\"') IS NULL AS no_shops,NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Printer','PrintJob') AND column_name='shopId') AS no_tenant_columns");assert.ok(Object.values(newObjects[0]).every(v=>v===true));
 return {checkedAt:new Date().toISOString(),projectRef:manifest.projectRef,jobs:current.jobs.length,printers:current.printers.length,allOriginalRecordsAndMigrationLedgerUnchanged:true,tenantMigrationApplied:false,noTenantSchemaCreated:true};
 },{isolationLevel:'RepeatableRead',timeout:30000});await writeFile(path.join(folder,'target-unchanged.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}catch{console.error('TARGET_CHANGED_OR_RECHECK_FAILED; do not proceed without review. No writes attempted.');process.exitCode=1;}finally{await db?.$disconnect();}
