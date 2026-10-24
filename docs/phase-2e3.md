# Phase 2E.3 — shop rates and immutable quotes

Implemented in source and verified with synthetic fixtures/disposable databases. **No Supabase migration, historical data modification, credentials change, deployment, real printing, commit or push occurred.**

## Completed

- `/dashboard/pricing` uses the existing owner shell and styles. Owners publish supported combinations of B&W/colour, A4/A5/Letter/Legal, simplex/duplex, per-page/per-sheet rates and an optional order minimum. Amounts are entered/stored as integer paise; zero is an explicit allowed rate/minimum. Empty, duplicate or malformed combinations are rejected. Unpublished draft values are labelled and do not constitute an active rate card.
- Staff may read their shop's active card but cannot publish. Every API operation resolves shop membership server-side. Payload/query shop IDs never select the authorized shop. Mutations preserve the existing trusted-Origin and bounded-body protections.
- Each save creates a new immutable `ShopRateCard`; no previous card is edited or removed. The newest card is active (ordered by timestamp then ID). Saves lock the shop row and require the expected previous version, preventing concurrent editors from silently overwriting each other.
- Tenant `/api/quotes` uses the QR printer's shop and active card. A shop without a card is unavailable for quoting; there is no tenant fallback to global rates. Unlisted combinations return 422. Owner-entered offerings are not proof of hardware support.
- Page counting and normalized page ranges remain server-side. Range overlaps are merged. A PAGE unit means a printed side. A SHEET unit means a sheet: simplex uses one sheet per selected page; duplex uses `ceil(selectedPages / 2)` **per copy**, then multiplies by copies. Minimum charge applies once to the order. Monetary arithmetic uses integers; unsafe/32-bit-overflow totals are rejected.
- Customer controls request fresh server quotes rather than performing global-rate calculations in the browser. The summary displays unit rate, units, copies, minimum and final amount. A bounded PDF upload is currently repeated when options change; aborting obsolete requests prevents stale results from replacing current ones.
- The quote response includes an additive `quoteKey`: a SHA-256 fingerprint of the printer, canonical quote terms and PDF bytes. Tenant submission must echo it. This is a consistency fingerprint, **not** an authentication token or reserved-price guarantee. Server submission recalculates from the PDF and current card under the same shop lock used by publishing. Missing/stale/mismatched fingerprints return 409 and require a fresh quote; the customer UI refreshes without automatically submitting again.
- Each newly submitted job stores `pricingSnapshot` in the same transaction as its integer `price`. The snapshot contains schema version, INR currency, card/shop identity, document/selected page counts, normalized range, copies, colour, paper, duplex, billing basis, unit paise, billable units, subtotal, minimum and final price. Later rate versions do not alter it.
- A database trigger prevents changing/removing a snapshot and prevents changing the associated price/options/page count. Normal lifecycle/status/attempt updates remain possible. This also prevents attaching a new snapshot retrospectively to historical rows.
- Unassigned legacy printers retain the original global schedule for compatibility; new jobs on that path receive a `LEGACY_DEFAULT_SCHEDULE` snapshot without requiring a new quoteKey from legacy callers. Existing jobs retain their original prices and NULL snapshot; no inferred/backfilled price history is created. This legacy path does not adopt records into any tenant.
- Electron navigation now allows the actual Pricing page, and its pricing setup step opens that authenticated page. It does not fabricate a native "prices configured" result. Owner navigation remains horizontally scrollable on narrow screens.

## Changed architecture/files

- `apps/web/lib/shopPricing.ts`: validation, unit calculations, version selection, shared shop lock and quote fingerprint.
- `apps/web/lib/uploadQuote.ts`: additive submitted quoteKey parsing; PDF/range safeguards retained.
- `/api/admin/pricing`: scoped GET and owner-only append/version-check POST.
- `/api/quotes`, `/api/jobs`: authoritative shop pricing, stale quote rejection, transactional snapshot creation and failed-job file cleanup.
- `CustomerPrinter.tsx`, owner `Pricing` page, `OwnerShell.tsx`, responsive navigation CSS.
- Prisma schema/migration and expanded test harness.
- Desktop policy/main allowlists and truthful pricing setup link.

Rate edits and submission share a PostgreSQL row lock, so each submission uses a single serialized active version. PDF parsing and the file write occur outside that lock; no long parsing operation blocks publishing. A job-creation or quote-conflict failure removes its provisional local file. This is not a replacement for durable cloud storage or submission idempotency.

## Additive migration — NOT applied remotely

