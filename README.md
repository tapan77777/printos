# PrintOS — V0 (Phase 1: owner-approval workflow)

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

**What "COMPLETED" means here:** the agent captured the CUPS job id from
`lp`'s stdout and then watched `lpstat -o` until the job left the queue and
`lpstat -W completed -o` reported it finished. If CUPS never confirms
completion within `CUPS_COMPLETION_TIMEOUT_SEC` (default 300 s), the job is
marked `FAILED` with an "unverified completion" error — we never mark a job
`COMPLETED` just because `lp` returned 0.

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
  or queue.
- Claims are leased (`claimedAt` + `claimExpiresAt`). A second agent cannot
  double-print the same job while the lease is live.

## Known gaps (not addressed in Phase 1)

- No payment gateway. Dev mode marks every job `paymentStatus=NOT_REQUIRED`.
- No automated page-count extraction from the PDF yet (price multiplier uses
  the PDF page count only if the owner records it manually).
- No printer-online heartbeat write-back (agent only logs; `Printer.status`
  is not updated by the agent yet).
- `tmp-uploads/` is cleaned only when a job is `FAILED` mid-flight by the
  agent; completed-job cleanup is not yet scheduled.
- No audit log of owner approvals/rejections beyond the fields on `PrintJob`.
- `apps/` has its own nested `.git` — pick one canonical repo before pushing.

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
