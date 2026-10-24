// Read-only project/schema preflight. Never prints URLs, credentials or application rows.
import {readFile} from 'node:fs/promises';import {parseEnv} from 'node:util';import {fileURLToPath} from 'node:url';import path from 'node:path';import {PrismaClient} from '@prisma/client';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const reference='xkqetjzplwusogbrilja';let db;
try{
 const sources=[];let config;
 for(const file of ['.env','.env.local','.env.development','.env.development.local']){try{const env=parseEnv(await readFile(path.join(web,file),'utf8'));if(env.DATABASE_URL){const u=new URL(env.DATABASE_URL);if(u.hostname!==`db.${reference}.supabase.co`||(u.port&&u.port!=='5432'))throw Error('TARGET_MISMATCH');sources.push({source:file,projectRef:reference,database:decodeURIComponent(u.pathname.slice(1))});if(file==='.env')config=env;}}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(!config)throw Error('MISSING_TARGET');
 if(process.env.DATABASE_URL&&process.env.DATABASE_URL!==config.DATABASE_URL)throw Error('PROCESS_TARGET_OVERRIDE_REQUIRES_REVIEW');
 db=new PrismaClient({datasources:{db:{url:config.DATABASE_URL}},log:[]});
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const identity=await tx.$queryRawUnsafe("SELECT current_database() AS database, current_user AS role, current_setting('server_version') AS version, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl");
  const migrations=await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at IS NOT NULL AS complete,rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at');
  const counts=await tx.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM "PrintJob") AS jobs,(SELECT count(*)::int FROM "Printer") AS printers,(SELECT count(*)::int FROM "AgentHealth") AS agent_health,(SELECT count(*)::int FROM "PrintJob" WHERE "printStatus" IN (\'DOWNLOADING\',\'PRINTING\',\'RECONCILIATION_REQUIRED\')) AS active_or_uncertain_attempts');
  const tables=await tx.$queryRawUnsafe("SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname");
  const defaultPrivileges=await tx.$queryRawUnsafe("SELECT r.rolname AS creator,n.nspname AS schema,d.defaclobjtype::text AS type,d.defaclacl::text AS grants FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public' OR d.defaclnamespace=0");
  const grants=await tx.$queryRawUnsafe("SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated') ORDER BY table_name,grantee,privilege_type");
  const proposedObjects=await tx.$queryRawUnsafe("SELECT to_regclass('public.\"User\"')::text AS users,to_regclass('public.\"Shop\"')::text AS shops,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Printer','PrintJob') AND column_name='shopId') AS tenant_columns_exist");
  return {sources,projectRef:reference,host:`db.${reference}.supabase.co`,identity,migrations,counts,tables,defaultPrivileges,grants,proposedObjects,readOnly:true};
 },{timeout:30000});console.log(JSON.stringify(result));
}catch{console.error('READ_ONLY_PREFLIGHT_FAILED; target or connection requires review. No database writes attempted.');process.exitCode=1;}finally{await db?.$disconnect();}
