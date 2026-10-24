# Phase 2E.1 migration — applied and verified

The exact atomic SQL approved by the user was applied **only** to Supabase test project
`xkqetjzplwusogbrilja`, database `postgres`, over TLS. No application was deployed/restarted,
no secrets changed, no real accounts/shops created, no historical records assigned,
no printing started, and no commit/push performed.

## Applied migration

- Name: `20261023010000_tenant_accounts`.
- Recorded completion: **2026-10-23 15:49:08.162 UTC** (21:19:08.162 IST).
- SHA-256: `dfaea87c193b9b6349a9252a2a17ed10feb6cfda1f2223e4b4da8e1cb3f7f3af`.
- The pending migration file was replaced with the exact approved proposal bytes.
- Prisma applied the sole pending migration; its ledger entry is complete and matches
  that checksum. All three prior ledger entries are unchanged.
- Prisma Client was regenerated locally. Verification used a fresh process/connection.

Before execution, the guarded runner rechecked the project/role/TLS identity, exact SQL,
validated backup hashes, unchanged records/ledger, absence of schema collisions, zero active
attempts, and server ownership/RLS-bypass access. No unexpected destructive changes arose.

## Backup

- Private archive: `.printos-backups/2026-10-23T15-28-01.391Z-phase2e1/database.dump`.
- Created: 2026-10-23 15:28:01.392 UTC.
- Size: 293,272 bytes.
- SHA-256: `5725fd2939f60dd072d52af5c12374949bf4df7edbe82486f62afba08f0c1b26`.
- Archive listing/decompression and a private local application-schema restore were validated
  before approval; archive and snapshot hashes were rechecked immediately before execution.
- Restore rehearsal matched all original job, printer, health and migration rows and the
  Phase 2A application schema. Directories/files remain private and gitignored.
- Scope is a logical database archive; customer PDF files and complete Supabase platform/
  role/storage recovery were not copied or claimed as tested.

## Preservation and schema verification on the actual test database

| Check | Result |
| --- | --- |
| Original jobs | **10 preserved** |
| Original printers | **1 preserved** |
| Original field/value comparison | Every preexisting field unchanged |
| Prices, statuses, options, timestamps and attempt fields | Unchanged |
| Existing `shopId` values | NULL on every historical job/printer |
| Existing agent-health rows | Unchanged (0) |
| Account/shop/session/membership/invitation/verification/rate-limit rows | All 0 |
| Tenant triggers | Both installed and enabled |
| Shop foreign keys and owner/staff constraint | Present and validated |
| Migration ledger | Previous 3 intact; exactly 1 approved migration added |

No repricing, backfill, fixture seeding or historical adoption was performed in Supabase.

## Access restrictions and tenant boundaries

- RLS enabled on all **12 PrintOS tables**, without FORCE RLS.
- Zero public-table RLS policies grant API access.
- **192 effective privilege checks** confirmed `anon`/`authenticated` lack SELECT, INSERT,
  UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on those tables.
- **24 actual read-denial probes** used READ ONLY transactions and SET LOCAL ROLE to test
  both API roles on each table. Every query failed with the expected permission denial;
  switching roles was independently verified first.
- Both API roles lack execution privilege on the two tenant-trigger functions (4 checks).
- API roles are not superusers and cannot bypass RLS.
- The `postgres` server role retains read/insert/update/delete privileges on all 12 tables,
  owns the tables, and can bypass RLS. Actual read/preservation queries succeeded after the
  lockdown. No server write probe or user/shop creation was necessary.

Tenant foreign-key/immutability guards and deny-by-default Data API access were verified
on the real database. A live two-shop scenario there was deliberately not created because
account/shop creation and history assignment were prohibited. The existing real Prisma/
Next.js integration test passed separately against disposable local fixture shops after
applying the same approved SQL. Privileged server requests still depend on application
membership checks; RLS does not implement per-shop filtering for the server's bypass role.

Project-wide default grants and Supabase role definitions were not changed. Future public
migrations must explicitly protect their new tables/functions too.

## Regression verification

- Web: **134 passed**; the dedicated local PostgreSQL case is skipped in the normal suite.
- Dedicated disposable PostgreSQL/Prisma/built-Next two-shop test: **1 passed** separately.
- Agent: **76 passed**; adapters are mocked, with no physical printing.
- Desktop: **13 passed**.
- Web typecheck, production build, Prisma validation and `git diff --check`: passed.

The first post-rollout regression run exposed a missing Prisma-ledger table in the manually
replayed local migration fixture. Real Prisma rollouts create that table automatically.
The disposable fixtures now create the real ledger shape before replaying SQL; the full
suite and real PostgreSQL integration then passed. No production SQL was modified or
reapplied to address that test-fixture issue; the approved migration checksum is unchanged.

## Remaining configuration and product work

New authentication/email settings remain absent from local `.env`. Migration alone does not
activate registration/login. The shared legacy owner password/HMAC session remains retired
under Phase 2E.1 code. Individual verified accounts, memberships and an active shop require
separate configuration/operator actions; none were performed here.

Historical records remain unassigned and will not appear in a newly created shop. Any adoption
requires an explicit reviewed plan, including the immutability guards. Device pairing, shop
rate cards, private object storage and live desktop activation remain pending stages.
Windows execution and physical output remain unverified. This migration is not a private-beta
readiness or hardware-readiness claim.

Machine-readable evidence: [phase-2e1-final-report.json](phase-2e1-final-report.json).
The approval packet and previous verification JSON remain historical pre-execution evidence.
