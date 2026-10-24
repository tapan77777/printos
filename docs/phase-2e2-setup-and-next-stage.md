# Phase 2E.2 setup and next-stage preparation

This preparation does not apply a migration, change credentials, create external accounts, or activate printing.

## Configuration checked

The local Next.js environment, using development-file precedence and process overrides, has a database URL but none of the five required account variables. `PRINTOS_DEVICE_ENROLLMENT` remains disabled. Values were not printed. The configured database identity is project `xkqetjzplwusogbrilja`, database `postgres`, port `5432`, direct Supabase host. This is a configuration inspection, not a fresh live-server identity verification. No DIRECT_URL or SHADOW_DATABASE_URL was configured. The URL has no explicit sslmode; that alone does not establish actual connection encryption. Require TLS and verify `pg_stat_ssl` in the preflight.

The migration SQL contains no project name: the database connection determines its target. Only the project above may be proposed for approval; a changed target requires review.

## Five missing settings

| Exact variable | Purpose / where to obtain it | Third party? | Secure configuration | Verification |
| --- | --- | --- | --- | --- |
| `PRINTOS_AUTH_MODE` | Selects existing verified-account/tenant auth; use literal `tenant`. | No | Server environment only; no legacy-password fallback. | Checker reports tenant mode; unauthenticated owner access remains denied. |
| `BETTER_AUTH_URL` | Canonical application origin used for trusted Origin checks and account email links. Local choice: `http://localhost:3001`. | No for local development; later use the actual hosted HTTPS origin. | Exact origin, no credentials/path/query; use the same hostname/port in browser. Production and packaged desktop cloud access require HTTPS. | Checker accepts URL; real verification/reset emails point to it; correct-Origin requests work and foreign-Origin mutations return 403. |
| `BETTER_AUTH_SECRET` | Auth cryptographic secret; manually generate with a password manager or `openssl rand -hex 32`. | No | Dedicated development value, at least 32 characters, ignored server-only `.env.local`; never paste in chat or use a `NEXT_PUBLIC_` name. Keep stable across restarts. Rotation needs session-impact planning. | Checker confirms length without showing value; login/session survives server restart with unchanged secret; expiry/logout/reset revoke access as intended. |
| `RESEND_API_KEY` | Resend dashboard API Keys: create a dedicated sending key, restrict its sending domain where available. | Yes: Resend account. | Store only on server, separate from production. Do not use a Supabase service-role key here. | Checker confirms presence only; an approved real registration/recovery sends successfully; inspect Resend delivery events without sharing message links or tokens. |
| `AUTH_EMAIL_FROM` | Sender address authorized in Resend, optionally `PrintOS <accounts@your-domain>`. Choose a domain you control. | Yes: Resend; DNS provider for domain verification. | Set an actual authorized sender server-side. The template deliberately leaves it blank. | Resend domain status verified; approved recipient receives verification and recovery emails with intended sender. |

Safe template: `apps/web/config/auth-development.env.example`. Manually merge it into ignored `apps/web/.env.local`, preserving the existing DATABASE_URL and not copying production secrets. Do not blindly replace an existing file. `git check-ignore apps/web/.env.local` confirms this path is ignored. No actual environment file was edited during preparation.

Run `npm run auth:check --prefix apps/web`, restart the local server on port 3001, and rerun the checker. A ready report only validates local syntax/presence; it is not proof of delivery or secure production hosting. Keep `PRINTOS_TRUST_PROXY=false` and `PRINTOS_DEVICE_ENROLLMENT=disabled` until their prerequisites are met.

