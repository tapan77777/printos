# Phase 2E — staged implementation

**Rollout status:** the user-approved atomic migration, including scoped Supabase RLS/grant
hardening, has now been applied and verified on the existing test project. See the
[final migration report](rollout/phase-2e1-final-report.md). The original Stage 2E.1
implementation notes below describe the earlier pre-rollout state; authentication
configuration and later product stages remain pending.

## Completed stage: 2E.1 accounts, shops, isolation and critical dependency upgrades

This change implements the first independently verifiable stage requested in Phase 2E.
**The complete Phase 2E product is not finished and is not private-beta ready.**
Pairing/credentials, shop rate cards/snapshots and live desktop-agent activation remain
separate stages. No fake endpoints, pairing success, credentials or live activation
were added to make incomplete stages appear complete.

**Supabase has not been migrated or modified.** No historical jobs/prices/printers,
production secrets, real documents or real printing were changed. Test accounts/jobs
existed only in disposable databases. No external verification emails were sent.
Do not run this branch against the existing database until the exact migration and
coordinated authentication cutover are approved.

| Requested capability | Current result |
| --- | --- |
| Users, shops and owner/staff membership | Implemented with Better Auth organizations |
| Registration, verified email, login/logout, recovery | Implemented; real delivery/configuration not activated |
| Revocable/expiring sessions and brute-force controls | Implemented, database-backed and tested |
| Tenant-scoped owner APIs, jobs, PDFs, dashboard/reports | Implemented and tested against two shops |
| Historical preservation | Additive nullable scope; no backfill or repricing; disposable migration tests pass |
| Agent tenant boundary | Legacy agents cannot touch tenant records; all legacy credentials rejected in tenant mode |
| Device registration, pairing sessions and agent credential tables | Pending 2E.2; no production pairing API yet |
| Standalone PrintAttempt history model | Pending; existing Phase 2A attempt fields/barriers remain intact |
| Rate cards, pricing editor and immutable rate snapshots | Pending 2E.3; existing Phase 1A validation/quotes remain unchanged |
| Live desktop worker and OS-protected credentials | Pending 2E.4; desktop remains diagnostic-only |
| Complete desktop onboarding | Account/shop routes permitted; pairing/pricing/activation stages still explicitly blocked |
| Critical/high web dependency findings | Resolved in refreshed audit; three moderate development findings remain |
| Windows execution / physical verification | Not performed |

## Data model and historical isolation

`prisma/schema.prisma` adds Better Auth core models `User`, `Session`, `Account`,
`Verification` and `RateLimit`. Passwords use the maintained library's salted scrypt
implementation. Sessions are database-backed with 12-hour expiration; cookie cache
is disabled so revocation is checked by the server.

The organization plugin uses Prisma `Organization`, `Member` and `Invitation`, mapped
to database tables `Shop`, `ShopMembership` and `ShopInvitation`. Membership has a
unique user/shop pair and an enforced `owner`/`staff` role constraint. Organizations
have a name and unique slug; extended business/contact details remain future work.

`Printer.shopId` and `PrintJob.shopId` are nullable foreign keys to `Shop` with indexes.
Existing records remain `NULL`, unchanged. They are **quarantined**, not silently
adopted by the first person to register. A trigger prevents changing a printer's shop.
Another prevents changing a job's shop/printer and rejects inserts where job and
printer scopes differ, including NULL/non-NULL mismatches. Historical prices, options,
customer tokens and Phase 2A attempts remain unchanged. New customer uploads derive
shop identity from the resolved printer, ignoring caller-supplied shop IDs.

This stage intentionally has no UI or automatic process for adopting legacy records.
A later explicitly reviewed data-adoption migration would need to address these
immutability guards and any active attempts. New accounts cannot inspect old unassigned
records, and new shop reports do not include them.

## Authentication and membership policy

- `lib/auth.ts`: pinned Better Auth 1.7.12 with Prisma transactions, organization plugin,
  verified-email login, reset/revocation, database rate limits and owner/staff roles.