File: `prisma/migrations/20261023030000_shop_pricing/migration.sql`

SHA-256: `44c54c097cb6a6bc6a591635741b0e8ad77dc7f9195a979a1f215246e2f1b452`

Adds one `ShopRateCard` table, restrictive shop FK, index, minimum constraint and nullable JSONB `PrintJob.pricingSnapshot`. Adds append-only rate-card and immutable-job-quote triggers, RLS and PUBLIC/anon/authenticated privilege revocation. Atomic transaction uses 10-second lock / 60-second statement timeouts. No historical DML, defaults applied to old prices, adoption, table drops or deletions.

The pending device-enrollment migration remains unchanged and precedes this migration in Prisma's ledger. Neither pending migration was applied to Supabase. Do not run a blanket `prisma migrate deploy` against the configured project: it would apply both, and needs explicit approval for the exact migration set.

Before rollout: confirm test project identity (`xkqetjzplwusogbrilja` is the previously configured test target, not freshly connected here), recheck both hashes and applied ledger, create a fresh private backup, restore-test it on an isolated database, compare historical job/printer hashes and prices, and verify server-role access after privilege changes. Obtain exact approval, then apply using the reviewed ledger-aware process, regenerate Client and repeat preservation/RLS/tenant checks. Never use an obsolete Phase 2E.1 runner without updating and reviewing its schema/checksum expectations.

**Runtime schema dependency:** this Client now includes `PrintJob.pricingSnapshot`. The new application must run against a migrated database; ordinary Prisma job reads against an unmigrated database can fail on the missing column. Do not promote/restart this build against the existing Supabase project until migration approval and rollout. The production build succeeding does not mean the current remote schema supports it. If rollback is necessary, roll back application code compatibly and retain additive schema/history; do not drop snapshots or restore over newer records without a separate recovery decision.

## Verification

- Web: 168 tests passed, three dedicated PostgreSQL suites skipped in the ordinary run and executed separately against a disposable Unix-socket-only PostgreSQL cluster.
- Disposable real PostgreSQL: all three integration suites passed. New pricing suite covers owner/staff permissions, unauthorized access, payload/query tenant-ID spoofing, missing shop rates, concurrent publishing (one success/one 409), authoritative quotes, stored price stability, database rejection of snapshot/price/rate edits and preservation of legacy records.
- Embedded PostgreSQL migration rehearsal applies the full prior chain, inserts historical fixtures before the pricing migration, then compares every original job/printer value (only nullable snapshot added), RLS and anon/authenticated table privilege denial.
- Unit/API/component tests cover range overlap, copies, odd duplex sheets per copy, simplex sheets, minimums, integer paise, invalid rates/ranges/copies, overflow, unsupported combinations, stale/missing/option-mismatched quote keys, mocked file cleanup, matching quote/job price, owner publish acknowledgement, staff-disabled editing, network errors and persisted historical receipts.
- Web TypeScript and production build passed; Prisma schema validated and Client generated locally. Existing non-blocking Next workspace-lockfile and Vite config warnings remain.
- Agent regression: 76 tests and typecheck passed; no adapter executed against a real printer.
- Desktop: 18 tests, typecheck and build passed, including Pricing navigation allowlist. Electron mock interaction checks passed after the setup-link update. No Windows execution, hardware verification or visual browser-layout audit is claimed in this phase.

## Remaining blockers / next work

1. Approval, fresh validated backup and rollout of the pending migrations. Actual account/email configuration and a permitted real test-account walkthrough are still prerequisites for test-project UI verification.
2. Private cloud PDF storage suitable for Vercel remains unimplemented; current local files/multipart uploads are not a production cloud storage solution. Repeated quote uploads should be replaced by a scoped validated-document handle when that stage is implemented.
3. Customer controls currently list the application-supported paper/colour/duplex options; the server rejects combinations not offered by the shop. A public sanitized offering descriptor could disable unavailable choices before upload in a follow-up improvement.
4. Native onboarding opens authenticated shop pricing but does not yet read saved cloud setup progress. Private storage, explicit live-worker activation and complete onboarding remain separate stages. The disabled-processing database CHECK and Phase 2A recovery barriers remain intact.
5. Rate history is append-only but no owner history viewer, tax model, payment collection, refunds, hardware capability verification or discount engine was added. Existing reports continue summing persisted job prices, not current rate cards.
6. Quote consistency fingerprints are not submission idempotency keys. A lost job-submission response still needs a separately designed idempotent submission flow; this implementation never automatically retries job creation.
