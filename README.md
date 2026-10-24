
Phase 2C adds a Windows adapter with explicit queue selection and conservative spooler
reconciliation. See [Windows setup, limitations and physical acceptance](docs/phase-2c.md).
Windows execution and physical printing remain unverified; do not enable unattended use
until the checklist passes.
# PrintOS — owner-approved printing

Phase 2E.1 adds verified accounts, shops/memberships, tenant authorization and tested
Next.js/security upgrades. See [the staged implementation and exact migration rollout](docs/phase-2e.md).
The approved atomic migration is applied to the confirmed Supabase test project; see the
[verification report](docs/rollout/phase-2e1-final-report.md). Global owner login is retired;
new authentication configuration remains pending.
Device pairing, shop rate cards and live desktop activation remain separate pending stages.

Phase 2D adds an Electron desktop workspace with cloud dashboard access, local printer
setup and isolated no-print diagnostics. See [desktop setup and release gates](docs/phase-2d.md).
The unsigned Windows x64 installer has been cross-built and statically inspected on macOS;
Windows execution and secure device pairing remain pending. Real desktop printing is disabled.

Phase 2A adds a fenced, journaled printing engine. **Read [the rollout and recovery
protocol](docs/phase-2a.md) before starting or upgrading an agent.** The additive
migration is not deployed by development or tests. Existing unscoped agents are
deliberately denied; server, migration and agent require a coordinated rollout.

Self-service printing for existing shops. Customer scans a QR for the shop's
printer, uploads a PDF, picks options, and submits the job. The shop owner
reviews the job in the dashboard and clicks **Accept & Print** before the
local agent sends it to the physical printer.

## Repo layout

```
printos/
├── apps/
│   ├── web/      # Next.js customer + owner app (frontend + API routes)
│   └── agent/    # Local Node agent — bearer-authenticated, calls CUPS `lp`
├── prisma/       # Postgres schema + migrations
└── docs/
```

## One-time setup

1. **Install deps**

   ```sh
   cd apps/web && npm install
   cd ../agent && npm install
   ```

2. **Create a Postgres database** (Supabase/Neon/local) and set `DATABASE_URL`.

3. **Fill `apps/web/.env`** (template in `.env.example`):

   ```sh
   # From apps/web
   OWNER_PASSWORD_HASH=$(node scripts/hash-password.mjs 'your-password-here')
   # Returns something like scrypt$...$...  — paste it into .env

   # Random secret for signing session cookies
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # paste into SESSION_SECRET

   # Random bearer token for the local agent
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   # paste into AGENT_TOKEN (also into apps/agent/.env)
   ```

4. **Run the DB migration**

   ```sh
   cd apps/web && npm run prisma:deploy
   ```

5. **Register your printer**

   Find the CUPS printer name on the laptop that will drive the printer:

   ```sh
   lpstat -p
   ```

   Pick a deviceId (any string — this is also what the QR code encodes), then:

   ```sh
   cd apps/web
   npm run seed:printer -- SHOP-001 "Front Counter" "Mumbai"
   ```

6. **Fill `apps/agent/.env`**

   ```
   CUPS_PRINTER_NAME=<the name shown by `lpstat -p`>
   PRINTOS_CLOUD_URL=http://localhost:3000
   DEVICE_ID=SHOP-001        # must match what you seeded
   AGENT_TOKEN=<same value as apps/web/.env AGENT_TOKEN>
   ```

## Running

```sh
# Terminal 1 — the web app
cd apps/web && npm run dev

# Terminal 2 — the local agent (on the laptop attached to the printer)
cd apps/agent && npm run dev
```

- Customer QR URL: `http://localhost:3000/p/SHOP-001`
- Owner login: `http://localhost:3000/login`

## Verifying a real physical print

Preconditions:
- CUPS is working on this laptop. `lpstat -p` shows your printer as **idle**.
- You can print manually: `echo hello | lp -d <CUPS_PRINTER_NAME>`.
- Both `apps/web` and `apps/agent` are running.

