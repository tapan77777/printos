# Production deployment plan — explicit approval required

No deployment, promotion, push, environment update or production data change is authorized by this document alone. The predeployment review and a clean local commit are prepared first. Deployment approval covers the candidate build and subsequent promotion described here; any additional functional fix is reported before application.

## Release identity and scope

Deploy the reviewed local release commit on main. Do not deploy the dirty workspace and do not run `vercel redeploy` on the old production deployment: that would retain the old source/configuration. Git-triggered deployments remain disabled. Pushing is not part of this plan unless separately requested.

Keep every current Production environment value, especially the tested DATABASE_URL, Better Auth secret/origin, email, storage, enrollment and live-agent gates. No `vercel env` command, migration, db push, seed, schema change or RLS/permission change is needed. Build install runs only `npm ci --include=dev && npm run prisma:generate`, then `npm run build`.

Immediately before the approved deployment, re-inspect https://printos-ashy.vercel.app and record its current deployment. At review time it is dpl_GnoRhMBw6tzJZkrwF4Qtz3hDMARL (https://printos-ge3a4w6zr-tapan77777s-projects.vercel.app). If it changed, review that change before replacing it.

## Commands after approval

Run from the repository root, using the final reviewed commit SHA. The archive includes only tracked web/build/schema inputs, never ignored env files, local artifacts, desktop code or installers.

```sh
set -euo pipefail
release_commit="<reviewed release commit SHA reported with this plan>"
git cat-file -e "$release_commit^{commit}"
release_dir="$(mktemp -d /tmp/printos-production-release-XXXXXX)"
git archive "$release_commit" -- .gitignore package.json package-lock.json prisma apps/web | tar -x -C "$release_dir"
mkdir -p "$release_dir/.vercel"
cat > "$release_dir/.vercel/project.json" <<'JSON'
{"projectId":"prj_e73BpT1cla0LDcHpVsGHW9lm8hkV","orgId":"team_0zlxAaQ3CsonSP48xRhd8ghC"}
JSON
vercel deploy --prod --skip-domain --regions bom1 --yes --cwd "$release_dir" --meta releaseCommit="$release_commit"
```

The candidate uses existing Production variables and the project's existing apps/web root, but --skip-domain leaves the current public alias unchanged. Capture the returned candidate ID/URL. Before promotion require READY, a successful build/Prisma generation, the recorded releaseCommit, regions=[bom1], and no unexpected build actions. Inspect safe deployment metadata only; do not dump env values or use debug/verbose output. Source config and the CLI region must both say bom1. Do not create a protection-bypass secret or change project protection settings to test a protected candidate.

Then, as part of the approved plan:

```sh
new_deployment="<candidate deployment ID returned above>"
vercel inspect "$new_deployment" --json
vercel promote "$new_deployment" --yes --cwd "$release_dir"
vercel inspect https://printos-ashy.vercel.app --json
```

Verify the stable production alias points to the new ID and that its deployment metadata records Mumbai. Inspect new runtime serverless-event regions for the measured routes; edge/middleware regions may legitimately differ.

## Immediate production verification

1. GET auth health → 200; GET /login and /register → 200. Submit an empty registration payload → expected 400 VALIDATION_ERROR; create no account for this check.
2. Perform one account-free nonexistent-user sign-in lookup if needed → expected 401, proving the lookup path reaches Prisma. Do not repeatedly probe rate-limited auth endpoints.
3. Inspect sanitized account_failure logs on the new deployment. Any 500, wrong region, missing config or cookie regression stops the verification sequence. Report the fixed diagnostic fields, not raw logs, credentials, email addresses, SQL or request bodies. Do not apply a speculative fix.
4. Coordinate one owner-controlled login. The user enters credentials in their own browser; do not ask them to paste passwords, cookies or verification tokens into chat. Check shop-scoped dashboard/prices/devices, old jobs and shop switching. The app must neither mutate old jobs nor enable ordering/processing as a navigation side effect.

## Performance benchmark after promotion

Use current successful owner actions plus sanitized Vercel timing metadata and Server-Timing. No HAR, browser storage dump, raw request headers/body or account screenshots are collected. Optional numeric logging is off unless separately configured; changing another environment variable is not part of this deployment.

- Record the first observed request separately from 3–5 warm requests. A first observation is not proof of a cold start; use Vercel's function cold-start field where available.
- Login: measure the real owner login and, if safe within the existing five-per-minute rule, a second warm login. Do not increase rate limits or manufacture accounts for benchmark samples.
- Dashboard: record browser navigation-to-ready, Vercel request duration, main function duration, middleware/cold-start values and the backend region.
- Pricing/devices: measure initial server-rendered readiness. Also measure the existing read APIs in the same authenticated browser when comparing with the old API baseline. The new initial pages intentionally have no separate browser data fetch; do not mislabel page-shell or API time as full readiness.
- Summarize sample count, first/warm values, median and range. Do not report p95 from one or two samples. Separate browser/network/platform, server and inclusive database/hash/email timings. DB middleware includes client/pool/network waits; it is not pure PostgreSQL CPU or an isolated pool-wait span.
- Compare against the existing baseline: login 6.496 s, dashboard 16.168 s, pricing-read API 4.588 s, devices API 6.584 s; registration 3.743–6.612 s and shop creation 8.770 s. These baseline sample counts are small and must remain disclosed.

## Full onboarding journey after benchmarks

Coordinate one genuine, owner-controlled journey: register → email verification → create/select shop with automatic identifier → review/edit and save prices → generate/download QR on desktop and mobile → view the customer URL while ordering is off → choose Connect printer later → confirm dashboard reminder and saved state on revisit. Avoid permanent throwaway organizations: organization deletion is disabled and database cleanup is not approved. Prefer the owner's intended shop or obtain approval for one designated test shop/email first.

Verify that QR generation/download never enables ordering. Ordering enablement is an explicit owner decision; do not toggle it on an existing business shop or submit a customer PDF as an automated test without clear authorization. Physical printing, device activation and desktop Start are not part of this verification. No installer publication occurs.

If onboarding fails, stop, collect only sanitized category/class/subtype/code/provider status and timings for that request, and report the cause before further changes.

## Failure/rollback boundary

Before promotion, a failed candidate leaves the old production alias untouched. Do not promote it.

After promotion, do not silently restore the old release: the old code ignores orderingEnabled and could accept orders that the new owner controls disable. Preserve the deployment IDs and report the failure. Obtain explicit rollback approval with an operational intake pause or a reviewed gate-preserving fix. No database rollback, migration reversal, record deletion or secret change is part of recovery.

The prior deployment can be selected with `vercel rollback <approved-prior-ID>` only after that policy consequence is explicitly accepted. Do not execute this command automatically.