- `lib/session.ts`: application authorization uses the live account session and a fresh
  membership lookup for the session's active shop. It never trusts `shopId` parameters,
  headers, the role supplied by a client, or membership cached in a browser cookie.
- `lib/tenantAccess.ts`: shared scope predicates. Owner APIs and each server-rendered
  dashboard query apply them, independently of middleware/layout rendering.
- `lib/authBody.ts`: JSON account requests limited to 16 KiB and 10 seconds of body
  consumption. All HTTP mutations require the configured exact Origin.
- `lib/authResponse.ts`: HTTP JSON omits raw bearer/password/secret fields. Browser
  authentication uses HttpOnly cookies; trusted internal server APIs retain library
  session objects. Redirects used for email verification/recovery remain intact.
- `/api/account-auth/[...all]`: maintained auth handlers, gated on complete configuration.
  Missing migration/configuration is not represented as successful registration.
- `/login`, `/register`, `/recover`, `/reset-password`, `/shops`: account flows, shop
  creation/selection, staff invitations/acceptance and revocation of the user's sessions.
  Existing dashboard and customer presentation is reused.

Role policy: both owner and staff can read their shop's operational data, prices and
reports, preview its PDFs, and approve/reject queued jobs. Only owners create printers,
manage membership through the provider, or manually reconcile uncertain physical output.
A membership removed from the database is denied on the next protected request. An
operation already authorized and in flight is not retroactively cancelled.

Staff invitations must specify `staff` (the UI does); owner invitations/promotions are
restricted by the organization's owner permissions. Unknown/multiple role strings are
rejected. Unverified users cannot create shops, and anonymous callers cannot use the
server-only organization creation parameters. Shop deletion is disabled to protect data.

The old role-only HMAC cookie **no longer authorizes any application request**.
`POST /api/auth/login` returns 410 with account-login instructions. The old logout URL
now delegates to actual account sign-out. HMAC helpers/legacy UI remain only for prior
fixture compatibility tests; the live login page does not expose the global password.
This is an intentional, documented authentication cutover, not a backwards-compatible
way to reuse the global owner password across independent shops.

Middleware checks only cookie presence to improve redirects. It does not authorize
anything; pages and APIs verify database sessions/membership. Owner mutations additionally
require an exact trusted Origin. Missing/removed membership fails closed.

## Public QR and agent boundaries

Customer QR links remain `/p/<globally unique deviceId>`. They intentionally provide a
public customer upload entry, not owner or agent access. Changing a public printer URL
selects that printer's public shop; it cannot select the tenant written on another
printer's job. Customer job status still requires the unguessable session token. Owner
job/PDF lookups reject mismatched shop IDs before filesystem access, and no price is
accepted from the upload client.

Legacy agent credentials have only unassigned scope, including recovery, claims,
file downloads, heartbeat and status checks. In `PRINTOS_AUTH_MODE=tenant` the old global
credential registry is rejected outright. This is necessary while the device-scoped
credential/pairing model is still absent; there is no unsafe token fallback. The existing
agent journal, authorization ACK, SUBMITTING and reconciliation logic is unchanged.
Do not cut over with active legacy attempts; drain/reconcile them first.

Desktop account/register/recovery/shop navigation is now permitted in the existing
unprivileged cloud view. It receives no additional IPC, filesystem or agent access.
Local setup explains the remaining enrollment dependency. It still cannot start a live
worker. The previously built Phase 2D installer was **not rebuilt** for this stage; it
contains the earlier route policy and must not be treated as a Phase 2E release artifact.

## Dependency changes and compatibility

Upgrades were explicit and regression-tested:

- Next.js 14.2.35 → **15.5.28**, keeping React 18.
- Vitest 2.1.9 → **5.0.5**, Vite **8.3.5**, Node typings **22.19.1**.
- Better Auth **1.7.12** added. No peer-check bypass or forced installation was used.
- Node >=22.12 is required (verification used Node 24).

