// Authorized test-project backup. No schema/data mutations. Credentials never enter argv/log output.
import { readFile, writeFile, mkdir, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const exec = promisify(execFile);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "../..");
const projectRef = "xkqetjzplwusogbrilja";
const reviewedHash = "c3a31d12b78224a9495874f98b3e8f96d86054e4e6db2940dfde69f391df71ea";
let prisma;
try {
  const config = parseEnv(await readFile(path.join(web, ".env"), "utf8"));
  const url = new URL(config.DATABASE_URL);
  if (url.hostname !== `db.${projectRef}.supabase.co` || (url.port && url.port !== "5432")) throw new Error("TEST_PROJECT_IDENTITY_MISMATCH");
  const migration = await readFile(path.join(root, "prisma/migrations/20261023000000_reliable_attempts/migration.sql"));
  if (createHash("sha256").update(migration).digest("hex") !== reviewedHash) throw new Error("REVIEWED_MIGRATION_CHANGED");
  const bin = process.env.PRINTOS_PG_BIN;
  if (!bin) throw new Error("BACKUP_CLIENT_REQUIRED");
  const folder = path.join(root, ".printos-backups", new Date().toISOString().replaceAll(":", "-"));
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(path.dirname(folder), 0o700); await chmod(folder, 0o700);
  prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } }, log: [] });
  const jobs = await prisma.$queryRawUnsafe('SELECT * FROM "PrintJob" ORDER BY id');
  const printers = await prisma.$queryRawUnsafe('SELECT * FROM "Printer" ORDER BY id');
  const migrations = await prisma.$queryRawUnsafe('SELECT * FROM "_prisma_migrations" ORDER BY started_at');
  const snapshot = JSON.stringify({ jobs, printers, migrations });
  await writeFile(path.join(folder, "before-records.json"), snapshot, { mode: 0o600 });
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" };
  const dump = path.join(folder, "database.dump");
  const manifest = { projectRef, migrationSha256: reviewedHash, complete: false, snapshotSha256: createHash("sha256").update(snapshot).digest("hex"), jobs: jobs.length, printers: printers.length };
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  // Full database logical backup (not merely the public schema). No roles/cluster changes.
  await exec(path.join(bin, "pg_dump"), ["--format=custom", "--no-owner", "--no-privileges", `--file=${dump}`], { env, timeout: 180000, maxBuffer: 1024 * 1024 });
  await chmod(dump, 0o600);
  const listing = await exec(path.join(bin, "pg_restore"), ["--list", dump], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  for (const table of ["PrintJob", "Printer", "_prisma_migrations"]) if (!listing.stdout.includes(`TABLE DATA public ${table} `)) throw new Error("BACKUP_APPLICATION_TABLE_MISSING");
  // Read/decompress the full archive without connecting anywhere or restoring data.
  await exec(path.join(bin, "pg_restore"), ["--no-owner", "--no-privileges", "--file=/dev/null", dump], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const bytes = await readFile(dump); if (bytes.length < 1024) throw new Error("BACKUP_ARCHIVE_TOO_SMALL");
  await writeFile(path.join(folder, "archive-list.txt"), listing.stdout, { mode: 0o600 });
  Object.assign(manifest, { complete: true, dumpSha256: createHash("sha256").update(bytes).digest("hex"), bytes: (await stat(dump)).size, archiveValidated: true });
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await writeFile(path.join(root, ".printos-backups/latest.json"), JSON.stringify({ folder }), { mode: 0o600 });
  console.log(JSON.stringify({ backupComplete: true, projectRef, folder, jobs: jobs.length, printers: printers.length, bytes: manifest.bytes, archiveValidated: true, sha256: manifest.dumpSha256 }));
} catch (error) {
  // Do not print subprocess errors: they can contain connection details/paths.
  console.error("BACKUP_DID_NOT_COMPLETE; migration must not run. No database changes made.");
  process.exitCode = 1;
} finally { await prisma?.$disconnect(); }
