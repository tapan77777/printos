import {it,expect} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
it("additive tenancy migration preserves historical values, and enforces tenant/membership integrity",async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile(resolve("scripts/fixtures/prisma-migration-ledger.sql"),"utf8"));
 await db.exec("CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;");
 for(const migration of ["20260813082625_init","20261013000000_approval_flow","20261023000000_reliable_attempts"])await db.exec(await readFile(resolve("../../prisma/migrations",migration,"migration.sql"),"utf8"));
 await db.exec(`INSERT INTO "Printer"(id,name,"deviceId","updatedAt") VALUES('legacy-printer','Legacy','BOX-LEGACY',now()); INSERT INTO "PrintJob"(id,"printerId","fileId","customerSessionId",price,"printStatus") VALUES('historical','legacy-printer','do-not-copy.pdf','private-session',12345,'COMPLETED');`);
 const before=(await db.query(`SELECT row_to_json(j) AS original FROM "PrintJob" j`)).rows[0];
 const sql=await readFile(resolve("../../prisma/migrations/20261023010000_tenant_accounts/migration.sql"),"utf8");expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE FROM|UPDATE ")/i);await db.exec(sql);
 const after:any=(await db.query(`SELECT row_to_json(j) AS original FROM "PrintJob" j`)).rows[0];expect(after.original).toEqual({...((before as any).original),shopId:null});
 await db.exec(`INSERT INTO "User"(id,name,email,"updatedAt") VALUES('owner','Owner','owner@example.test',now()); INSERT INTO "Shop"(id,name,slug) VALUES('a','Shop A','shop-a'),('b','Shop B','shop-b'); INSERT INTO "ShopMembership"(id,"organizationId","userId",role) VALUES('m','a','owner','owner'); INSERT INTO "Printer"(id,name,"deviceId","shopId","updatedAt") VALUES('pa','A','BOX-A','a',now()),('pb','B','BOX-B','b',now());`);
 await expect(db.exec(`INSERT INTO "ShopMembership"(id,"organizationId","userId",role) VALUES('duplicate','a','owner','staff')`)).rejects.toThrow();
 await expect(db.exec(`INSERT INTO "ShopMembership"(id,"organizationId","userId",role) VALUES('bad-role','b','owner','admin')`)).rejects.toThrow();
 for(const shop of ["'b'","NULL"])await expect(db.exec(`INSERT INTO "PrintJob"(id,"shopId","printerId","fileId","customerSessionId") VALUES('wrong',${shop},'pa','fixture.pdf','fixture')`)).rejects.toThrow();
 await db.exec(`INSERT INTO "PrintJob"(id,"shopId","printerId","fileId","customerSessionId",price) VALUES('good','a','pa','fixture.pdf','fixture',1200)`);
 await expect(db.exec(`UPDATE "PrintJob" SET "shopId"='b',"printerId"='pb' WHERE id='good'`)).rejects.toThrow();
 await expect(db.exec(`UPDATE "Printer" SET "shopId"='a' WHERE id='legacy-printer'`)).rejects.toThrow();
 const rls=await db.query<any>(`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r'`);expect(rls.rows).toHaveLength(12);expect(rls.rows.every(r=>r.relrowsecurity)).toBe(true);
 expect((await db.query<any>(`SELECT has_table_privilege('anon','public."Session"','SELECT') AS allowed`)).rows[0].allowed).toBe(false);
 expect((await db.query<any>(`SELECT price,"shopId" FROM "PrintJob" WHERE id='historical'`)).rows[0]).toEqual({price:12345,shopId:null});
 }finally{await db.close();}
},20000);
it("device enrollment migration preserves legacy rows and denies client table access",async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile(resolve("scripts/fixtures/prisma-migration-ledger.sql"),"utf8"));
 await db.exec("CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;");
 for(const name of ["20260813082625_init","20261013000000_approval_flow","20261023000000_reliable_attempts","20261023010000_tenant_accounts"])await db.exec(await readFile(resolve("../../prisma/migrations",name,"migration.sql"),"utf8"));
 await db.exec(`INSERT INTO "Printer"(id,name,"deviceId","updatedAt") VALUES('old','Old','OLD',now()); INSERT INTO "PrintJob"(id,"printerId","fileId","customerSessionId",price) VALUES('old-job','old','fixture.pdf','fixture',9876);`);
 const snapshot=async()=>({jobs:(await db.query(`SELECT row_to_json(j) FROM "PrintJob" j`)).rows,printers:(await db.query(`SELECT row_to_json(p) FROM "Printer" p`)).rows});const before=await snapshot();
 const sql=await readFile(resolve("../../prisma/migrations/20261023020000_device_enrollment/migration.sql"),"utf8");expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);await db.exec(sql);expect(await snapshot()).toEqual(before);
 for(const table of ['DesktopDevice','DeviceCredential','DevicePairing']){
 expect((await db.query<any>(`SELECT relrowsecurity FROM pg_class WHERE relname='${table}'`)).rows[0].relrowsecurity).toBe(true);
 for(const role of ['anon','authenticated'])expect((await db.query<any>(`SELECT has_table_privilege('${role}','public."${table}"','SELECT,INSERT,UPDATE,DELETE') AS allowed`)).rows[0].allowed).toBe(false);
 }
 }finally{await db.close();}
},20000);
it('pricing migration preserves all historical values and denies client rate access',async()=>{
 const db=new PGlite();try{await db.exec(await readFile(resolve('scripts/fixtures/prisma-migration-ledger.sql'),'utf8'));await db.exec('CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;');
 for(const name of ['20260813082625_init','20261013000000_approval_flow','20261023000000_reliable_attempts','20261023010000_tenant_accounts','20261023020000_device_enrollment'])await db.exec(await readFile(resolve('../../prisma/migrations',name,'migration.sql'),'utf8'));
 await db.exec(`INSERT INTO "Printer"(id,name,"deviceId","updatedAt") VALUES('preserve','Old','PRESERVE',now());INSERT INTO "PrintJob"(id,"printerId","fileId","customerSessionId",price) VALUES('preserve-job','preserve','fixture.pdf','fixture',999);`);
 const before:any=(await db.query('SELECT row_to_json(j) AS job FROM "PrintJob" j')).rows[0];const printers=(await db.query('SELECT row_to_json(p) FROM "Printer" p')).rows;
 await db.exec(await readFile(resolve('../../prisma/migrations/20261023030000_shop_pricing/migration.sql'),'utf8'));
 expect((await db.query<any>('SELECT row_to_json(j) AS job FROM "PrintJob" j')).rows[0].job).toEqual({...before.job,pricingSnapshot:null});expect((await db.query('SELECT row_to_json(p) FROM "Printer" p')).rows).toEqual(printers);
 for(const role of ['anon','authenticated'])expect((await db.query<any>(`SELECT has_table_privilege('${role}','public."ShopRateCard"','SELECT,INSERT,UPDATE,DELETE') AS allowed`)).rows[0].allowed).toBe(false);
 expect((await db.query<any>(`SELECT relrowsecurity FROM pg_class WHERE relname='ShopRateCard'`)).rows[0].relrowsecurity).toBe(true);
 }finally{await db.close();}
},20000);
it('private document migration is additive and denies direct client metadata access',async()=>{
 const db=new PGlite();try{await db.exec(await readFile(resolve('scripts/fixtures/prisma-migration-ledger.sql'),'utf8'));await db.exec('CREATE ROLE anon NOLOGIN NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;');
 for(const name of ['20260813082625_init','20261013000000_approval_flow','20261023000000_reliable_attempts','20261023010000_tenant_accounts','20261023020000_device_enrollment','20261023030000_shop_pricing'])await db.exec(await readFile(resolve('../../prisma/migrations',name,'migration.sql'),'utf8'));
 await db.exec(`INSERT INTO "Printer"(id,name,"deviceId","updatedAt") VALUES('storage-old','Old','STORAGE-OLD',now());INSERT INTO "PrintJob"(id,"printerId","fileId","customerSessionId",price) VALUES('storage-job','storage-old','original.pdf','fixture',4567);`);
 const snapshot=async()=>({jobs:(await db.query('SELECT row_to_json(j) FROM "PrintJob" j')).rows,printers:(await db.query('SELECT row_to_json(p) FROM "Printer" p')).rows});const before=await snapshot();await db.exec(await readFile(resolve('../../prisma/migrations/20261023040000_private_documents/migration.sql'),'utf8'));expect(await snapshot()).toEqual(before);
 for(const role of ['anon','authenticated'])expect((await db.query<any>(`SELECT has_table_privilege('${role}','public."StoredDocument"','SELECT,INSERT,UPDATE,DELETE') AS allowed`)).rows[0].allowed).toBe(false);
 expect((await db.query<any>(`SELECT relrowsecurity FROM pg_class WHERE relname='StoredDocument'`)).rows[0].relrowsecurity).toBe(true);
 }finally{await db.close();}
},20000);
