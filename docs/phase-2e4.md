# Phase 2E.4 — private cloud PDF storage

Implemented and verified with synthetic PDFs, isolated PostgreSQL and intercepted/mock storage services. **No Supabase changes, customer-file changes/copies, credential changes, deployments, commits, pushes or physical printing occurred.** Actual Supabase Storage and Vercel execution still require approved setup and acceptance testing.

## Storage choice and architecture

Supabase Storage is the preferred provider: it reuses the existing project and supports private buckets, path-scoped upload grants and expiring download grants. Local filesystem storage cannot provide durable Vercel documents. A separate S3 provider would add account/configuration work without a requirement that justifies it in this phase.

A small server-only adapter uses fixed Supabase REST endpoints with bounded bodies/timeouts, redirect rejection and no provider error-body logging. No new dependency was added. The adapter checks the project against DATABASE_URL and checks that the bucket is private, PDF-only and capped at the configured limit before operations. Metadata records bind the exact storage namespace, preventing a later bucket/project configuration change from silently reading/deleting elsewhere.

The bucket's anon/authenticated object access is denied. **Better Auth memberships are not Supabase Auth JWT identities**: PrintOS authorizes users/agents and uses a privileged server-only Storage credential. Do not add an `auth.uid()` policy pretending those identities are equivalent. The proposed restrictive policy also blocks this dedicated bucket when an existing permissive policy is broad. Supabase service credentials bypass RLS and must never be shipped to clients. See [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

### End-to-end flow

1. Customer opens the existing printer QR page. In cloud mode it requests a document slot with printer identity and byte count through a small JSON request. The server derives the tenant from the printer; unassigned printers cannot start cloud uploads. Database-backed limits allow 30 starts/hour per trusted IP or a conservative shared bucket; a printer has at most 100 recent pending slots.
2. Server creates a `StoredDocument` row and returns a random document capability plus a signed grant for one random quarantine key. Only a hash of the application capability is stored. Original filenames are not stored or used in keys.
3. Browser PUTs directly to Supabase using the scoped grant, `x-upsert:false`, omitted credentials and bounded timeout. PDF bytes never pass through a Vercel request body. There are no public PDF URLs.
4. Finalization requires the document capability. A compare-and-set admits one validator; the server reads bounded quarantine bytes, checks exact expected size, parses/counts the actual PDF with existing Phase 1A safeguards, then writes validated bytes to a **different, server-controlled canonical key** without overwrite. The SHA-256 and page count become immutable metadata. Replacing quarantine bytes later cannot change the canonical document.
5. Quotes/options and job submission use small JSON messages referencing the validated document. Each request checks capability, expiry, original printer/tenant binding and canonical size/checksum. Existing server rate-card calculations and quoteKey consistency checks remain intact. The browser reuses the validated upload on option changes; the server currently rereads canonical bytes to preserve Phase 2E.3 fingerprint semantics.
6. Job creation and one-time document attachment commit together. The job stores `fileId=cloud:<document-id>` and its immutable pricing snapshot; another submission cannot attach the same document again. No local PDF is written in cloud mode. The public job/status API and stored prices remain unchanged.

Vercel limits function request/response payloads to 4.5 MB, so both large uploads and downloads use direct Storage transfers rather than a 25 MB Next.js proxy. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## Authorization and downloads

Existing `/api/jobs/[id]/file` remains the authorization boundary:

- Fresh owner or staff membership must match the job's shop. `?preview=1` stays membership-only.
- Customer uses the submitting job's `customerSessionId` in `x-printos-customer-session`, never a document/object path. This capability remains scoped to that job and PDF availability; status receipts survive PDF deletion.
- Agent requires its authenticated device/shop/printer identity, enabled processing, matching active attempt and an unexpired DOWNLOADING lease. Paired-but-inactive devices are denied. No global agent credential is introduced.
- The metadata row must match document ID, job ID and shop and remain READY. Deleted/deleting documents return 410. Storage credentials and object keys are never accepted from the caller.

Authorized browsers receive a private, no-store redirect to a 60-second grant. `x-printos-download:manifest-v1` instead returns the scoped URL, SHA-256, size and expiration. The customer status page uses this manifest for its PDF download and keeps the recorded job receipt visible on errors.

