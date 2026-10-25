import { logAccountFailure } from './authDiagnostic';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { HEALTH_TTL_MS } from './agentHealth';
export function dashboardQuery(shopId: string, today: Date, month: Date, now: Date) {
  return Prisma.sql`WITH totals AS (
    SELECT COUNT(*) FILTER (WHERE "printStatus"='COMPLETED' AND "completedAt">=${today}) AS "todayCount",
      COALESCE(SUM(price) FILTER (WHERE "printStatus"='COMPLETED' AND "completedAt">=${today}),0) AS "todayPrice",
      COALESCE(SUM("pagesPrinted") FILTER (WHERE "printStatus"='COMPLETED' AND "completedAt">=${today}),0) AS "todayPages",
      COALESCE(SUM(price) FILTER (WHERE "printStatus"='COMPLETED' AND "completedAt">=${month}),0) AS "monthPrice",
      COALESCE(SUM(price) FILTER (WHERE "printStatus"='COMPLETED' AND "completedAt">=${today} AND "paymentStatus"='PAID'),0) AS "paidToday",
      COUNT(*) FILTER (WHERE "printStatus"='QUEUED') AS "pendingApproval",
      COUNT(*) FILTER (WHERE "printStatus" IN ('APPROVED','DOWNLOADING','PRINTING')) AS printing
    FROM "PrintJob" WHERE "shopId"=${shopId} AND simulation=false
  ) SELECT totals.*,
    (SELECT COUNT(*) FROM "Printer" WHERE "shopId"=${shopId} AND "simulationOnly"=false) AS "printersTotal",
    (SELECT COUNT(*) FROM "Printer" WHERE "shopId"=${shopId} AND "simulationOnly"=false AND status='ONLINE' AND "lastHeartbeat">=${new Date(now.getTime()-HEALTH_TTL_MS)} AND "lastHeartbeat"<=${now}) AS "printersOnline",
    EXISTS(SELECT 1 FROM "DesktopDevice" WHERE "shopId"=${shopId} AND "revokedAt" IS NULL AND "confirmedAt" IS NOT NULL) AS paired,
    (SELECT metadata FROM "Shop" WHERE id=${shopId}) AS metadata
    FROM totals`;
}
type Row={todayCount:bigint;todayPrice:bigint;todayPages:bigint;monthPrice:bigint;paidToday:bigint;pendingApproval:bigint;printing:bigint;printersTotal:bigint;printersOnline:bigint;paired:boolean;metadata:string|null};
export async function dashboardStats(shopId:string){
 const now=new Date();const today=new Date(now);today.setHours(0,0,0,0);const month=new Date(today);month.setDate(1);
 let row:Row;try{[row]=await prisma.$queryRaw<Row[]>(dashboardQuery(shopId,today,month,now));}catch(error){logAccountFailure("handler",error);throw Error("Dashboard totals are temporarily unavailable");}
 return {today:{_count:{_all:Number(row.todayCount)},_sum:{price:Number(row.todayPrice),pagesPrinted:Number(row.todayPages)}},month:{_sum:{price:Number(row.monthPrice)}},paidToday:Number(row.paidToday),pendingApproval:Number(row.pendingApproval),printing:Number(row.printing),printersTotal:Number(row.printersTotal),printersOnline:Number(row.printersOnline),paired:row.paired,metadata:row.metadata};
}
