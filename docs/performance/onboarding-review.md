# PrintOS performance and onboarding review

Measured 2026-10-24. This records the baseline proposal before implementation approval. See implementation.md for the completed local implementation and validation. Existing uncommitted diagnostics were preserved.

## Production request measurements

Read-only Vercel request metadata from existing successful owner actions. No new registrations, logins, shops, prices, devices or jobs were submitted. Most operations have only one observed sample, so these are observations, not p95 estimates. Registration has two successful samples.

| Operation | Samples | Platform request time | Main server function time |
| --- | --- | --- | --- |
| Login | 1 | 6.496 s | 6.278 s |
| Registration | 2 | 3.743–6.612 s | 3.531–6.075 s |
| Create shop | 1 | 8.770 s | 8.554 s |
| Dashboard GET | 1 | 16.168 s | 14.862 s |
| Read pricing API | 1 | 4.588 s | 4.582 s |
| Save pricing API | 1 | 5.330 s | 5.123 s |
| Read devices API | 1 | 6.584 s | 5.983 s |
| Read printers API | 1 | 5.502 s | 5.344 s |

Pricing page-shell requests took 257–303 ms and device page-shell requests 273–390 ms. These are not usable-page times: the client then fetches the slower APIs. The device screen already fetches its two APIs in parallel.

Production server functions execute in iad1 (Washington), with Mumbai/bom1 edge routing; the tested Supabase pooler hostname identifies ap-south-1 (Mumbai). This region separation is confirmed, not inferred from Vercel defaults. Recorded server cold starts were approximately 361–368 ms on the affected requests. Dashboard middleware also recorded 458 ms of cold start inside its 492 ms middleware duration. Unreported cold-start fields use -1 and must not be read as zero. Cold starts do not explain multi-second warm API calls.

The platform request duration includes Vercel routing and middleware overhead; it is not a full browser stopwatch. Function time includes database waits, CPU, hashing and email waits; there are no production DB spans to attribute it further yet.

## Database probes (Mac to Mumbai, not Vercel-to-Mumbai)

Three fresh clients per connection: direct initialization 423–704 ms; pooler 428–522 ms. Warm SELECT 1 (seven samples): direct median 55 ms (54–109), pooler median 325 ms (303–436). A read-only interactive transaction with SET TRANSACTION READ ONLY and SELECT 1: direct median 263 ms, pooler 463 ms.

A read-only profile of dashboard-shaped operations took 881 ms direct / 1,139 ms pooled for eight aggregate/count calls. The pooler uses connection_limit=1. Promise.all cannot make one transaction connection execute eight queries in parallel. This proxy does not include HTTP auth/session work or exactly reproduce all dashboard date filters, and is not a measured production SQL execution time.

Individual in-transaction reads on the pooler: pricing 147 ms, devices 125 ms, printers 124 ms (single samples). Prisma query events measured 56–71 ms for the pooled first SELECT, versus 285–314 ms wall time for that call. These spans do not isolate PostgreSQL CPU from DB network time and should not be called pure server execution. Pooling is working; these observations do not justify switching the production URL back to direct mode or increasing pool size blindly.

## Browser probes

Isolated Chromium without account cookies, desktop 1440 px and mobile 390 px, no form submissions. Login first contentful paint 416–796 ms; registration 344–820 ms. DNS 1–32 ms and TCP/TLS 138–154 ms on entry loads. Main-document request-to-first-byte 59–91 ms. No horizontal overflow was detected at the tested widths. Seven script resources loaded per entry page; resource downloads overlap and their durations must not be summed as elapsed page-load time.

Authenticated click-to-ready timing and React render profiling are not available from this signed-out browser. Existing request metadata covers successful real authenticated actions. No evidence currently makes React memoization a priority. No production polling loop was found on shops, pricing or devices. Desktop/browser account session state was not extracted.

## Prioritized fixes for approval

