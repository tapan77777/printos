// One explicitly authorized rollout. Requires a validated, fresh backup and exact reviewed SQL.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const exec = promisify(execFile);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "../..");
const reference = "xkqetjzplwusogbrilja";
const migration = "20261023000000_reliable_attempts";
const reviewedHash = "c3a31d12b78224a9495874f98b3e8f96d86054e4e6db2940dfde69f391df71ea";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const normalized = value => JSON.parse(JSON.stringify(value));
let prisma;
try {
  if (!process.argv.includes("--approved-current-test-project")) throw new Error("EXPLICIT_TEST_ROLLOUT_APPROVAL_REQUIRED");
  const config = parseEnv(await readFile(path.join(web, ".env"), "utf8"));
  const url = new URL(config.DATABASE_URL);
  if (url.hostname !== `db.${reference}.supabase.co` || (url.port && url.port !== "5432")) throw new Error("TARGET_MISMATCH");
  const pointer = JSON.parse(await readFile(path.join(root, ".printos-backups/latest.json"), "utf8"));
  const backup = path.resolve(pointer.folder);
  if (!backup.startsWith(path.join(root, ".printos-backups") + path.sep)) throw new Error("INVALID_BACKUP_LOCATION");
  const manifest = JSON.parse(await readFile(path.join(backup, "manifest.json"), "utf8"));
  if (!manifest.complete || !manifest.archiveValidated || manifest.projectRef !== reference || manifest.migrationSha256 !== reviewedHash) throw new Error("VALIDATED_BACKUP_REQUIRED");
  if (hash(await readFile(path.join(backup, "database.dump"))) !== manifest.dumpSha256) throw new Error("BACKUP_DIGEST_MISMATCH");
  const snapshotBytes = await readFile(path.join(backup, "before-records.json"));
  if (hash(snapshotBytes) !== manifest.snapshotSha256) throw new Error("SNAPSHOT_DIGEST_MISMATCH");
  const snapshot = JSON.parse(snapshotBytes.toString());
  if (hash(await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"))) !== reviewedHash) throw new Error("MIGRATION_CHANGED_SINCE_REVIEW");
  prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } }, log: [] });
  const currentJobs = await prisma.$queryRawUnsafe('SELECT * FROM "PrintJob" ORDER BY id');
  const currentPrinters = await prisma.$queryRawUnsafe('SELECT * FROM "Printer" ORDER BY id');
  assert.deepEqual(normalized(currentJobs), snapshot.jobs, "Jobs changed after the backup; stop and review");
  assert.deepEqual(normalized(currentPrinters), snapshot.printers, "Printers changed after the backup; stop and review");
  const ledger = await prisma.$queryRawUnsafe('SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at');
  assert.deepEqual(ledger.map(row => row.migration_name), ["20260813082625_init", "20261013000000_approval_flow"]);
  assert.ok(ledger.every(row => row.finished_at && !row.rolled_back_at));
  const existingNewColumns = await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='PrintJob' AND column_name IN ('attemptId','simulation','submissionAuthorizedAt')");
  assert.equal(existingNewColumns.length, 0, "Unexpected partial Phase 2A schema; stop and review");
  await prisma.$disconnect();
  const env = { ...process.env, DATABASE_URL: config.DATABASE_URL };
  delete env.DIRECT_URL; delete env.SHADOW_DATABASE_URL;
  const result = await exec(process.execPath, [path.join(web, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", path.join(root, "prisma/schema.prisma")], { cwd: web, env, timeout: 180000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(backup, "migration-output.txt"), result.stdout, { mode: 0o600 });
  const generated = await exec(process.execPath, [path.join(web, "node_modules/prisma/build/index.js"), "generate", "--schema", path.join(root, "prisma/schema.prisma")], { cwd: web, env, timeout: 120000, maxBuffer: 1024 * 1024 });
  await writeFile(path.join(backup, "generate-output.txt"), generated.stdout, { mode: 0o600 });
  // Do not reuse a loaded native Prisma engine after its generated files changed.
  // Run all post-migration preservation checks in a fresh read-only process.
  prisma = undefined;
  const verified = await exec(process.execPath, [path.join(web, "scripts/verify-test-database.mjs")], { cwd: web, env, timeout: 120000, maxBuffer: 1024 * 1024 });
  console.log(verified.stdout.trim());
} catch (error) {
  console.error("ROLLOUT_STOPPED; inspect privately before any further database action. " + (error instanceof assert.AssertionError ? "Preservation/schema assertion failed." : "Backup, identity or migration check did not complete."));
  process.exitCode = 1;
} finally { await prisma?.$disconnect(); }
