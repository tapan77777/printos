# PrintOS private-test handoff

This is release integration, not another product phase. No remote migration, bucket creation, account creation, secret change, deployment or physical print was performed.

## Implemented

The paired desktop now has explicit Prepare → owner Enable → desktop Start/Stop controls. Device-scoped credentials remain in OS-protected storage and pass to one utility worker over parent IPC, never renderer/env/logs. The worker runs the existing shared claim/download/checksum/ACK/journal/SUBMITTING/spool-monitor/reconciliation engine. It checks device activation/configuration and pins the selected printer identity on agent requests. Closing the window leaves an explicitly started worker running; Exit/Stop and desktop logout stop safely. Restarting the application does not automatically resume printing. Recovery retains the original attempt and never blindly resubmits an uncertain print.

The Jobs screen can record the owner's inspected COMPLETED/FAILED outcome through the existing reconciliation API. Cancel does not mutate. Windows spooler acceptance still does not prove physical output; inspect output before resolving. No payments or UI redesign was added.

Existing screens cover account registration/verification/login → select/create shop → Devices & printers registration → Pricing → desktop pairing approval/receipt → Windows discovery/selection → qualified renderer → preparation/owner activation → QR → dashboard. Customer QR remains upload → authoritative quote → submit → owner review → status. No cloud accounts or customer jobs were created to test this against the existing database.

## Current remote state (read-only verified)

Project `xkqetjzplwusogbrilja`, database postgres, TLS enabled, server postgres role bypasses RLS and owns public tables. Applied through `20261023010000_tenant_accounts`. Four pending migrations:

1. `20261023020000_device_enrollment`
2. `20261023030000_shop_pricing`
3. `20261023040000_private_documents`
4. `20261024000000_mvp_agent_activation`

The last migration replaces the intentional always-false processing CHECK with configured/confirmed/non-revoked device requirements, adds three nullable configuration fields, and fences new claims/authorizations against disabled/revoked devices. It does not enable any device or update historical jobs/prices/printers. The UTC credential comparison is explicit, independent of PostgreSQL session timezone.

Administrator provisioning is now read-only verified: `printos-documents` is private, PDF-only, limited to 26,214,400 bytes. Storage objects RLS is enabled; `printos_documents_client_deny` is RESTRICTIVE FOR ALL TO anon/authenticated with the exact reviewed USING/WITH CHECK expressions. Do not recreate the bucket. See `rollout-verification.md` for the current backup and approval gate.

Exact file hashes: `rollout-plan.json`. SHA-256 of its parsed/re-serialized JSON, as enforced by the runner:

`113a7d0dff96b2b484ef56d7d5a46c3e45d975eeeba575cdfa1de2fac5025855`

Fresh private backup: `.printos-backups/2026-10-24T07-52-03.021Z-mvp/database.dump`

SHA-256 `9fea4f5bdbef86cb2fb65e38fd729522d0c48665e334fa59c63d5251e5f2d47c`.

The full archive was decoded and public application schema/rows restored to a disposable PostgreSQL cluster; every baseline row fingerprint matched. Provider-managed schemas/roles were not restored locally and require Supabase recovery tooling. Backup permissions are private; no customer PDF bytes were copied. A stale backup must be refreshed before applying.

## Exact rollout procedure — approval required before apply/bucket

Run from repository root on this Mac. Stop test writers/agents during the backup/apply window; do not restore over new data automatically. The runner verifies the fixed test target, TLS/server ownership, applied ledger checksums, all pending SQL hashes, unknown migration directories and historical row hashes. It stops on drift, old/unvalidated backups, permissions failures or any mismatch in the administrator-provisioned private bucket/restrictive policy. Storage table ownership is not required; the exact security configuration is verified instead. It never retries/rolls back remote data automatically.

Trusted PostgreSQL tools (mount only if not mounted):

```sh
hdiutil attach -readonly -nobrowse -mountpoint /tmp/printos-phase2e-pg-mount /tmp/printos-pg-tools/Postgres-2.9.6-18.dmg
export PRINTOS_PG_BIN=/tmp/printos-phase2e-pg-mount/Postgres.app/Contents/Versions/18/bin
node apps/web/scripts/mvp-rollout.mjs inspect
node apps/web/scripts/mvp-rollout.mjs backup
```

Set the private folder emitted by backup, then restore-validate it. No database writes occur in these commands:

```sh
export PRINTOS_MVP_BACKUP=/Users/tapannaik/Desktop/printos/.printos-backups/2026-10-24T07-52-03.021Z-mvp
node apps/web/scripts/mvp-rollout.mjs validate-backup "$PRINTOS_MVP_BACKUP"
```

**Only after explicit approval for this exact project/plan and bucket proposal**, with a backup less than 30 minutes old:

```sh
node apps/web/scripts/mvp-rollout.mjs apply "$PRINTOS_MVP_BACKUP" --approve-project=xkqetjzplwusogbrilja --approve-plan=113a7d0dff96b2b484ef56d7d5a46c3e45d975eeeba575cdfa1de2fac5025855
node apps/web/scripts/mvp-rollout.mjs verify "$PRINTOS_MVP_BACKUP"
```

The first applies only the reviewed pending chain via Prisma and regenerates Client. The bucket/policy already exists and is verified without modification before apply and after rollout. The final check compares original columns/row fingerprints, migration ledger, server access, RLS and anon/authenticated denial. If any command fails, stop and inspect; no reset/restore/drop is authorized. Do not use old phase-specific migration/backup runners for this set.

## Vercel preparation — not deployed

- Use a separate **test** Vercel project. Root Directory `apps/web`; allow source files outside the root so `../../prisma/schema.prisma` is included. Select Next.js and Node >=22.12. `vercel.json` here is a template to copy into the configured web root after review, not a deployed configuration. Install includes dev build tools and Prisma generation; build runs Next.js.
- Manually merge `apps/web/config/mvp.env.example` into the test environment. Supply DATABASE_URL, BETTER_AUTH_URL/SECRET, RESEND_API_KEY/AUTH_EMAIL_FROM, SUPABASE_STORAGE_SECRET_KEY privately. No NEXT_PUBLIC credentials. Keep verified email mandatory. The stable hosted HTTPS origin must match BETTER_AUTH_URL and the desktop cloud address.
- Customer QR pages and agent endpoints must be reachable without a Vercel authentication interstitial. Use an appropriately configured test-domain/project protection policy; do not disable PrintOS account verification or owner API authorization. No protection-bypass secret is built into the desktop.
- Configure the private bucket after approval. Run `npm run auth:check --prefix apps/web` and `npm run storage:check --prefix apps/web` locally; manually verify the equivalent hosted environment. Retention cron is optional for the first controlled walkthrough and disabled until explicitly configured.
- Start with PRINTOS_DEVICE_ENROLLMENT enabled, PRINTOS_LIVE_AGENT disabled. After approved setup and mock verification, explicitly enable the cloud live-agent gate; each owner still must enable a device and the desktop must Start. Installation/onboarding never automatically prints.
- When deployment is separately approved, deploy through the test Vercel project; do not run a deploy command now. Afterwards verify HTTPS auth/email, private storage, prices, QR upload/status, preview and device revocation with approved synthetic records before physical printing.

## Windows computer instructions

1. Copy the final unsigned `apps/desktop/release/PrintOS Setup 0.1.1.exe`; verify its SHA-256 against `../mvp-verification/artifacts.json`. Windows execution and installer acceptance have not been tested on this Mac. No production code-signing certificate is configured; Windows may warn.
2. Install as the current user, configure the approved hosted HTTPS URL, sign in/register and verify email, select/create the shop. Register a cloud printer and publish supported rates using existing dashboard screens. No historical record adoption.
3. Start pairing, compare code/fingerprint, approve the specific shop/printer in Devices & printers, then Check approval in the desktop. Discover installed Windows queues and select the intended one.
4. **Renderer prerequisite:** the existing adapter requires independently trusted SumatraPDF >=3.7 and its exact SHA-256. Official stable download is currently 3.6.1; do not rename it, lower the guard or assume it supports all required flags. Obtain/review a suitable official pre-release or qualified build and its checksum before selecting it. The component is not redistributed in this installer; its GPL redistribution requirements are therefore not silently bypassed. Official sources: [downloads](https://www.sumatrapdfreader.org/download-free-pdf-viewer), [pre-release](https://www.sumatrapdfreader.org/prerelease), [printing flags](https://www.sumatrapdfreader.org/docs/Command-line-arguments).
5. In Printer settings enter the independently verified hash, select the executable, and Prepare. Then explicitly enable that device in the owner dashboard and use Start authorized processing **only when physical printing has been separately approved**. For safe simulation use a simulation-only cloud printer and mock pairing; it never invokes a physical adapter.
6. After print approval, test one harmless PDF first: quote/copies/range/options → owner approval → claim/download/checksum → authorized submission. Verify spool and physical output, then record the inspected outcome if reconciliation is required. Test Stop/restart/network loss without resubmitting an uncertain attempt. Never delete the journal to recover.

## Verification and remaining limits

Web/agent/desktop tests, production build, Prisma validation, disposable migration chain, mock supervised worker and Electron mock checks are recorded in `../mvp-verification/`. Mock worker tests exercise completion, denied ACK and restart after uncertain submission with exactly one mock adapter invocation. They do not qualify a printer driver or renderer.

Remaining manual gates are exact remote rollout approval, hosted account/email/storage configuration and deployment approval, a Windows PC/driver, and a qualified renderer. Real Windows spooler/physical output remains unverified. Private test installation is not a production readiness claim. Existing local PDFs remain untouched and are not magically available on Vercel.