1. Configure the web functions for bom1, colocated with the existing Mumbai database. Keep the tested transaction-pooler URL and every existing auth/storage/printing environment value. Remeasure before changing connection limits. This is the highest-confidence infrastructure improvement; its exact savings remain unmeasured until an approved deployment.
2. Reduce repeated database round trips while retaining revocable DB sessions. Deduplicate owner resolution within a single server render (layout and dashboard currently call it separately). Consolidate the dashboard's eight aggregate/count calls into fewer scoped reads. Preserve shop, simulation, date and payment filters. The weekly result is currently fetched but not displayed. Avoid persistent auth/session caching or changing cookieCache security settings.
3. After shop creation, use the returned shop, explicitly select it and continue to setup; avoid another get-session + organization-list waterfall and manual reselection. Use client navigation for same-origin transitions. Avoid unnecessary client fetches by providing initial pricing/device data from an authenticated server load; keep mutations on the validated APIs. Devices already uses Promise.all, so adding another Promise.all there is not a fix.
4. Reuse the existing module-level Prisma client. Add sanitized operation/count/duration spans and Server-Timing in a controlled diagnostic path so connect/query/application/email/browser time can be distinguished. Production DB spans do not currently exist. Consider safe cold-instance markers and pool-wait instrumentation without logging SQL, query parameters, names, email addresses or tokens. Do not assume globalThis alone solves existing latency: production already reuses its module singleton.
5. Registration currently includes password hashing and verification-email work within its transaction path. Measure these stages before changing transaction behavior. Do not disable transactions, verification, rate limiting or secure pairing, and do not move delivery to untracked fire-and-forget work.

## Guided setup proposal

Reuse account, shops, pricing, devices and customer routes and the existing UI styles. Provide a responsive progress indicator and resumable steps derived from saved account/shop/rate/QR state. Keep verification as part of account registration.

1. Register and verify account; existing sign-in remains available.
2. Enter only a shop name; derive a valid identifier automatically, with a collision-safe suffix and backend validation. Handle punctuation, short and non-Latin names and simultaneous submissions. Use an immediate submit lock, disabled action and clear retryable errors. Continue with the newly created active shop.
3. Configure prices using editable, clearly labeled draft defaults (retain the existing A4 black-and-white ₹2/page starter rather than silently publishing prices). Show amounts in rupees; retain integer-paise validation, owner checks and rate-version concurrency protection on the server.
4. Generate a downloadable, print-friendly QR poster using the existing customer /p/{identifier} route and cloud intake identity. A physical desktop/printer is not required to create this identity. Reuse the QR approach and existing PDF tooling. Poster generation does not enable ordering or printing.

Offer “Connect printer later”; display a persistent dashboard reminder linking the existing secure pairing flow. Distinguish customer ordering from physical device processing: owner activation plus explicit desktop Start remain required for live printing. No installer publication or changed live-printing environment gates.

## Explicit ordering gate and compatibility decision

There is no current independent ordering-enabled field. Devices have processingEnabled, which controls printing, not customer ordering. The public quote and job-submission paths do not enforce a shop ordering toggle. Hiding the upload button would not satisfy the requirement.

Proposed minimum persistence: use a server-controlled key in existing Shop.metadata, with default inactive, rather than a schema or permission change. Protect it from generic organization create/update payloads and expose an owner-only, origin-checked explicit Enable ordering action. Check the gate on public upload-grant/finalization, quote and job-submission paths; recheck under the existing shop lock at job creation to prevent a disable/submit race. Continue to serve a friendly inactive page at the QR URL. Do not conflate enabling orders with enabling device processing.

The gate must fail closed: missing or false means inactive, including existing shops with no explicit ordering state. On rollout, existing owners would need to explicitly enable ordering before accepting new customer submissions. Existing jobs are preserved. This behavior change must be highlighted for deployment approval; no migration or automatic enabling is proposed. Local implementation does not change production ordering.

## Validation after implementation approval

Run focused auth/access/rate/ordering tests; real Next.js HTTP tests with isolated data and captured email; duplicate-submit, slug-collision, QR target, inactive-ordering API-bypass and mobile browser checks; typecheck and production build. Keep schema/permissions unchanged, preserve secure pairing and backend validation, and verify that setup never starts live printing or enables ordering implicitly. Commit and deployment require separate approval. No implementation, commit or deployment is part of this review.

Sanitized measurements are stored beside this report in measurements.json. References: https://vercel.com/docs/functions/configuring-functions/region ; https://vercel.com/docs/regions .