Steps:
1. On your phone, open `http://<laptop-ip>:3000/p/SHOP-001`.
2. Upload any PDF ≤ 25 MB, pick copies/colour/paper, tap **Submit for approval**.
3. You land on a status page that polls every ~3 s and shows `QUEUED`.
4. On the laptop, open `http://localhost:3000/dashboard`, sign in, go to **Jobs**.
5. Click **Accept & Print** on the job row.
6. Agent terminal should show:
   `[agent] picking up <jobId>` → `DOWNLOADING` → `PRINTING` → `COMPLETED`.
7. Paper should come out of the printer.
8. Phone status page should transition `APPROVED → PRINTING → COMPLETED`.

**What "COMPLETED" means:** the CUPS adapter receives structured IPP terminal
state 9 without `job-completed-with-errors`. Cancelled/aborted spool jobs are
failures. Missing history, timeouts and uncertain submissions require
`RECONCILIATION_REQUIRED`, never automatic resubmission. Spooler completion is
not a guarantee that usable paper reached the customer. Real printer acceptance
has not yet been performed.

## State machine

```
QUEUED ──approve──▶ APPROVED ──agent claims──▶ DOWNLOADING ──▶ PRINTING ──▶ COMPLETED
   │                                                                      ▶ FAILED
   └──reject──▶ REJECTED (terminal)
```

- The customer upload endpoint only creates `QUEUED` jobs. It never calls
  the printer.
- The agent only picks up `APPROVED` jobs. It can only transition
  `DOWNLOADING / PRINTING / COMPLETED / FAILED`. It cannot approve, reject,
  or queue. They can report RECONCILIATION_REQUIRED for uncertain outcomes.
- Claims bind an immutable attempt to a scoped agent. The lease gates download
  and submission authorization; expiry never automatically requeues a claimed job.
- A durable local SUBMITTING marker precedes the OS call. Unknown outcomes become
  RECONCILIATION_REQUIRED and are never automatically printed again.

## Known gaps (not addressed in Phase 1)

- No payment gateway. Dev mode marks every job `paymentStatus=NOT_REQUIRED`.
- New uploads now use parsed PDF page counts and normalized page ranges; see
  [Phase 1A](docs/phase-1a.md) for pricing, preview, API compatibility and limits.
- Agent health is written through an authenticated heartbeat. Availability is
  derived with a 45-second freshness window; see Phase 2A for its limits.
- Server `tmp-uploads/` has no scheduled retention cleanup. Failed database
  creation now removes the newly written file; agent cleanup only removes its local copy.
- No audit log of owner approvals/rejections beyond the fields on `PrintJob`.
- No full historical event ledger yet; server stores the last idempotent event
  and the agent archives terminal attempt records locally.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` (in `apps/web`) | Start Next.js dev server |
| `npm run build` | `next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
| `npm test` | Vitest unit tests |
| `npm run prisma:deploy` | Apply migrations (safe for prod) |
| `npm run seed:printer -- <deviceId> <name> [location]` | Register a printer |
| `npm run hash:password -- '<password>'` | Produce an `OWNER_PASSWORD_HASH` |

Phase 2E.2 staged work: see [authentication readiness and secure device enrollment](docs/phase-2e2.md). The new device migration is pending approval; live processing remains blocked. Run `npm run auth:check --prefix apps/web` for a secret-free local configuration report.

Phase 2E.3: [shop rates and immutable quotes](docs/phase-2e3.md) are implemented with a pending additive migration. Do not run the new Prisma job model against the unmigrated Supabase project; follow the documented approval/backup rollout first.

Phase 2E.4: [private cloud PDF storage](docs/phase-2e4.md) adds direct private uploads, authorized downloads and retention. Schema/bucket provisioning is pending approval; no existing PDFs are moved. Use `npm run storage:check --prefix apps/web` for a secret-free configuration check.

Current private-test handoff: [MVP integration, exact rollout commands, Vercel setup and Windows instructions](docs/mvp/README.md). This supersedes earlier diagnostic-only desktop notes. Installer 0.1.1 includes explicit live-agent controls; cloud rollout and actual Windows/physical acceptance remain approval/manual gates.

Deployment readiness: the approved four MVP migrations are now applied to Supabase TEST project `xkqetjzplwusogbrilja`; private Storage provisioning is verified. Earlier pending-migration statements describe historical phase status. Use [the current Vercel checklist](docs/mvp/vercel-deployment.md). Authentication/email/Storage runtime secrets still require manual configuration. Git-triggered Vercel deployments are disabled until separate deployment approval.
