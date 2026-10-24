# Phase 2E.1 — approval packet for the existing Supabase test project

**Post-approval update:** the exact atomic proposal was subsequently approved, applied and verified on this test project. See [the final migration report](phase-2e1-final-report.md).

The remainder of this packet records the pre-execution review and backup state.
No secrets, historical records, pricing values or printer records were modified. No application
was deployed/restarted, no account/shop was created in Supabase, and no real agent was started.

## Verified target and baseline

- Project reference: `xkqetjzplwusogbrilja` (the test-only project previously confirmed by the owner).
- Direct endpoint: `db.xkqetjzplwusogbrilja.supabase.co:5432`, database `postgres`.
- Server: PostgreSQL 17.6; TLS confirmed by the active database session.
- Configured connection role: `postgres`; connection credentials were not displayed.
- Only `.env` supplies a local database URL; no conflicting development override was found.
- Applied migrations: `20260813082625_init`, `20261013000000_approval_flow`,
  `20261023000000_reliable_attempts`. All completed, with checksums matching repository SQL.
- 10 jobs, 1 printer, 0 agent-health rows, and 0 downloading/printing/reconciliation attempts.
- No Phase 2E account/shop tables or `shopId` columns exist yet.
- Restoring the application schema locally and comparing columns, defaults, constraints,
  indexes and enums against replayed Phase 2A migrations found no application schema drift.

These checks identify the configured test database; they do not infer a Supabase dashboard
project display name or inspect another project.

## Fresh backup and validation

Private backup directory:
`.printos-backups/2026-10-23T15-28-01.391Z-phase2e1/`

- Database archive: `database.dump`, 293,272 bytes.
- SHA-256: `5725fd2939f60dd072d52af5c12374949bf4df7edbe82486f62afba08f0c1b26`.
- Created at `2026-10-23T15:28:01.392Z` using an exported repeatable-read snapshot shared
  by the logical dump and the baseline record capture.
- Full custom-format archive listing checked; all archive data decompressed successfully.
- Application/public schema restored into a fresh private local PostgreSQL cluster with
  no TCP listener. All restored jobs, printers, health rows and migration history matched
  the captured baseline, field for field.
- The local cluster was stopped and removed. No PDF document files were copied.
- Backup directories are mode 0700; archive, baseline rows and private reports are mode 0600
  and gitignored. No raw application rows or credentials appear in this approval packet.

Scope: a full logical database archive, excluding cluster roles/ownership grants. The restore
exercise covers the application/public schema. Supabase-managed platform schemas/roles were
not restored locally, and uploaded PDF files/object bytes are not part of this database backup.
This is not a claim of a complete Supabase platform/storage disaster-recovery rehearsal.

## Required correction discovered during review

Actual catalog inspection found that all four existing PrintOS public tables have RLS disabled
and `anon`/`authenticated` hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE and other grants. The
project's default privileges would grant those roles access to newly created public tables,
including `Session` and `Account`. This must be corrected before the new authentication tables
are committed. The application-level membership checks cannot protect a separate Data API path.

