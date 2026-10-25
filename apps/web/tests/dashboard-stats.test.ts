import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {dashboardQuery} from '../lib/dashboardStats';
it('aggregates only the active shop, excludes simulation, preserves paid/date filters and counts fresh printers',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "PrintJob" ("shopId" text,simulation boolean,"printStatus" text,"completedAt" timestamp,price integer,"pagesPrinted" integer,"paymentStatus" text);
 CREATE TABLE "Printer" ("shopId" text,"simulationOnly" boolean,status text,"lastHeartbeat" timestamp);
 CREATE TABLE "DesktopDevice" ("shopId" text,"revokedAt" timestamp,"confirmedAt" timestamp);
 CREATE TABLE "Shop" (id text,metadata text);
 INSERT INTO "Shop" VALUES ('a','{"printos":{"orderingEnabled":false}}');
 INSERT INTO "PrintJob" VALUES ('a',false,'COMPLETED','2026-10-24T10:00',200,2,'PAID'),('a',false,'COMPLETED','2026-10-23T10:00',300,3,'PAID'),('a',false,'COMPLETED','2026-09-23T10:00',400,4,'PAID'),('a',false,'COMPLETED','2026-10-24T10:00',100,1,'NOT_REQUIRED'),('a',true,'COMPLETED','2026-10-24T10:00',900,9,'PAID'),('b',false,'COMPLETED','2026-10-24T10:00',900,9,'PAID'),('a',false,'QUEUED',null,20,null,'NOT_REQUIRED'),('a',false,'APPROVED',null,20,null,'NOT_REQUIRED');
 INSERT INTO "Printer" VALUES ('a',false,'ONLINE','2026-10-24T12:00:00'),('a',false,'ONLINE','2026-10-24T10:00:00'),('a',true,'ONLINE','2026-10-24T12:00:00'),('b',false,'ONLINE','2026-10-24T12:00:00');
 INSERT INTO "DesktopDevice" VALUES ('a',null,'2026-10-24T10:00');`);
 const query=dashboardQuery('a',new Date('2026-10-24T00:00Z'),new Date('2026-10-01T00:00Z'),new Date('2026-10-24T12:00:05Z'));
 const result=await db.query<any>(query.text,query.values);
 expect(result.rows[0]).toMatchObject({todayCount:2,todayPrice:300,todayPages:3,monthPrice:600,paidToday:200,pendingApproval:1,printing:1,printersTotal:2,printersOnline:1,paired:true});
 const other=dashboardQuery('absent',new Date('2026-10-24T00:00Z'),new Date('2026-10-01T00:00Z'),new Date('2026-10-24T12:00:05Z'));
 expect((await db.query<any>(other.text,other.values)).rows[0]).toMatchObject({todayCount:0,todayPrice:0,printersTotal:0,paired:false});
 }finally{await db.close();}
},20000);