Resend's test domain restricts delivery to the Resend account owner's address. To invite other beta users, verify an owned domain and configure its required DNS records. Sources: [test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [verified domains](https://resend.com/docs/dashboard/domains/introduction).

User participation required: create the Resend account/key, configure domain/DNS and sender, supply local secret values privately, and approve a real test-account walkthrough. No Supabase Auth/SMTP setting is required by this implementation: Better Auth stores accounts in PostgreSQL and calls Resend directly. No Supabase secret changes are proposed.

After account-write approval: register a designated test email; ensure login and shop creation fail before verification; follow the delivered link; log in; create a new test shop; verify logout; request recovery; reset with a 12+ character password; confirm previous sessions and replayed reset tokens fail. Use designated test records only; do not assign legacy jobs or printers to a new shop. Mailbox interaction requires the user. Disposable tests cover these contracts without sending external mail.

## Pending migration review

`prisma/migrations/20261023020000_device_enrollment/migration.sql`

SHA-256: `aab1f8fd0ead0e815655aa659ff53c87cbd019c9cd16b0d9f5b8d3696a8a72ee`

- Creates `DesktopDevice`, `DeviceCredential`, `DevicePairing` with restrictive foreign keys and indexes.
- Enforces immutable device shop/printer/key/mode scope, matching printer tenant and mock mode, and one unrevoked device per printer.
- Enables RLS on all three tables, revokes PUBLIC/anon/authenticated access and trigger-function privileges.
- Enforces `processingEnabled=false` by CHECK. Pairing cannot activate printing.
- Runs atomically with 10-second lock and 60-second statement limits.
- No UPDATE/DELETE of historical rows, no adoption, no price changes, no dropped existing objects.

The already applied Phase 2E.1 SQL checksum remains `dfaea87c193b9b6349a9252a2a17ed10feb6cfda1f2223e4b4da8e1cb3f7f3af`.

### Fresh rehearsal

Run only against an isolated Unix-socket PostgreSQL cluster:

```
PRINTOS_TEST_PG_BIN=/path/to/trusted/postgres/bin node apps/web/scripts/test-tenant-postgres.mjs
npm test --prefix apps/web -- tests/tenant-migration.test.ts tests/account-auth.test.ts
```

The harness never loads the configured `.env`, creates its own database, applies all migrations and tears it down. Fixtures are synthetic, not copied customer data. Dedicated tests cover tenant access, membership, signed challenges, concurrent single-use redemption, expiry, wrong-code lockout, credential confirmation, inactive claim denial, revocation and reconciliation. Embedded PostgreSQL tests compare complete legacy job/printer rows before/after migration, including prices, and check RLS/client privilege denial.

## Backup and approval gate

**No fresh remote backup was created in this preparation. No migration approval is being inferred.** Existing Phase 2E.1 backups are historical evidence, not this rollout's fresh gate.

Do not run `backup-tenant-rollout.mjs` unchanged: it intentionally expects an obsolete Phase 2E.1 proposal hash and the pre-tenant migration ledger. Likewise, do not reuse the old migration runner for this new migration.

Before final application approval, prepare/review an enrollment-specific runner with these fail-closed steps:

1. Resolve the effective environment exactly as Next.js does; reject multiple/ambiguous targets. Verify direct host `db.xkqetjzplwusogbrilja.supabase.co`, database `postgres`, port 5432. Connect with required TLS; check actual database, role, server version and `pg_stat_ssl`. Stop on identity mismatch.
2. Read the migration ledger and compare all four applied checksums with repository SQL. Verify the fifth migration is unapplied, the three new tables do not already exist, no failed migrations or unexpected drift exist, and the server role owns the tables or bypasses RLS. Confirm anon/authenticated are not privileged server roles.
3. In a read-only repeatable-read transaction, export a snapshot. Capture full historical jobs/printers, relevant health rows, ledger, schema/privilege inventory and canonical hashes privately. Run `pg_dump --format=custom` against that same exported snapshot while the transaction remains open. Keep credentials in process environment rather than command arguments/output; require bounded connection/dump times. Use private directory permissions (0700) and files (0600).
4. Hash the archive, list it, decompress it, then restore into a brand-new isolated local PostgreSQL database. Accommodate Supabase-managed extensions/roles explicitly in the restore plan; never ignore unexpected restore errors. Compare application rows, prices, counts and hashes to the snapshot. Do not copy customer PDFs. Treat the database backup itself as sensitive. Record exactly what schema/platform pieces were excluded from local restoration.
5. Publish only sanitized target, migration hash, backup hash, timestamp, restore-test result, historical counts/hashes, expected SQL changes and RLS/server-role checks for user review. Fresh remote reads/backup may proceed within the user's requested preparation, but no new external records or settings may be written. Stop if backup/restore validation fails. If writes occur between backup and apply, refresh backup/baselines or quiesce writers through an approved maintenance procedure.
6. Request explicit approval for **this exact hash and project** only after those results exist. Backup readiness has not yet been established in this document.
7. After approval: recheck target/hash/backup freshness; apply via the reviewed migration mechanism that records Prisma's ledger; regenerate Prisma Client. Compare original rows/price/printer hashes, ledger checksums, RLS and client privileges; confirm server access remains working. Do not create accounts, enroll devices or enable the feature flag without their separate authorization. Never enable physical processing in this migration.
8. If the transaction fails, confirm rollback and inspect the migration ledger before retrying; do not blindly mark migrations resolved. After success, prefer a reviewed additive repair. Restoring a full database backup over later records requires a separate recovery decision.

## Next implementation order

| Stage | Implementation and dependencies | Required verification |
| --- | --- | --- |
| 1: rates and immutable quotes together | Add shop/printer-scoped versioned rate cards and owner editor, explicit per-page/per-sheet rules, supported paper/color/duplex combinations and optional minimum. Extend the existing PDF validation/quote flow with integer-paise authoritative calculations. Persist job snapshot and quote/rate version atomically; distinguish legacy unsnapshotted jobs without rewriting them. Reject stale/ambiguous quotes or require customer reconfirmation rather than silently changing the displayed amount. | Cross-shop/staff denial; ranges/copies/odd duplex sheets; minima and overflow; unsupported combinations; concurrent rate edit/submission; old jobs unchanged. Disposable additive-migration rehearsal. |
| 2: private PDF storage | Define storage adapter and document metadata tied to shop/printer/customer session and verified hash. Prefer evaluating a private Supabase Storage bucket because this project already uses Supabase; provider/bucket creation still requires approval. Use scoped short-lived upload grants into quarantine, validate PDF server-side before quote/job creation, and authorize every preview/agent download. Keep existing documents readable through a temporary legacy adapter without copying them silently. | Guessed IDs and cross-shop/session access; oversized/invalid PDFs; upload finalization replay; hash mismatch; expired grants; interrupted uploads; failed validation cleanup; retention and orphan cleanup; owner preview and authorized agent download. Disposable/local provider mocks plus approved cloud integration later. |
| 3: scoped live-agent activation | Depends on approved enrollment migration, stable quote/storage contracts and verified credential receipt. Bind discovered OS printer to authorized device/printer, validate capabilities; owner explicit activation/deactivation with fresh server authorization. A separate reviewed migration replaces the always-false CHECK. Pass credentials main-process-to-supervised worker through a restricted channel, never renderer/plaintext configuration. Preserve journal lock, acknowledged attempts, SUBMITTING and reconciliation. | Mock adapter only: double-start, shutdown, crash at every barrier, offline/reconnect, expired/revoked credentials, pause/logout semantics, lost acknowledgements, no automatic retry of uncertain submissions, no printing before activation. Windows tests remain pending. |
| 4: completed onboarding | Integrate auth/shop, pairing, discovery/selection, actual saved rates, real QR identity and dashboard. Persist safe progress; derive success from server state. Reuse existing design and account/device screens. | Interrupted/resumed setup; cross-shop switch; missing provider/storage; revoked pairing; unsupported printer; failed rate save; QR targets correct printer/shop; no live activation from installation or onboarding. Electron mocks plus approved real test-service walkthrough. |

Implement rates and snapshots as one integrated stage so editable rates cannot ship while jobs still depend on mutable values. Storage can be developed independently after document/quote metadata contracts are agreed, but activation depends on both. Each schema change requires disposable rehearsal and separate external rollout approval.

Vercel's function request/response limit is 4.5 MB, so a 25 MB PDF must not simply be forwarded through the current multipart function route. Use direct-to-private-storage uploads with a separate bounded validation/finalization step; benchmark parser memory/time at the accepted size and choose a worker if it exceeds function limits. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

No hardware readiness, Windows execution, OS keychain validation or physical-output guarantee follows from these simulated tests.

### Results from this preparation

Fresh rerun: 2/2 real disposable PostgreSQL integration suites passed; 11/11 focused authentication and migration-preservation tests passed. The local tools image was unmounted after testing. No Supabase connection was opened, no fresh remote backup was claimed, and the migration remains unapplied. Existing configuration templates were reviewed and retained; no live environment file was changed.
