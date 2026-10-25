# Predeployment release review

Reviewed locally on 2026-10-25. This report does not authorize deployment.

## Gate results

| Gate | Result / evidence |
| --- | --- |
| Security and tenant scope | PASS. Owner-only setup/poster APIs use authenticated shop scope; mutation Origin checks remain in the session boundary; supplied shop IDs cannot override scope. Protected metadata cannot enable ordering via generic organization payloads. |
| Authentication compatibility | PASS. Real Next.js HTTP registration → verification → login → selected shop; native Prisma/PostgreSQL accounts, roles, invitation membership and session revocation tests passed. Password timing delegates to the existing Better Auth crypto implementation. Cookie headers and redirects are preserved. |
| Existing data preservation | PASS. Native setup test verifies read-only setup loading does not update the shop, and QR creation/ordering toggles do not change an existing job or printer or the shop's name/slug/createdAt. Native pricing tests preserve prior prices and immutable job snapshots. No migration, startup backfill, schema or permission update exists. |
| Ordering default and explicit activation | PASS. Missing/invalid metadata is inactive for new and existing shops. QR creation and download do not enable ordering or create a desktop device. Enable requires saved prices and an intake QR; only the authenticated owner can request it. Concurrent QR generation creates one identity under a real PostgreSQL row lock. |
| Public entry-point enforcement | PASS. Upload grants, finalization/readback, quotes and job submission check ordering. Quote/job checks share the shop lock with changes. Old jobs, receipts and owner/agent processing paths are not blocked or rewritten by this customer-intake gate. |
| Secure pairing/live printing | PASS. Existing native pairing and activation tests passed. No agent/desktop/printing code or live-printing environment value changed. |
| Secret/artifact review | PASS. Changed web files and performance artifacts contain no matches for privately read actual credentials; no private env files, keys, installers, dumps or migration files are in the release changes. Test passwords and addresses are synthetic. Source/data output was reviewed for raw SQL, cookie/token values and personal information; performance files retain only sanitized timing/counter data and fixture previews. |
| Dependency review | PASS for runtime: npm audit --omit=dev reports zero advisories. Three moderate development-only CSS-tooling entries remain (tailwindcss, postcss-nested, postcss-selector-parser); all three versions are unchanged from HEAD. No user-supplied CSS is compiled by a production request. These are documented maintenance risks, not new runtime exposures; a Tailwind major migration is outside this release. |
| Function region | PASS for release configuration. Project root is apps/web, where vercel.json sets regions=[bom1]; no route preferredRegion or per-function override exists. CI build/config tests assert Mumbai and no migration/automatic Git deployment. Actual deployed placement must be checked on the approved candidate and again in runtime events after promotion. |
| Standard tests/typecheck/build | PASS: 239 tests, typecheck and production build. The six conditional PostgreSQL tests are separately executed, not waived. Existing workspace-root/multiple-lockfile and Vitest config warnings are nonfatal. |
| Native PostgreSQL release gate | PASS: all five originally skipped tests plus the new setup release test ran on a fresh local socket-only PostgreSQL 18 cluster. Six files / six integration tests passed. Supabase was not used as a write-test target. |
| Desktop/mobile onboarding | PASS. Actual pages and API handlers ran in the isolated browser fixture; auto identifier, duplicate-submit lock, draft prices, real PDF download, inactive customer page, explicit enable/disable and later-printer reminder passed. Desktop 1440px and mobile 390px have no observed overflow/browser errors. No redundant setup refreshes or initial pricing/device browser fetches remain. |
| Unrelated changes | PASS. Release source is web onboarding/performance, focused tests and sanitized review evidence. Existing uncommitted diagnostic-class changes were already deployed and are included to preserve production diagnostic parity. No desktop installer, printer-agent changes or unrelated application files are added. |

## Assessment of the skipped tests

They were release gates because mocked/in-memory checks cannot prove native transaction locking, tenant constraints, Prisma serialization or stored-document behavior. They are no longer unresolved: the runner mounted the previously downloaded PostgreSQL tools read-only, created a mode-0700 temporary cluster, applied migrations only to that new local fixture, ran the tests, then stopped and removed the fixture. No production migration was run.

## Region proof and boundary

Current production baseline is dpl_GnoRhMBw6tzJZkrwF4Qtz3hDMARL, still running its existing code. The project root was reconfirmed as apps/web with Next.js and Node 24.x. The release's top-level web config selects bom1 (Mumbai), next to ap-south-1 Supabase. The deployment plan also passes --regions bom1 explicitly.

This affects server functions on the new deployment. CDN delivery and routing middleware remain distributed, as Vercel documents. A Mumbai edge header alone is not proof of backend placement: validate deployment regions and serverless function-event regions. Do not redeploy the old production ID to launch these code/config changes; upload the reviewed commit instead.

Reference: https://vercel.com/docs/functions/configuring-functions/region

## Rollout cautions

- All existing shops lacking an ordering setting become inactive for new customer submissions until their owner explicitly enables ordering. Their database records, jobs, prices and paired devices are preserved. No owner or device is silently activated.
- Prior production code does not honor this ordering flag. Promoting the old deployment after rollout could reopen intake. Do not automatically roll back across this policy boundary; obtain approval and an operational pause or gate-preserving fix if rollback is needed.
- The PDF uses standard Latin fonts; unsupported shop-name glyphs are omitted with a generic label fallback. The QR target remains correct. Full multilingual name rendering needs a separate licensed font asset.
- No production speed improvement is claimed yet. Local measurements are not Vercel benchmarks. Authentication and full onboarding in production are tested only after deployment approval, with user-controlled credentials and email verification.
