# Local application verification — completed

The actual app runs at `http://localhost:3001`, using Supabase project
`xkqetjzplwusogbrilja`. The user confirmed it is PrintOS-test-only and authorized the
reviewed Phase 2A migration. This superseded the separate-project plan. No production
deployment, new cloud project, agent startup or live job submission occurred.

## Confirmed causes and fixes

- **Schema mismatch:** connectivity succeeded, but only init/approval_flow were
  applied. Actual browser/Prisma errors showed missing PrintJob.simulation on
  Overview/Reports and PrintJob.attemptId on Jobs. Printer.simulationOnly and
  AgentHealth were absent too. The authorized Phase 2A migration resolves these.
- **Dev/build output collision:** the existing Next log contained missing `.next`
  files and webpack cache failures. Development/build shared that directory. The
  necessary Jobs CSS rules already existed; no missing selector was established.
  Dev now uses `.next-dev`, production build/start uses `.next`, and the server was
  restarted. Real browser checks confirm the filter/table/mobile-card styles apply,
  including while the separate production build runs.
- **Historical zeros:** nine August test jobs actually store price=0/pageCount=null.
  The other job stores 200 paise and has a prior simulation tag. Existing data was
  not repriced. Zero/missing-count amounts are labeled "Legacy amount"; historical
  simulations are visibly labeled even when their printer is not simulation-only.

## Backup and migration

A fresh **full database** custom-format logical backup was made before migration,
using official PostgreSQL 18.6 clients against PostgreSQL 17.6. No PostgreSQL server
was started. The backup covers all schemas, not just the application tables.

Private, Git-ignored directory (0700 directory, 0600 files):
`.printos-backups/2026-10-23T07-25-36.171Z/`

- `database.dump`: 290,363 bytes.
- SHA-256: `226032fd451beb584f986bbcdb8fccee4e1eea1be2f21edb2cd2e77bac3dcbd8`.
- `pg_restore --list` confirmed all application table data; complete read/decompression
  to `/dev/null` validated the archive. This is archive validation, not a claim that
  Supabase-managed objects were restored to another server.
- Private snapshot, manifest, CLI output and `verification.json` remain outside Git.

The project reference, backup hashes, reviewed SQL checksum and unchanged pre-migration
records were checked before applying only `20261023000000_reliable_attempts` through
Prisma migrate deploy. There were no drops/deletes/repricing/status changes. Prisma
Client was regenerated. All three migrations now have successful ledger entries.

The combined script stopped during its post-check after migration/generation had
succeeded. The migration was NOT retried. An independent fresh-process check verified
all ten jobs and the printer retain **every original column value**, including prices,
statuses and timestamps. One new simulation flag identifies the existing tagged mock
job. The helper now uses a separate read-only post-generation verifier.

Repeat the read-only comparison with:
`node apps/web/scripts/verify-test-database.mjs`.
The one-off migration helper intentionally refuses a second rollout.

## Actual-data browser verification

[Machine-readable results](after.json) use real test records, not fixture metrics.

- 18 layouts: Overview, Jobs, Reports at 320, 375, 430, 768, 1024 and 1440px.
- No page errors, missing Next assets or page-level horizontal overflow.
- Filter flex/gap styling, desktop table and mobile cards checked; all ten jobs shown.
- FAILED filter matches the actual five records; manual Refresh works.
- Authenticated job details, available actual owner PDF preview and stored public
  status amount verified. Status credentials are not stored in results/screenshots.
- Anonymous dashboard access redirects to login; job details/preview return 401.
  Owner-session protection was tested; correct-password interactive login was not
  performed with an unknown password. Password verification is unit-tested.
- Five stateless quote API checks with a generated eight-page PDF cover copies,
  colour, duplex, ranges, invalid range (400), invalid PDF (415), and exact integer
  paise totals. Actual customer controls show the matching quote.
- No print-job create/approve/reject/status write reached the database. Mutating
  management behavior is tested using mocks; this historical dataset has no pending
  review jobs, and no new records were created just to exercise those controls.

Current report totals legitimately equal zero: no non-simulated completed jobs fall
within the displayed current periods. The ₹2 October mock job is excluded deliberately.
No artificial revenue, online status or page measurements were added.

## Screenshots

| Page | Desktop | Mobile |
| --- | --- | --- |
| Overview | [1440px](overview-1440.png) | [375px](overview-375.png) |
| Print Jobs | [1440px](jobs-1440.png) | [375px](jobs-375.png) |
| Reports | [1440px](reports-1440.png) | [375px](reports-375.png) |

`before.json` and the before screenshots preserve the pre-migration failures.
The development server is left running on loopback port 3001, with credentials intact.

## Remaining limitations

Four old failed jobs have no stored local PDF. No replacement documents were invented;
the available actual preview was verified. Physical printing and Windows support remain
unverified. Prior dependency advisories remain separate production-release blockers.
Historical zero prices are intentionally unchanged. No secrets, agent configuration,
production records, commits or pushes were changed.

## Final automated checks

- 109 web tests across 16 files passed.
- 45 agent tests passed using mocked cloud/printer transports only.
- Web and agent TypeScript checks passed; web and agent builds passed.
- `git diff --check` passed.
- The guarded independent preservation check was repeated after browser testing.