No REST exploit was attempted, no anonymous data was downloaded and no privileges were changed.
The finding is based on the database's actual grants/default privileges. Supabase documents
[grants and RLS for exposed schemas](https://supabase.com/docs/guides/api/securing-your-api).

The original reviewed migration remains unchanged. A separate hardening proposal and an
atomic combined proposal were prepared; both are readable SQL in this directory.

| Artifact | SHA-256 |
| --- | --- |
| Original `20261023010000_tenant_accounts/migration.sql` | `8292cd25efc29a07927ae88861f0943f7a1e80e9729e83927fee7dcc13d95363` |
| `phase-2e1-supabase-lockdown.sql` | `569df1e0d28d2f20472af955ad17ccb10298d84501ac43a08dca9562917c72ba` |
| **Proposed final atomic migration: `phase-2e1-atomic-proposal.sql`** | **`dfaea87c193b9b6349a9252a2a17ed10feb6cfda1f2223e4b4da8e1cb3f7f3af`** |

**Approval must identify the atomic proposal, not authorize the original SQL alone.**
If approved, the pending migration file will be replaced with the atomic proposal's exact
bytes before Prisma applies it. It will remain one tracked migration, with the revised
checksum recorded by Prisma. This replacement has not been made yet. Existing applied
migration files/checksums are not changed.

## Exact proposed changes

The atomic proposal wraps the following SQL in BEGIN/COMMIT, with a 10-second lock timeout
and 60-second statement timeout. A failure rolls back its schema/permission changes; it must
not be followed by an automatic retry or manual "resolve" without checking the actual state.

1. Add nullable `shopId` columns to `Printer` and `PrintJob`, with shop foreign keys/indexes.
   Existing values become NULL; no records are assigned, repriced or deleted.
2. Create eight empty tables: `User`, `Session`, `Account`, `Verification`, `RateLimit`,
   `Shop`, `ShopMembership`, `ShopInvitation`. Create 14 explicit indexes and eight foreign
   keys, plus their primary keys.
3. Create two functions/triggers that prohibit changing printer tenant identity, changing a
   job's tenant/printer, or inserting a job whose scope differs from its printer. Add the
   membership role constraint allowing only `owner` and `staff`.
4. Enable RLS on the eight new and four existing PrintOS tables, including `_prisma_migrations`.
   Do not FORCE RLS; the verified server/table-owner role retains access.
5. Revoke table privileges from PUBLIC and the Supabase `anon`/`authenticated` roles for
   those 12 tables. Add no API policies: access must pass through authorized Next.js APIs.
6. Revoke PUBLIC/anon/authenticated execution of the two trigger functions. Do not change
   role definitions, service-role grants, project-wide default privileges, other schemas,
   Supabase Auth users or storage configuration.
7. Prisma records completion/checksum in `_prisma_migrations` after the approved SQL runs;
   that ledger entry is the only expected data write outside creation of empty schema objects.

There are no DROP/TRUNCATE/DELETE statements, historical UPDATEs, secret changes, price
calculations or printing commands. REVOKE deliberately changes API access permissions;
that is a security behavior change, not historical data deletion. The app uses the direct
server database connection, not browser Supabase table access. Any separate integration
using anon/authenticated directly would intentionally lose access and must be reviewed.

## Local rehearsal results

The atomic proposal ran only against the restored private local copy, after simulating this
project's Supabase grants/default privileges. Results:

- All 10 original jobs and the printer retained every preexisting field/value.
- All original `shopId` additions remained NULL; no account/shop was seeded.
- All 12 tables had RLS enabled and no direct anon/authenticated table grants remained.
- 24 SELECT-denial checks passed (both API roles across all 12 tables).
- RLS still returned zero rows after deliberately re-granting SELECT on a fixture table;
  that temporary re-grant occurred only locally and was removed locally.
- Server/table-owner access and the simulated service-role grant were preserved.

The first local post-DDL verification hit PostgreSQL's cached prepared-result shape after
adding columns. The validator was corrected to reconnect before comparing records; the full
repeat rehearsal passed. No failed rehearsal involved Supabase writes. These checks validate
SQL/permissions in PostgreSQL, not a live Supabase REST/GraphQL request after deployment.

## Historical records and owner authentication

The migration itself creates no accounts, sends no emails, changes no existing passwords and
assigns no historical records to a shop. The 10 jobs and printer remain stored under NULL
scope. The new app will not show them in a newly created shop. Automatic adoption would weaken
isolation and is not included; a later separately approved data-adoption plan would be required.

Under Phase 2E.1 application code, the former shared owner password/HMAC cookie is retired.
Users need individual verified Better Auth accounts, a shop membership, and an active shop.
Staff have scoped operational access; only owners manage printers/memberships and reconcile
uncertain output. Existing authentication secrets remain untouched, but no longer grant access
to the new account system.

The local `.env` currently lacks the new mode, auth URL/secret and email-provider configuration:
`PRINTOS_AUTH_MODE=tenant`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
`AUTH_EMAIL_FROM`. Account registration/login therefore cannot be declared operational after
DDL alone. Configuration, email verification, operator registration and a new shop must be
handled separately; this approval does **not** authorize changing secrets, deploying/restarting
the app or creating accounts. The current running app's auth behavior is not changed by this
preparation, and no application process was restarted.

Tenant mode also rejects legacy global agent credentials. New pairing/live activation remains
unfinished. No agent or automatic printing will be enabled by the migration.

## Actions after explicit final approval only

1. Reconfirm this same project, unchanged rows/ledger and zero active attempts. Refresh the
   backup if it has aged or anything changed. Stop if schema/data drift or another pending
   migration appears; do not silently broaden approval.
2. Verify the approved atomic hash, replace only the still-pending Phase 2E.1 migration with
   those exact bytes, and confirm it is the sole pending migration.
3. Apply that tracked migration to this test project only. No app deployment, secrets, seeds
   or real printing. Abort on lock/error; inspect before any retry.
4. Regenerate Prisma Client locally. Compare every original job/printer field to the backup,
   verify the expected new NULL scopes and ledger/checksum, and check server access plus
   effective anon/authenticated privileges/RLS.
5. Leave authentication setup and historical data adoption as explicit separate work. Do not
   claim the owner dashboard is ready until the new account configuration is completed.

Rollback: retain additive tables/data and use maintenance mode or a tenant-safe application
build. Do not roll back to an unscoped app or drop account tables. Restoring a backup is a
separate destructive action requiring approval. Re-enabling anonymous table access is not
an acceptable rollback shortcut.

## Requested final approval

Approve replacing the pending Phase 2E.1 migration with the exact atomic proposal (SHA-256
`dfaea87c193b9b6349a9252a2a17ed10feb6cfda1f2223e4b4da8e1cb3f7f3af`) and applying it **only**
to Supabase test project `xkqetjzplwusogbrilja`, followed by client generation and read-only
preservation/security verification. Exclude deployment, secrets, account creation, record
adoption, printing, commits and pushes.
