# Local implementation handoff

Implemented locally after approval of the performance/onboarding proposal. No production deployment or push was performed; see release-checks.md and production-deployment-plan.md for the prepared local release. No cloud account, shop, price, ordering state, device or job was created or changed by this work. Production environment values, database schema and RLS were not changed. Existing uncommitted Prisma diagnostics were preserved.

## Resulting owner flow

1. Register and verify the account using existing Better Auth policies. Verification, password strength, rate limiting, revocable database sessions and secure cookies remain in force.
2. Create a shop from its name. A normalized, random-suffixed identifier is generated automatically. The form prevents duplicate in-flight submissions, and backend uniqueness/validation remains authoritative. Better Auth selects the created shop before returning, so the UI goes straight to /dashboard/setup without another session/list/reselection waterfall.
3. Review draft prices in rupees, initially A4 black & white at ₹2/page. Prices are saved only by an explicit owner action, through existing integer-paise validation and optimistic rate-version checks. The initial form is server-loaded, not fetched again on mount.
4. Generate and download a real A4 PDF QR poster. The code uses the existing /p/{identifier} customer route, with a persistent cloud intake identity. Generating that identity does not pair or activate a physical device and does not enable ordering.

The owner can choose Connect printer later. The dashboard retains a connection reminder and a link to setup. The device page retains the existing secure-pairing/activation controls, with authenticated server-loaded initial data rather than two additional browser requests on mount.

## Ordering and security

Shop.metadata stores the protected printos settings; no migration is needed. Missing, malformed or false orderingEnabled is inactive. New organization creation forces inactive state even if a caller supplies enabled metadata. Generic organization updates cannot override the protected state. Only the owner-only, same-origin setup endpoint can explicitly enable or disable ordering.

Ordering is checked for upload grants, document finalization/readback, quotes and job creation. The final quote/submission check holds the same shop row lock as ordering changes and rate updates. That prevents a submission from bypassing a concurrent disable. Closed shops show a friendly customer page without an upload form. Existing jobs and receipts are preserved.

Ordering and physical printing remain separate. Pairing, owner device activation, the live-agent gate and an explicit desktop Start are still required for real printing. No unverified installer was uploaded or published.

**Deployment impact:** existing shops with no explicit ordering setting will reject new customer submissions until their owner completes setup and explicitly enables ordering. Review this behavior before approving deployment; local implementation has not changed their production state.

## Performance changes

- vercel.json now proposes bom1, next to the existing Mumbai database. This has no production effect until an approved deployment.
- Owner resolution is deduplicated with React cache within a server render. Later requests still recheck the live DB session and membership; no persistent auth cache was introduced.
- Dashboard totals use one parameterized, shop-scoped aggregate statement instead of eight calls. Date, simulation, printer-heartbeat and payment filters are covered by executable PostgreSQL-compatible tests.
- Pricing and devices get authenticated initial data from the server. Browser review confirms zero initial pricing API requests and zero initial device/printer API requests.
- The existing module-level Prisma client is reused. No per-request client or forced connection was added.
- API Server-Timing and optional PRINTOS_PERFORMANCE_DIAGNOSTICS logs report fixed operation/stage names, numeric durations and query counts. Hashing delegates to the same Better Auth crypto functions; email delivery behavior is unchanged. No SQL, query parameters, credentials, email addresses, raw errors or request contents are emitted.

Timing stages are inclusive, not an additive CPU breakdown. Database middleware wall time includes client/pool/network waits, and concurrent query durations can overlap. These are not PostgreSQL CPU spans or isolated pool-wait measurements. Registration transaction behavior has not been changed.

## Measured local comparison

The already-tested Mumbai transaction pooler was used inside a strictly read-only RepeatableRead transaction. No record values or identifiers were printed or saved. Displayed totals matched in every trial. This compares the original eight-query pattern (including its unused weekly aggregate) with the new statement; the unused weekly proxy used the daily boundary, which does not affect the displayed-total comparison.

| Trial | Eight-query baseline | One-query implementation |
| --- | --- | --- |
| 1 | 1,075 ms | 145 ms |
| 2 | 1,147 ms | 174 ms |
| 3 | 1,557 ms | 652 ms |

Median: 1,147 → 174 ms (about 85% less query wall time in this local probe). This is **not** a production response-time measurement. Production region, cold-start and complete workflow improvements must be remeasured after separately approved deployment. Full sanitized results are in dashboard-local-comparison.json; original production measurements remain in measurements.json.

## Validation

- Standard suite: **239 passed**; the **six** conditional native PostgreSQL tests also passed when explicitly run on a disposable local cluster. The five previously skipped tests are resolved; a sixth setup/concurrency/preservation test was added. No production database was used as a write-test target.
- npm run typecheck --prefix apps/web: passed.
- npm run build --prefix apps/web: passed; private dashboard/setup/pricing/device routes are dynamic. Existing multi-lockfile workspace-root warning remains.
- Real Next.js HTTP fixture: registration, email verification, login cookies, active-shop selection and protection against ordering-metadata bypass passed. Accounts and mail stayed in memory. Timing headers preserve redirects and separate auth cookies.
- Real browser fixture: automatic identifier, duplicate-submit lock, draft price saving, PDF download, inactive customer page, explicit enable/disable, later-printer path, persistent dashboard reminder and initial-fetch removal all passed. Desktop 1440 px and mobile 390 px were inspected; no horizontal overflow or browser errors were observed. External browser requests were blocked.
- Aggregation tests execute parameterized SQL in isolated PGlite, including cross-shop/simulation/date/payment exclusions and fresh printer counts. The separate read-only TEST probe also confirms the new statement executes on real PostgreSQL and matches the original displayed totals.
- git diff --check: passed. No Prisma schema/migration files changed.

## Preview artifacts and limits

onboarding-preview/ contains desktop/mobile PNG previews and fixture result booleans. All displayed names and QR targets are synthetic; the fixture QR is not a production ordering link.

The PDF uses standard embedded Latin fonts. Unsupported shop-name glyphs are omitted, with a generic shop label if none remain; the browser shop name and generated identifier still support non-Latin input. Full multilingual shop-name rendering in the PDF would require an additional licensed font asset. Poster QR functionality does not depend on its heading.

The Mumbai region change and future rollout require deployment approval. Production performance, physical Windows printing and production PDF submissions were not exercised. See the local release commit and deployment plan; production remains unchanged pending approval.