The shared agent now requests that manifest, validates its HTTPS Supabase URL, exact canonical-path structure, size/hash and expiry, and downloads without forwarding PrintOS credentials or attempt headers. It rejects redirects, incorrect MIME/PDF signature, oversized bytes and checksum mismatch. A checksum failure and a permanently deleted document fail before physical submission. Transient transfer failures remain before DOWNLOADED and require fresh authorization on the next engine iteration. The durable journal, acknowledged authorization, SUBMITTING barrier and uncertain-print reconciliation remain unchanged.

**Grant limitation:** a download URL is a bearer capability for one object. Someone who obtains it may use it until expiry; membership/device revocation cannot instantly revoke an already issued URL. New issuance always rechecks authorization. A saved copy cannot be revoked. No exactly-once download/printing claim is made.

### Electron preview compatibility

The normal dashboard stays restricted to the configured cloud origin. Main process obtains an authorized manifest and opens a separate sandboxed window in an ephemeral session without cloud cookies, Node, preload or privileged IPC. Its network rules permit only the exact grant and Chromium's bundled PDF viewer resources; other remote objects/navigation are denied. Storage URLs are not added to general dashboard navigation. The session is cleared on close.

Synthetic macOS testing rendered the fixture PDF, verified the unprivileged window/session and captured `docs/phase-2e4-verification/private-preview-synthetic-macos.png`. This is not live Supabase, Windows, DPAPI or physical-printer verification. Reopen a preview to renew an expired grant.

## Expiry, deletion and retention

- Application upload/finalization/quote capability: 30 minutes, unusable after job attachment.
- Provider upload grant: Supabase documents a two-hour lifetime; this cannot be advertised as a 30-minute grant. The server reserves a 125-minute quarantine hold to include clock skew. See [signed upload lifetime](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl).
- Interrupted/invalid/abandoned uploads expire and are eligible for exact-key cleanup after that hold. A validator interrupted before committing READY is never treated as successful; choose the PDF again rather than resuming an uncertain write.
- Expired quarantine objects are removable even for active jobs; their validated canonical PDF remains available.
- Canonical PDFs for active jobs and RECONCILIATION_REQUIRED are retained. Only COMPLETED, FAILED, REJECTED, CANCELLED, REFUNDED and EXPIRED are terminal for deletion.
- On first maintenance observation of a terminal job, retention is scheduled for another seven days by default (configurable 1–365). This conservative clock avoids prematurely purging older jobs without a reliable terminal timestamp.
- Owner-only `DELETE /api/jobs/[id]/file` allows early deletion of a terminal job's cloud PDF. It checks membership/Origin and locks/checks job state. Access is blocked through a durable DELETING marker first. Canonical bytes are removed; quarantine is held until its upload grant cannot replay. A 202 response means delayed quarantine purge remains, not that all bytes are already gone.
- Provider deletion failures leave DELETING for retry. Completion stores a DELETED tombstone; jobs, prices, snapshots, printer records and status history are never deleted.
- Owner `POST /api/admin/documents/retention` is shop-scoped and **dry-run by default** (`{"dryRun":false}` explicitly executes). It does not touch legacy local files.
- Scheduled GET `/api/internal/documents/retention` is disabled by default. Enabling requires a separate 32+ character CRON_SECRET and explicit cleanup flag. It uses no browser session or agent credential, accepts no caller-selected shop/key and processes a bounded set of tenants/records with a loop budget. Counts/monitoring are needed if backlog exceeds the scheduled capacity.

