import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

it("additive migration preserves legacy records and enforces PostgreSQL CAS/unique attempt guards", async () => {
  const db = new PGlite();
  try {
    for (const file of ["20260813082625_init", "20261013000000_approval_flow"]) await db.exec(await readFile(resolve("../../prisma/migrations", file, "migration.sql"), "utf8"));
    await db.exec(`INSERT INTO "Printer" (id,name,"deviceId","updatedAt") VALUES ('p','Fixture','BOX',now());
      INSERT INTO "PrintJob" (id,"printerId","fileId","customerSessionId",price,"pageCount","printStatus") VALUES ('legacy','p','legacy.pdf','legacy-session',1500,10,'COMPLETED');`);
    await db.exec(`INSERT INTO "PrintJob" (id,"printerId","fileId","customerSessionId","cupsJobId","claimedBy","printStatus") VALUES ('sim','p','sim.pdf','sim-session','SIM-prior','sim-BOX','COMPLETED');`);
    await db.exec(await readFile(resolve("../../prisma/migrations/20261023000000_reliable_attempts/migration.sql"), "utf8"));
    expect((await db.query<any>(`SELECT simulation FROM "PrintJob" WHERE id='sim'`)).rows[0].simulation).toBe(true);
    const old = (await db.query<any>(`SELECT price,"pageCount","attemptId",simulation FROM "PrintJob" WHERE id='legacy'`)).rows[0];
    expect(old).toEqual({ price: 1500, pageCount: 10, attemptId: null, simulation: false });
    await db.exec(`INSERT INTO "PrintJob" (id,"printerId","fileId","customerSessionId","printStatus") VALUES ('new','p','new.pdf','new-session','APPROVED');`);
    const claim = (attempt: string) => db.query(`UPDATE "PrintJob" SET "attemptId"=$1,"claimedBy"='agent',"claimedAt"=now(),"printStatus"='DOWNLOADING' WHERE id='new' AND "printStatus"='APPROVED' AND "attemptId" IS NULL AND "claimedAt" IS NULL RETURNING id`, [attempt]);
    const results = await Promise.all([claim("attempt-a"), claim("attempt-b")]);
    expect(results.reduce((sum, result) => sum + result.rows.length, 0)).toBe(1);
    await db.exec(`UPDATE "PrintJob" SET "printStatus"='RECONCILIATION_REQUIRED' WHERE id='new';`);
    expect((await db.query<any>(`SELECT "printStatus" FROM "PrintJob" WHERE id='new'`)).rows[0].printStatus).toBe("RECONCILIATION_REQUIRED");
    const attempt = (await db.query<any>(`SELECT "attemptId" FROM "PrintJob" WHERE id='new'`)).rows[0].attemptId;
    await expect(db.query(`UPDATE "PrintJob" SET "attemptId"=$1 WHERE id='legacy'`, [attempt])).rejects.toThrow();
    await db.exec(`INSERT INTO "AgentHealth" ("agentId","printerId",version,"operatingSystem",mode,"processingState","printerAvailable","lastHeartbeat") VALUES ('test-agent','p','0.2.0','win32','mock','IDLE',true,now());`);
    expect((await db.query<any>(`SELECT "operatingSystem" FROM "AgentHealth"`)).rows[0].operatingSystem).toBe("win32");
  } finally { await db.close(); }
}, 20000);
