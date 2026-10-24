// Disposable UI review only. Never reads production .env files or connects to a database.
import { cp, mkdir, symlink, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = '/tmp/printos-ui-review';
await mkdir(target, { recursive: true });
for (const name of ['app','lib']) await cp(path.join(root, name), path.join(target, name), { recursive: true });
for (const name of ['package.json','tsconfig.json','tailwind.config.ts','postcss.config.js','next-env.d.ts','middleware.ts']) await cp(path.join(root, name), path.join(target, name));
try { await access(path.join(target, 'node_modules')); } catch { await symlink(path.join(root, 'node_modules'), path.join(target, 'node_modules'), 'dir'); }
await mkdir(path.join(target, 'public'), { recursive: true });
await writeFile(path.join(target, 'public/__ui-review-fixture.json'), JSON.stringify({ fixture: 'printos-ui-review-no-database' }));
await writeFile(path.join(target, '.env'), 'SESSION_SECRET=printos-ui-review-only-not-a-real-session-secret\nDATABASE_URL=postgresql://disabled:disabled@127.0.0.1:1/disabled\n');
await writeFile(path.join(target, 'lib/prisma.ts'), "// UI REVIEW FIXTURE ONLY. No database client is imported or instantiated.\nconst now = new Date(\"2026-10-23T10:30:00Z\");\nconst statuses = [\"QUEUED\", \"QUEUED\", \"PRINTING\", \"COMPLETED\", \"FAILED\", \"REJECTED\"];\nconst jobs = statuses.map((printStatus, i) => ({ id: `review-job-${100001 + i}`, printerId: \"fixture-printer\", printStatus, copies: i % 3 + 1, colorMode: i % 2 ? \"COLOUR\" : \"BW\", paperSize: \"A4\", duplex: i % 2 === 0, pageRange: \"all\", price: [1200, 4500, 1800, 3600, 1500, 2400][i], pageCount: 8 + i, rejectionReason: printStatus === \"REJECTED\" ? \"Please upload a clearer copy of the document.\" : null, agentError: printStatus === \"FAILED\" ? \"Printer connection interrupted. Speak to the shop owner.\" : null, printer: { name: \"Front counter\" }, createdAt: now }));\nfunction blocked() { throw new Error(\"UI review: all mutations are blocked\"); }\nexport const prisma = {\n  printJob: {\n    findMany: async (args: any) => args?.where?.printStatus ? jobs.filter(j => j.printStatus === args.where.printStatus) : jobs,\n    aggregate: async (args: any) => ({ _count: { _all: 24 }, _sum: { price: args?.where?.paymentStatus ? 0 : 18400, pagesPrinted: 136 } }),\n    count: async (args: any) => args?.where?.printStatus === \"QUEUED\" ? 2 : args?.where?.printStatus?.in ? 3 : 1,\n    findUnique: async () => null, create: blocked, update: blocked, updateMany: blocked,\n  },\n  printer: { count: async (args?: any) => args?.where ? 0 : 1, findMany: async () => [], findUnique: async () => null, create: blocked },\n};\n");
console.log('Prepared isolated UI fixture at ' + target + '. All database mutations are blocked.');