Vercel documents automatic Bearer delivery of CRON_SECRET in its [cron security guide](https://vercel.com/docs/cron-jobs/manage-cron-jobs). The schedule is provided as a reviewable template only; no cron was installed. Retention runs only when an authorized operation/schedule invokes it. Purge is not a promise of removal from provider backups or deletion of already downloaded copies.

## Required manual configuration

Templates:

- `apps/web/config/private-storage.env.example`
- `docs/config/supabase-private-documents.sql` — **external change proposal, not executed**
- `docs/config/vercel-storage.example.json` — optional cron configuration, not merged/deployed

| Setting | Obtain/configure manually |
| --- | --- |
| `PRINTOS_DOCUMENT_STORAGE=supabase` | Enable only after approved schema and bucket/policy setup. Production/Vercel uploads fail closed otherwise. |
| `SUPABASE_STORAGE_URL` | Project HTTPS origin, e.g. the authorized project's API origin; must match the Supabase project in DATABASE_URL. No API path or credential in this URL. Custom domains/self-hosted origins are not supported by this initial adapter. |
| `SUPABASE_STORAGE_SECRET_KEY` | Server-only **service-role JWT** from the approved Supabase project's API settings. Do not rotate existing keys or paste them into chat. Never `NEXT_PUBLIC_`, renderer code, logs, Git or URLs. Modern non-JWT secret-key compatibility is not claimed by this adapter. |
| `PRINTOS_DOCUMENT_BUCKET=printos-documents` | Dedicated new private bucket. The SQL proposal stops if it already exists rather than altering existing files/settings. |
| `MAX_UPLOAD_BYTES=26214400` | Maximum 25 MiB. Coordinate application ceiling and bucket file-size limit; MIME restriction exactly application/pdf. |
| `PRINTOS_DOCUMENT_RETENTION_DAYS=7` | Integer 1–365; applies to newly scheduled terminal retention deadlines. |
| `PRINTOS_DOCUMENT_CLEANUP=disabled` | Keep disabled until the retention policy and schedule are approved. |
| `CRON_SECRET` | Optional dedicated random 32+ character token entered privately before enabling scheduled cleanup. Vercel Cron sends it as Bearer authorization. Never reuse agent/account credentials. |

Run `npm run storage:check --prefix apps/web`. It prints presence/shape results only, never secret values, and performs no network operation. Current local inspection reports cloud mode, URL, secret and bucket missing; cleanup is disabled. No live environment file was edited.

After approval, create the dedicated private bucket with 25 MiB/PDF-only restrictions and the restrictive anon/authenticated object policy. Review existing storage policies and verify that the server role can sign/read/write/delete while unauthenticated/authenticated clients cannot list/read/write/delete the bucket directly. Test browser CORS for the exact development/hosted origins and signed PUT headers using synthetic PDFs. Do not loosen object-read policies to solve CORS errors.

For Vercel, configure server-side database/auth/email/storage variables in the intended test environment only, use a supported Node >=22.12 runtime, place functions near the database/storage region, and ensure the plan permits the declared 60-second function duration. Benchmark PDF memory/time at the accepted limit before private beta; PDF parsing is not an antivirus/sandbox service. Configure HTTPS BETTER_AUTH_URL to the actual hosted origin. No packaged desktop build should depend on localhost. Do not enable live printing as part of deployment/storage setup.

Standard signed PUT works for this initial bounded implementation; it is not resumable. Supabase recommends TUS for files above 6 MB. Interrupted transfers require an explicit retry/new selection, not a fake completed upload. See [standard versus resumable uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

## Migration and rollout gate

`prisma/migrations/20261023040000_private_documents/migration.sql`

SHA-256: `d29f48cc2d62c3fc7ddfdc3defbffde3dc77d54f9b6361c152fd2aed81e7315e`

Adds only StoredDocument, unique/indexed keys/job binding, restrictive FKs, metadata constraints, immutable document identity/hash/page-count/job binding trigger, RLS and PUBLIC/anon/authenticated privilege revocation. No existing job/printer/price column changes or historical DML.

Separate bucket/policy proposal SHA-256: `3907439c9d3120085ffed0c561b6e3c7082f0c3a49ea6c2fbc3a921b6ee21b49`.

The preceding pairing and pricing migrations remain pending remotely according to the last verified project state. This phase did not connect to Supabase or verify a new live ledger. Do not run blanket migrate deploy: it would apply the whole pending set.

Before requesting rollout approval: recheck exact test project identity and all SQL/ledger hashes; create a fresh private backup and validate restoration in a disposable database; compare historical rows/prices/printers; verify the server role after RLS/privilege changes; review exact bucket/policy changes separately. Stop on an existing bucket, unexpected schema drift, backup failure or destructive requirement. Apply only the approved set, regenerate Client and verify preservation/security before enabling cloud mode. Prefer a reviewed forward repair after rollout; never drop metadata or restore over later records automatically.

## Verification

- Web: **179 passed**, four database suites skipped in the ordinary run and executed separately.
- Real disposable PostgreSQL: four integration suites passed, covering existing account/tenant/device/rate behavior plus direct-upload metadata, real PDF validation, token/printer isolation, immutable canonical copy, authoritative quote/job snapshot, one-use job attachment, owner/staff/customer/agent access, lease/activation denial, expiry, tampering, retention, delayed quarantine purge and retryable deletion.
- Embedded PostgreSQL: complete migration chain preserves historical job/printer rows exactly; RLS/client privileges deny document metadata. Proposed Storage policy also tested against broad permissive fixture policies without affecting unrelated buckets.
- Storage REST mocks: fixed private paths, bucket privacy/limits, no overwrite, bounded streams, signed URL/path validation and sanitized provider errors.
- Customer component fixture: one direct upload reused across option changes; quotes use JSON and no Storage admin credential reaches the browser. Cloud job integration forbids local PDF writeFile calls.
- Agent: **81 passed**, typecheck/build passed, including manifest expiry/origin/hash checks, credential non-forwarding and permanent download failure before submission, plus existing journal/recovery regressions.
- Desktop: **20 passed**, typecheck/build passed. Electron navigation/pairing/isolated-PDF mock checks passed. Screenshot visually inspected; no real printing.
- Web typecheck/production build and Prisma validation/Client generation passed. Existing Next lockfile-root and Vite future-config warnings remain. No new dependency/security-upgrade claim is made.

## Remaining blockers

1. Separate approval and backup-gated rollout of schema and bucket policy; manually configure server secrets, account email and actual test users with approval.
2. Approved real-provider tests must verify signed PUT/no-overwrite, direct access denial, CORS, exact limits, grant expiry, deletion and Vercel end-to-end behavior. Mocks and fixture RLS do not prove provider configuration.
3. Existing local customer PDFs remain untouched. Preview continues on the original development installation even with cloud mode enabled; a non-Vercel production installation may explicitly enable legacy reads with PRINTOS_LEGACY_LOCAL_READ. Vercel always refuses local fallback. A separately approved import is required to make historical local PDFs available in the cloud; job status/prices remain available without them.
4. Load-test large/malicious PDFs and concurrent validation; add resumable uploads and more granular abuse controls before broad public use. Current canonical rereads on quote changes cost bandwidth but preserve existing fingerprint/checksum semantics.
5. A lost job-submission response must be reconciled through the owner; this phase never automatically creates another job. One-use document attachment blocks reuse, but it is not a complete receipt-recovery UX.
6. Cloud downloads require the updated manifest-capable agent; older agents receive 409 rather than an unsafe redirect. Existing installer artifacts were not rebuilt in this phase and must not be assumed to contain this update. Live-agent activation and complete onboarding remain separate. Paired devices remain inactive, and Windows execution/physical printing/installer acceptance are still unverified.


### Main source and test entry points

`apps/web/lib/privateStorage.ts`, `documents.ts`, `documentHttp.ts`, `customerDocumentUpload.ts`; new document/retention API routes; existing quote/job/file routes and customer upload/status components; `prisma/schema.prisma`; the additive migration and configuration proposals above. `apps/agent/src/core/CloudClient.ts` adds the manifest protocol and `Engine.ts` classifies permanent document removal. Electron changes are confined to preview isolation/policy and a synthetic preview review script. Agent activation, device pairing secrets and authentication behavior are unchanged.

Reproduce with `npm test --prefix apps/web`, `npm run typecheck --prefix apps/web`, `npm run build --prefix apps/web`, and the equivalent agent/desktop test/typecheck/build commands. `npm run test:electron --prefix apps/desktop` uses mock services. `PRINTOS_TEST_PG_BIN=/path/to/trusted/postgres/bin node apps/web/scripts/test-tenant-postgres.mjs` creates/stops/removes a private Unix-socket fixture cluster, never loads the application's .env and never connects to Supabase. `storage-policy.test.ts` and `tenant-migration.test.ts` rehearse policy and historical-data preservation with embedded PostgreSQL.
