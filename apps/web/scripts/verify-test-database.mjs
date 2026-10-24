// Read-only verification in a fresh process after Prisma Client generation.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "../..");
let prisma;
try {
  const config = parseEnv(await readFile(path.join(web, ".env"), "utf8"));
  const reference = "xkqetjzplwusogbrilja";
  if (new URL(config.DATABASE_URL).hostname !== `db.${reference}.supabase.co`) throw new Error("TARGET_MISMATCH");
  const pointer = JSON.parse(await readFile(path.join(root, ".printos-backups/latest.json"), "utf8"));
  const folder = path.resolve(pointer.folder);
  if (!folder.startsWith(path.join(root, ".printos-backups") + path.sep)) throw new Error("INVALID_BACKUP_LOCATION");
  const manifest = JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8"));
  if (!manifest.complete || !manifest.archiveValidated || manifest.projectRef !== reference) throw new Error("VALIDATED_BACKUP_REQUIRED");
  const bytes = await readFile(path.join(folder, "before-records.json"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.snapshotSha256);
  const before = JSON.parse(bytes.toString());
  prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } }, log: [] });
  const normalize = value => JSON.parse(JSON.stringify(value));
  const jobs = normalize(await prisma.$queryRawUnsafe('SELECT * FROM "PrintJob" ORDER BY id'));
  const printers = normalize(await prisma.$queryRawUnsafe('SELECT * FROM "Printer" ORDER BY id'));
  for (const [original, current] of [[before.jobs, jobs], [before.printers, printers]]) {
    assert.equal(current.length, original.length);
    for (const row of original) {
      const next = current.find(item => item.id === row.id); assert.ok(next);
      for (const key of Object.keys(row)) assert.deepEqual(next[key], row[key], `Original field changed: ${key}`);
    }
  }
  const ledger = await prisma.$queryRawUnsafe('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  assert.deepEqual(ledger.map(row => row.migration_name), ["20260813082625_init", "20261013000000_approval_flow", "20261023000000_reliable_attempts"]);
  assert.ok(ledger.every(row => row.finished_at && !row.rolled_back_at));
  const result = { projectRef: reference, migrationApplied: "20261023000000_reliable_attempts", prismaRegenerated: true, jobsPreserved: jobs.length, printersPreserved: printers.length, allOriginalFieldsUnchanged: true, pricesUnchanged: true, statusesUnchanged: true, taggedSimulationJobs: jobs.filter(row => row.simulation).length };
  await writeFile(path.join(folder, "verification.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
} catch { console.error("READ_ONLY_PRESERVATION_CHECK_FAILED; inspect privately before further database actions"); process.exitCode = 1; }
finally { await prisma?.$disconnect(); }
