# Dedicated PrintOS development database

This optional plan was prepared before the user subsequently confirmed the existing
Supabase project is PrintOS-test-only and authorized its migration. That completed
rollout is documented in [local verification](local-verification/README.md).
No separate project or runtime was provisioned by this plan.

## Current state and boundary

Inspection of local configuration confirms the current `apps/web/.env` targets a
remote Supabase direct connection on port 5432. No separate migration/shadow URL is
configured. Its development-only status is not established. Treat that existing
project as protected: no migrations, seeding, schema pulls, copies or further data
queries target it during this setup. No credentials are reproduced here.

Use a **new, empty Supabase project**, `printos-dev`, rather than restoring/cloning
any existing database. This is a remote development database serving a local app;
it is not an on-machine PostgreSQL instance. No data-bearing branch or production
backup is needed. Docker/PostgreSQL/Supabase CLI are not installed in this environment,
so a separate hosted project avoids those local setup requirements.

## Create the new project

1. Sign into the Supabase dashboard and select the intended organization.
2. Choose New project and name it `printos-dev`. Select a nearby supported region;
   review the plan/quota/cost displayed before creating it.
3. Choose a new database password and save it in a password manager. Do not reuse
   the existing project's password or paste credentials into chat.
4. Wait for provisioning. Do not import customer records, upload documents, restore
   a backup or change settings on the protected existing project.
5. In the NEW project, click Connect and select Session pooler, port **5432**.
   Copy its actual supplied hostname; do not infer the host from the region.
   Session mode is the simplest single connection for the current Prisma 5 setup
   and supports IPv4 networks and migrations. A direct port-5432 connection is an
   alternative if IPv6 connectivity is available. Do not use transaction port 6543
   for this initial migration setup.
6. Record the new project reference (not a password). Verify it is different from
   the protected project's reference, even if both session URLs share a pooler host.

Sources: [Supabase project creation](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs),
[connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Prisma/session migration guidance](https://supabase.com/kb/troubleshooting/prisma-error-management-Cm5P_o).

No external creation or changes have been performed by Codex. The Supabase integration
is available but not installed/connected in this session. You may install it for
assisted provisioning, or use the dashboard. Organization/region/plan and the target
project must be confirmed before Codex makes external changes.

## Isolated local configuration

Do NOT replace, edit or copy the existing `apps/web/.env`. The protected connection
and existing secrets remain intact.

1. Create the ignored `.printos-dev` directory with private permissions.
2. Copy `apps/web/config/printos-development.env.example` to `.printos-dev/.env`.
   Make this new file readable/writable by your local account only (mode 0600).
3. In that NEW file, enter the new project reference and connection URI with
   `sslmode=require`. URL-encode the new password where necessary. These values are
   server-side only; never give a database password a NEXT_PUBLIC prefix.
4. Create new development-only OWNER_PASSWORD_HASH and SESSION_SECRET values using
   the existing password-hash helper and a cryptographic random generator. Do not
   reuse/rotate/change the protected environment's secrets. Do not place raw passwords
   or tokens in terminal history, logs or source control.
5. Leave all agent credentials disabled (`AGENT_CREDENTIALS_JSON=[]`, other agent
   variables empty). No real print agent is started.
6. `node apps/web/scripts/prepare-development.mjs` validates the target and prepares
   `.printos-dev/web`. This is local preparation only, with **no database requests**.
   It copies current app/lib code and build config, not old .env files, documents,
   backups or diagnostic scripts that read historical snapshots. The upload directory
   is separate and initially empty.

The guard refuses the protected project across both direct and pooler URL forms,
requires an explicit development marker and exact expected project reference, uses
TLS, rejects port 6543, and disallows additional DIRECT_URL/SHADOW_DATABASE_URL targets.
It also refuses shared authentication secrets or enabled agent credentials.
This is defense in depth, not proof of the project's ownership/purpose: the user
must identify and authorize the new dedicated project before external operations.

The launch command, after migration approval and setup, is:

```sh
node apps/web/scripts/start-development.mjs
```

It explicitly overrides inherited database/auth variables and starts the copied app
from its isolated working directory. Do not use the original `npm run dev` command:
that still targets the protected config. Stop the old local web process before
claiming port 3001 for the new development runtime. Source edits require re-running
preparation/restarting this copied runtime. Original dependencies are reused locally;
no customer files or actual environment secrets are copied.

## Migration and seeding — only after confirmation

Before running ANY external write:

1. Read the new config locally without printing it. Confirm the actual target
   reference matches the new dedicated project and differs from the protected one.
2. Ask for explicit approval to migrate and seed that exact new project. Do not
   interpret the earlier local-only migration approval as authorization for any
   remote project. Approval for the old database is revoked.
3. Read only the NEW database's metadata to confirm PrintOS tables/migration history
   are empty; stop if unexpected data/schema is found. This setup never resets an
   existing database.
4. Execute the three repository migrations against the new URL only: init,
   approval_flow, reliable_attempts. Use `prisma migrate deploy`, not reset/db push
   or a production clone. The current schema requires all three on an empty project.
   Pass the verified URL explicitly to the Prisma child process, run from the private
   runtime, and use the repository's exact schema path. Never run the original
   convenience `prisma:deploy`/`seed:printer` scripts from the protected web directory.
   No shadow database or directUrl schema change is required for this setup.
5. Generate the Prisma client, then verify the NEW migration ledger and expected
   tables/columns. Do not query the protected project for comparison or copy its data.
6. Seed only generated sample data in the new database. Seed logic must refuse
   unexpected preexisting records and must not delete/overwrite existing rows.

Proposed safe seed set, to implement/run after target confirmation:

- One clearly named development printer, simulationOnly=true; no hardware association.
- Two pending review jobs, two completed accounting examples, one failed and one
  rejected request. No APPROVED, DOWNLOADING or PRINTING seed jobs.
- Generate a new PDF titled "PRINTOS DEVELOPMENT SAMPLE — SYNTHETIC DATA" directly
  inside the isolated upload directory; do not read any original PDFs or backups.
- Use the existing quote function and parsed generated page count for prices; include
  copies, BW/colour, duplex and a selected range. The completed accounting fixtures
  represent synthetic database examples, not mock-adapter output; document this
  distinction so report filtering is verified honestly. Agent-produced simulations
  remain excluded from business totals.
- No real emails, names, customer sessions, payment references, printer addresses,
  original job IDs or customer documents. Generate fresh development identifiers.

The seeding task is a deliberate development DB write, not a live print submission.
It remains subject to explicit approval. Never start an agent to populate reports.

## Verification and isolation practices

After the new DB is configured/migrated/seeded, verify Overview, Jobs, Reports and
owner preview at desktop/mobile widths using the NEW database. Test quote APIs with
generated PDFs; intercept/mock approval/rejection writes as needed rather than
triggering physical processing. Capture screenshots labeled synthetic development
records. Run unit tests, typechecks, build and guard tests. Preserve all protected
project records and historical prices by never accessing/mutating that project.

Keep development/production project references, database passwords, owner/session
secrets, upload storage, migration approval and hosting environment scopes separate.
Do not put production credentials into local development or CI test jobs. Keep
migration credentials server-side; use restricted application roles when preparing
production access. Do not expose Prisma-created tables to anonymous Supabase APIs;
review API/RLS exposure separately before any internet-facing use. A project label
alone is not access isolation.

Until setup is approved/configured, the current database-dependent page failures
remain blocked; no successful migrated screenshots or seed results are claimed.
