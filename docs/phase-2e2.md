# Phase 2E.2 — authentication readiness and secure device enrollment

Status: first independently verifiable stage implemented. This is **not the entire Phase 2E.2 release**, and is not yet a usable private beta. No Supabase changes, real accounts, emails, credentials, print submissions, deployments, commits or pushes were performed.

## Authentication setup

The existing Better Auth implementation uses verified email, database sessions, organization memberships, owner/staff authorization, password reset with session revocation and database-backed request limits. These safeguards remain enabled.

`npm run auth:check --prefix apps/web` inspects configuration locally without printing values, contacting email services or creating users. The current database URL is present; all five account settings are absent:

- `PRINTOS_AUTH_MODE=tenant`
- `BETTER_AUTH_URL=http://localhost:3001` (exact origin of the local application)
- `BETTER_AUTH_SECRET` (dedicated random secret of at least 32 characters)
- `RESEND_API_KEY` (server-only sending credential)
- `AUTH_EMAIL_FROM` (authorized sender)

No actual environment files were modified. A blank local template is available at `apps/web/config/auth-development.env.example`; the main `.env.example` documents the disabled enrollment gate.

### Manual configuration

1. Retain the authorized test database configuration. Keep production and development credentials separate; never use `NEXT_PUBLIC_` for these secrets.
2. Manually generate a dedicated random development auth secret with your password manager or `openssl rand -hex 32`. Store it only in ignored local environment configuration, never in this document or chat.
3. Create a Resend sending key in your own account. For a private beta, verify a domain and configure the required DNS records, then choose an authorized sender. Resend's default test domain only sends to the account owner's email; it is not a general registration email service. See [domain setup](https://resend.com/docs/dashboard/domains/introduction), [API keys](https://resend.com/docs/dashboard/api-keys/introduction) and [test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
4. Copy the non-secret settings from the template into your ignored local configuration and supply the secret values manually. Use one consistent hostname and port in the browser and `BETTER_AUTH_URL`. Restart Next.js after configuration.
5. Run the checker. Leave `PRINTOS_TRUST_PROXY=false` unless the hosting proxy overwrites the trusted header. Do not disable verification to make registration appear successful.
6. With separate approval to create test accounts, register, receive and follow verification email, log in, create/select a shop, log out, request recovery, reset the password and verify old sessions are revoked. Unverified login must remain denied. These external delivery/account checks are currently blocked by missing configuration and account-creation approval.

Disposable fixture tests exercise registration, verification, login, recovery, logout, organization membership and shop isolation without delivering external email. They do not establish that the configured email provider delivers successfully.

## Completed enrollment stage

### Backend and owner interface

- Additive `DesktopDevice`, `DeviceCredential` and `DevicePairing` models and pending atomic migration. Historical rows, prices and ownership are untouched; legacy unassigned jobs/printers remain quarantined.
- `/dashboard/devices`: shop-scoped printer registration using the existing API, device review, printer selection, approval, listing and revocation. Staff cannot approve or revoke devices.
- Ten-minute challenges bind an Ed25519 public key, nonce, display label and adapter mode. Owners review a key fingerprint and matching human code. Five incorrect approval attempts lock the challenge.
- Poll and consume require operation-specific signatures. A transaction consumes a challenge once and creates one printer-scoped device and one hashed, 30-day bearer credential. Tenant authorization never falls back to global agent credentials.
- The client must securely persist the credential before confirming receipt. Unconfirmed credentials cannot access agent endpoints and cannot confirm after five minutes. Lost receipt acknowledgements can be retried idempotently; lost one-time credential delivery requires owner review/revocation and a fresh pairing.
- Owner revocation disables credentials. Owned active attempts move to reconciliation rather than being requeued; existing attempt/latch/price data is retained. A submission already accepted by an OS spooler may still finish; revocation cannot promise physical cancellation.
- Request bodies and network calls are bounded; enrollment endpoints have atomic database-backed limits. Without trusted proxy configuration, limits deliberately use a conservative shared bucket.

New API surface: `/api/devices`, `/api/devices/pairing`, pairing `inspect/approve/poll/consume`, `/api/devices/confirm`, `/api/devices/self`, and device `revoke`. No secret appears in owner list/inspect responses. Only the proof-holding client receives the one-time bearer secret.

### Desktop

`credentialVault.ts` and `pairingClient.ts` isolate keys and credentials in the main process. Encrypted atomic storage uses Electron's asynchronous safeStorage APIs; unavailable protection and Linux plaintext fallback fail closed. Remote pages have no privileged preload or generic IPC. Pairing summaries expose no bearer tokens or private keys. Origin changes are blocked while pairing/credentials remain active.

Native onboarding now creates a real challenge, opens the owner review page, checks approval, stores credentials, confirms receipt and checks device access. Reopening after a lost receipt acknowledgement resumes with the stored secret. Forgetting an unexpired credential requires confirmed server revocation; offline errors do not silently erase recovery state. Vault removal never deletes the agent journal.

The Electron test driver uses a synthetic loopback backend and an injected test encryption provider. **OS keychain/DPAPI behavior is not verified by that test.** Production has no plaintext fallback or test-vault switch. Windows execution and physical printing remain unverified.

### Fail-closed activation boundary

Enrollment requires `PRINTOS_DEVICE_ENROLLMENT=enabled` **and** configured verified-account authentication. Default is disabled. All newly enrolled devices have `processingEnabled=false`; a database CHECK prevents enabling processing in this stage. Claim/queue/document and authorization/renewal paths reject inactive devices. Authenticated heartbeat/recovery can report existing state.

There is no activation API and the desktop supervisor still runs the no-network diagnostic worker. No real worker starts during installation, pairing or tests. The shared Phase 2A journal, SUBMITTING barrier, checksummed downloads and uncertain-outcome reconciliation engine are unchanged.

## Pending migration and rollout

File: `prisma/migrations/20261023020000_device_enrollment/migration.sql`

SHA-256: `aab1f8fd0ead0e815655aa659ff53c87cbd019c9cd16b0d9f5b8d3696a8a72ee`

Adds three tables, indexes, foreign keys, mode constraints, immutable tenant/printer/key scope trigger, one-unrevoked-device-per-printer constraint, disabled-processing CHECK, RLS and PUBLIC/anon/authenticated privilege revocation. No historical DML, data adoption, table deletion or price updates. Transaction uses 10-second lock and 60-second statement timeouts. The applied Phase 2E.1 migration remains unchanged (SHA-256 `dfaea87c193b9b6349a9252a2a17ed10feb6cfda1f2223e4b4da8e1cb3f7f3af`).

Rehearsed only against disposable local PostgreSQL, with legacy-row preservation and client-role restrictions additionally covered in embedded PostgreSQL tests. **Not applied to Supabase.**

Before requesting exact rollout approval: reconfirm project identity, take and restore-validate a fresh private backup, record full historical job/printer fingerprints and schema privileges, review SQL/hash, verify server role bypass/ownership. After approval only, apply this migration, regenerate Prisma Client, compare historical fingerprints, test revoked/public role access and authenticated tenant boundaries, then explicitly enable enrollment. Keep processing disabled. On failure, retain the transaction rollback; after a successful rollout prefer a reviewed forward fix rather than dropping credential/history tables. Do not restore an old backup over new customer records without a separate recovery decision.

## Verification and evidence

- Web unit/component suite: 138 passed; two dedicated database suites skipped in the ordinary run and executed separately against disposable PostgreSQL.
- Dedicated PostgreSQL: two integration suites passed, including account/shop access, cross-shop denial, single-use concurrent consume, invalid proofs, expiry, wrong-code limit, receipt confirmation, inactive claim rejection, revocation/reconciliation and the processing CHECK.
- Agent: 76 passed, including crash recovery, failed acknowledgement, network loss and duplicate-submission barriers with mocked adapters.
- Desktop: 18 passed, including encrypted persistence, unavailable OS protection, failed secure write, lost receipt recovery, process lifecycle and IPC isolation.
- Web, agent and desktop typechecks and builds passed. Prisma schema validated and Client regenerated locally. No physical adapters were started.
- Electron onboarding/navigation and synthetic pairing interaction checks passed. Screenshots and sanitized results: `docs/phase-2e2-verification/desktop/`. `paired-mock-macos.png` is a simulated pairing, not a real shop or Windows printer.
- Security audit: zero runtime web advisories, zero agent/desktop advisories; three moderate development-chain findings in Tailwind 3 / postcss-nested / postcss-selector-parser remain. No high/critical findings. No uncontrolled major upgrade was made.
- Non-blocking tooling warnings remain: Next multiple-lockfile workspace inference and future Vite native-config CommonJS compatibility.

## Remaining private-beta blockers and next stages

1. Configure actual verified email auth and approve a manual test-account walkthrough. Until then actual local login/registration is unavailable; fixture success is not provider verification.
2. Obtain separate approval for this exact migration, roll out with backup/preservation checks, and test real enrollment while keeping processing disabled.
3. Implement tenant rate cards and an owner pricing editor, per-page/per-sheet semantics, minimum charges, unsupported-setting rejection and immutable server quote snapshots. Existing Phase 1A page counting/paise pricing remains unchanged; no historical repricing occurred in this stage.
4. Replace local document files with private cloud object storage and scoped, bounded upload/download access. Current local-file storage is not a durable Vercel solution, and the configured 25 MB multipart upload ceiling exceeds Vercel function request limits. Plan quarantined direct uploads plus server PDF validation before quoting; never expose public document URLs or privileged storage keys.
5. Only after pricing/storage are integrated, implement a separate reviewed owner-controlled live-activation contract and remove the disabled-processing CHECK through an approved migration. Connect the scoped credential vault to the existing supervised agent, enforce shop/printer selection, and test revocation/offline/restart behavior without submitting real jobs.
6. Finish price/QR onboarding with those actual capabilities. Existing pricing setup screens remain truthful blockers; the entire onboarding flow is not claimed complete.
7. Add credential rotation (currently revoke/re-pair on expiration), bounded retention/cleanup for expired pairing records and rate-limit buckets, and deployment monitoring. Device key proof is not hardware/native-app attestation. Confirm OS secure-storage access, local-user permissions and recovery on Windows; sign and validate installer artifacts before wider distribution.
8. Perform Windows spooler and physical acceptance tests later. No Windows, USB/network hardware, DPAPI, signed installer or physical-output verification is claimed.

## Setup and next-stage preparation

See [the detailed configuration matrix, fresh rehearsal, backup/approval gate and implementation order](phase-2e2-setup-and-next-stage.md). Supabase rollout and actual email-provider verification remain pending.
