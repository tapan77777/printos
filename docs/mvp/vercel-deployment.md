# Vercel private TEST deployment checklist

Prepared on 2026-10-24. No deploy, commit, push, account creation, email delivery or physical printing performed. Supabase TEST project: `xkqetjzplwusogbrilja`. All approved MVP migrations have already been applied; never run migrations in the Vercel build.

## Verification

- Next.js 15.5.28 production build passed (30 generated pages); TypeScript passed.
- Focused web build/cloud-upload/private-storage tests: 10 passed. Desktop tests: 24 passed, including hosted HTTPS configuration, pairing, authorization and uncertain-outcome recovery with mocks.
- Production web dependency audit: zero reported vulnerabilities.
- Multiple-lockfile workspace-root warning is nonfatal; repository-root tracing includes the Prisma files outside apps/web. No application-code blocker was found. `apps/web/vercel.json` now records the existing reviewed install/build commands.
- Cloud upload/download behavior verified by code and mocks, not a live Vercel upload. Local authentication and Storage configuration checks currently report missing settings. Bucket provisioning alone does not configure the application's server credentials.

## Vercel settings

Import the existing `tapan77777/printos` GitHub repository into a separate Vercel TEST project. Framework: Next.js. Root Directory: `apps/web`. Enable **Include source files outside of the Root Directory in the Build Step** (Prisma schema/migrations live at repository root). Node.js: **22.x** (at least 22.12).

Install: `npm ci --include=dev && npm run prisma:generate`

Build: `npm run build`

Output: framework default `.next`. No custom start command. Do not install/run the desktop app or printing agent on Vercel. Select a function region near the Supabase project. PDF validation routes already declare a 60-second budget; confirm the selected Vercel plan supports it.

## Server-only environment variables

Use `apps/web/config/mvp.env.example` as the full template. Add values privately through Vercel Project Settings → Environment Variables; never put credentials in GitHub, chat or NEXT_PUBLIC variables. Configure the TEST deployment's Production environment; do not automatically share database/auth secrets with arbitrary branch previews.

| Variable | Required value/source |
| --- | --- |
| DATABASE_URL | Supabase **Connect → Transaction pooler**, approved TEST project/database, existing server-authorized role. Copy its actual pooler host/user/password privately; URL-encode credentials and use Prisma query options `pgbouncer=true&connection_limit=1&sslmode=require`. Do not reuse the migration runner with this pooled URL; it intentionally requires the direct target. |
| PRINTOS_AUTH_MODE | `tenant` |
| BETTER_AUTH_URL | Exact stable public HTTPS origin, e.g. your chosen Vercel TEST alias; no path. Must match the address opened by desktop/browser and email callbacks. |
| BETTER_AUTH_SECRET | Manually generate/store a dedicated random secret, at least 32 characters. Keep stable across deployments; do not rotate existing credentials incidentally. |
| RESEND_API_KEY | Server-side Resend sending API key. |
| AUTH_EMAIL_FROM | Sender on a Resend-verified domain. Test-only default senders can restrict recipients; verify permission to email every beta tester. |
| PRINTOS_TRUST_PROXY | `true` for direct Vercel hosting using its managed x-real-ip header. Do not copy this to an untrusted proxy deployment. `false` groups requests under shared IP limits (including upload/enrollment), which can throttle independent testers. |
| PRINTOS_DOCUMENT_STORAGE | `supabase` |
| SUPABASE_STORAGE_URL | `https://xkqetjzplwusogbrilja.supabase.co` |
| SUPABASE_STORAGE_SECRET_KEY | Existing project's server-only **legacy service_role JWT**, obtained privately from Supabase API keys. Current adapter sends this as both apikey and Bearer; do not assume an opaque sb_secret key is interchangeable. No anonymous/publishable key or client exposure. |
| PRINTOS_DOCUMENT_BUCKET | `printos-documents` |
| MAX_UPLOAD_BYTES | `26214400` |
| PRINTOS_DEVICE_ENROLLMENT | `enabled` |
| PRINTOS_LIVE_AGENT | `disabled` initially. Changing to enabled requires separate printing approval; owner Enable and desktop Start are still required. |