Next 15's async route/search parameters are awaited. Customer client components moved
behind thin async route wrappers, preserving public URLs and API interactions. Vite's
OXC JSX configuration replaces the old esbuild JSX option. Dashboard styling and pricing
logic were not redesigned or replaced.

Refreshed audit: web **0 critical, 0 high, 3 moderate**; production dependencies **0**.
The remaining moderate chain is Tailwind 3 / postcss-nested / postcss-selector-parser
([advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)). These are build-time
selector-processing packages. We did not force a Tailwind 4 migration or an untested
parser-major override. See `phase-2e-verification/security.json` for exact summaries.
An npm audit is package-level evidence, not a guarantee about every deployment/configuration.

## Verification

- Web regression/account/isolation suite: 134 passed; one dedicated PostgreSQL test is
  skipped by default and run separately by the guarded harness.
- Dedicated real PostgreSQL + Prisma + built Next server integration: passed. A private
  temporary Unix-socket cluster, no TCP listener, applied all migrations, registered and
  verified synthetic accounts, created two shops, invited/accepted staff, tested membership
  removal/session revocation, and fetched actual Jobs/Reports HTML. Foreign job/PDF access
  was denied. The cluster was stopped and removed; Supabase was not accessed.
- Disposable embedded PostgreSQL migration test: every original historical job value
  preserved (only the new NULL scope added); tenant identity/role/foreign-key constraints tested.
- Agent regression suite: 76 passed, including offline recovery and duplicate prevention.
- Desktop suite: 13 passed; Electron mock navigation/onboarding, window close/reopen,
  diagnostic crash recovery, safe stop, IPC isolation and 820/1024/1440 layouts passed.
- Web, desktop and agent typechecks/builds passed. Prisma validation passed using a dummy
  URL; Prisma Client was regenerated locally, without a database migration.

Memory-adapter auth tests cover hashing, email gating, reset token replay, expired/revoked
sessions, CSRF/Origin, body limits, brute-force rate limiting and credential redaction.
Route tests cover cross-shop IDs, unassigned history, same-shop CAS scope and staff restrictions.
The dedicated PostgreSQL test proves the actual Prisma adapter/schema combination; it is
not just a memory-only auth simulation. Real email delivery and Windows execution remain unverified.

Run normal checks:

```sh
npm ci --prefix apps/web
npm test --prefix apps/web
npm run typecheck --prefix apps/web
npm run build --prefix apps/web
npm test --prefix apps/agent
npm test --prefix apps/desktop
```

For real disposable PostgreSQL verification, first build the web app and provide trusted
local PostgreSQL binaries (not a database URL):

```sh
PRINTOS_TEST_PG_BIN=/absolute/path/to/postgres/bin npm run test:tenant-postgres --prefix apps/web
```

The harness never loads `.env`, creates a new private cluster, disables TCP, explicitly
injects its socket database URL, and tears the cluster down. Its integration test rejects
non-local/non-fixture database targets. It does not read/copy customer PDFs or start an agent.

## Proposed migration and rollout — NOT applied

Exact migration: `prisma/migrations/20261023010000_tenant_accounts/migration.sql`.
SHA-256: `8292cd25efc29a07927ae88861f0943f7a1e80e9729e83927fee7dcc13d95363`.

The SQL creates new tables/indexes/foreign keys/functions/triggers and adds nullable
columns. It does not drop columns/tables, delete records, backfill tenants or update
historical rows. New constraints deliberately restrict future tenant reassignment.
Applying DDL still takes locks and requires an operator-controlled rollout.

Before any Supabase change:

1. Obtain separate approval for this exact migration/checksum and target project.
2. Drain/reconcile active attempts; stop old agents and prevent writes during cutover.
3. Confirm project identity without displaying credentials. Make a fresh logical backup,
   record its checksum and verify it can be inspected/restored to a disposable database.
4. Review actual schema/migration history for drift; stop if unexpected changes are needed.
5. Apply only the approved migration, regenerate Prisma Client, and verify original row
   counts/values/prices/printers against the backup. No automatic history adoption.
6. Configure new authentication values through the deployment's secret store and verify
   email-domain delivery. No existing secrets were edited by this implementation.
7. Register/verify an operator account and create a shop. Verify tenant isolation before
   inviting other shops. Keep agents disabled until scoped pairing/activation is implemented.

Required configuration is documented in `.env.example`: `PRINTOS_AUTH_MODE=tenant`,
`BETTER_AUTH_URL` (exact approved HTTPS origin), new high-entropy `BETTER_AUTH_SECRET`,
server-only `RESEND_API_KEY` and verified `AUTH_EMAIL_FROM`. Missing configuration fails
closed. Email is implemented through a bounded provider call; no email service or key
was provisioned in this phase.

Rate limiting persists in PostgreSQL. By default client-supplied proxy headers are not
trusted, producing a conservative shared bucket. Set `PRINTOS_TRUST_PROXY=true` only
where infrastructure demonstrably overwrites `x-real-ip`; otherwise spoofing would
undermine per-IP limits. Confirm legitimate beta traffic does not share an unusably
small bucket. Cookie/session storage and request logging need deployment qualification;
redact verification/recovery/customer-token query parameters in access logs.

Rollback must not re-enable the old unscoped application after tenant data exists.
Retain additive schema/data and use maintenance mode or a prior **tenant-safe** build.
Do not drop account/tenant tables as a rollback. Restoring a database backup is destructive
and requires a separately approved recovery plan, especially after new registrations.

## Private-beta blockers and next independently testable stages

**2E.2 secure device enrollment:** registered-device, pairing-session and hashed credential
models; short-lived single-use challenge/approval, device/shop/printer ownership, rotation,
revocation and exclusive enrollment. Test expiration/replay/races and refusal of guessed
shop/device IDs. Store resulting credentials only in OS-backed main-process storage;
never send them to the hosted view or persistent renderer config.

**2E.3 rate cards:** per-shop versioned integer-paise rates with explicit page/sheet units,
paper/color/duplex combinations, minimums and server-authoritative quote versions. Persist
immutable job snapshots; reject stale quotes rather than silently repricing. Add the pricing
editor and atomic version/range/copies/duplex/rounding tests. Existing Phase 1A global rates
and PDF safeguards remain in place until then; creating a shop does not configure new rates.

**2E.4 live desktop integration:** consume the completed enrollment credentials, share a
device-keyed journal/lock with any standalone process, require explicit owner activation,
implement revoked/logout/shutdown behavior, and keep diagnostics separate. Test real cloud
integration with mock printing only before any hardware trial. Preserve all Phase 2A barriers.
Rebuild/sign the installer only after this integration is qualified.

**Storage/deployment/security gate:** uploads still use `tmp-uploads` on one server and
owner/agent PDF APIs read that filesystem. This is private application storage but is not
shared/durable serverless object storage. Before a multi-instance/serverless beta, implement
tenant-scoped private object storage, bounded signed downloads, quotas, retention/orphan
cleanup and provider permission tests. Preserve local compatibility only behind an explicit
single-node deployment policy. Verification/reset email and QR customer URLs contain temporary
bearer secrets; access-log redaction and transport/storage controls must be verified.

Real email delivery, proxy trust, session/cookie behavior on the deployed HTTPS host, migration
backup/recovery and the three moderate toolchain findings remain release checks. Windows
adapter/renderer/driver execution and the Phase 2C physical checklist remain separate hardware
gates; this stage makes no Windows or physical-printing claim.

## Primary references

- [Better Auth installation / Next integration](https://better-auth.com/docs/installation)
- [Email/password authentication](https://better-auth.com/docs/authentication/email-password)
- [Organization and membership plugin](https://better-auth.com/docs/plugins/organization)
- [Prisma adapter](https://better-auth.com/docs/adapters/prisma)