Keep `AGENT_CREDENTIALS_JSON=[]`; tenant mode uses paired, device-scoped credentials, not global AGENT_TOKEN/AGENT_ID credentials. Legacy OWNER_PASSWORD/SESSION_SECRET are not required for tenant authentication. No additional public Supabase Auth keys are needed: accounts use Better Auth plus Resend.

Optional: `PRINTOS_DOCUMENT_RETENTION_DAYS=7`, `PRINTOS_DOCUMENT_CLEANUP=disabled`; leave CRON_SECRET unset. Do not enable retention cron until its deletion behavior and dedicated 32+ character CRON_SECRET are separately approved. No persistent upload directory is needed.

## Serverless PDF behavior

Browser obtains a scoped grant → PUTs PDF directly to private Supabase Storage → sends small finalize/quote/job JSON to Next.js. Validation reads bounded bytes into function memory, checks PDF pages and copies to a separate canonical object; no persistent local disk is used. Authorized owner/customer/agent downloads use 60-second signed grants/redirects, not a 25 MiB function response. Agent verifies canonical size/checksum before printing. This avoids Vercel's 4.5 MB request/response limit. Actual 25 MiB validation duration/memory/CORS must be checked after approved deployment with a synthetic PDF; no real jobs submitted now.

Historical local PDFs remain on their original machine and return an explicit unavailable response on Vercel. Historical database records/prices are retained; no customer files should be copied automatically.

## GitHub and deployment sequence — requires approval before execution

1. Review the entire existing working tree: substantial MVP source is currently uncommitted/untracked. Review intended application/Prisma/docs changes, not just the new Vercel file. Verify `.env*`, backups, uploads, journals, node_modules and installers remain excluded. Never use an unreviewed blanket `git add .`.
2. After explicit commit/push approval, stage reviewed source files, commit and push the chosen branch to the existing repository. No Git operation was executed for this preparation.
3. Vercel → Add New → Project → import `tapan77777/printos`; choose a separate TEST project and the settings above. Pick the stable project name/HTTPS alias in advance and set BETTER_AUTH_URL accordingly. Add the environment variables before deployment. Git-triggered deployments are explicitly disabled by `git.deploymentEnabled=false` in apps/web/vercel.json. Keep that guard until deployment is approved. Clicking **Deploy** executes deployment and requires separate approval. A Git push to an already-linked auto-deploy branch can deploy too; check integration first.
4. Once deployment is approved, deploy that reviewed branch, inspect build logs and test the stable alias. Do not use rotating preview URLs for account callbacks or device pairing.
5. Ensure the TEST alias is reachable by QR customers and the native agent without Vercel's SSO/protection interstitial. Configure access protection explicitly for this TEST project; preserve PrintOS authentication and authorization. Do not embed a protection-bypass secret in the installer.
6. With approved synthetic accounts/data, verify register → email verification → login/recovery/logout → create/select shop → register printer → publish rate card → pairing. Verify QR on a phone: upload → authoritative quote → submit → owner preview/approval → status. A submitted job is a data mutation and requires separate test approval; use a mock-mode printer/device only. Keep physical printing disabled.

## Windows and remaining gates

Existing `apps/desktop/release/PrintOS Setup 0.1.1.exe` accepts an owner-entered hosted HTTPS origin; it is not pinned to localhost and needs no rebuild merely for the Vercel hostname. Set the same stable alias as BETTER_AUTH_URL. Existing pairing is bound to its origin; changing an already-paired profile requires proper revocation/re-pairing. Tests validate URL policy and simulated lifecycle, not Windows execution.

Windows execution/physical output are still unverified; installer is unsigned. Windows driver/printer access and an independently qualified SumatraPDF >=3.7 binary/hash remain required (official stable 3.6.1 does not satisfy the current guard). Do not lower that guard or turn on live processing during deployment setup. Real account/email and pooled database connectivity remain unverified until the externally configured hosted application is deployed with approval.

References: https://vercel.com/docs/monorepos/monorepo-faq ; https://vercel.com/docs/errors/function_payload_too_large ; https://supabase.com/docs/guides/database/connecting-to-postgres ; https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting ; https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts
