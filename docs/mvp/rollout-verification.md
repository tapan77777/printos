# Rollout preparation — 2026-10-24

No migration was applied and no remote database or Storage resource was modified by this verification. Final migration approval is still required.

## Verified live, read-only

- Project `xkqetjzplwusogbrilja`; direct approved host, database `postgres`, role `postgres`, TLS enabled. Public application table ownership and server RLS bypass pass the existing checks.
- Ledger contains exactly the four reviewed migrations through `20261023010000_tenant_accounts`, all finished with expected checksums.
- Bucket id/name `printos-documents`, public=false, limit=26214400 bytes, MIME list exactly `[application/pdf]`.
- Storage objects RLS enabled. Policy `printos_documents_client_deny`: RESTRICTIVE, ALL, roles anon/authenticated, USING and WITH CHECK both `(bucket_id <> 'printos-documents'::text)`.
- No local PrintOS web server or agent was running. Other computers/hosted writers must remain stopped for eventual execution.

## Pending migrations — unchanged approved order

| Migration | SHA-256 |
| --- | --- |
| `20261023020000_device_enrollment` | `aab1f8fd0ead0e815655aa659ff53c87cbd019c9cd16b0d9f5b8d3696a8a72ee` |
| `20261023030000_shop_pricing` | `44c54c097cb6a6bc6a591635741b0e8ad77dc7f9195a979a1f215246e2f1b452` |
| `20261023040000_private_documents` | `d29f48cc2d62c3fc7ddfdc3defbffde3dc77d54f9b6361c152fd2aed81e7315e` |
| `20261024000000_mvp_agent_activation` | `733f724c79a8327e9ea4068c7714b9d675763490c31d24142a625c5b0fdf8139` |

Approved plan hash: `113a7d0dff96b2b484ef56d7d5a46c3e45d975eeeba575cdfa1de2fac5025855`. Neither migration SQL nor plan/provisioning SQL was changed.

## Fresh backup

`.printos-backups/2026-10-24T07-52-03.021Z-mvp/database.dump`

SHA-256: `9fea4f5bdbef86cb2fb65e38fd729522d0c48665e334fa59c63d5251e5f2d47c`.

Created 07:52:03 UTC; restore validated 07:52:47 UTC. Full archive decoded, public application schema/rows restored in an isolated local PostgreSQL cluster; every baseline fingerprint matched. Provider-managed schemas/roles were not restored locally and require Supabase recovery tooling. Storage object bytes are not part of a PostgreSQL dump.

All public application fingerprints also match the previous backup: 10 jobs, 1 printer; all original prices and columns preserved. Folder mode 0700, dump mode 0600. Restore cluster stopped and temporary files removed. Refresh/revalidate if older than the runner's 30-minute apply window.

## Runner change and verification

The earlier ownership gate was an external diagnostic, not a check in the runner itself. The runner now explicitly verifies exact existing bucket settings, Storage RLS and restrictive policy before inspect/backup/apply/verify, and again after rollout. It does not require ownership of Supabase-managed tables or change roles. Existing bucket mode only verifies an already-provisioned matching bucket; no recreation or policy modification occurs. Missing or mismatched provisioning blocks migration application. BigInt file-size reporting is fixed by a SQL text cast.

`node --test apps/web/scripts/rollout-storage.test.mjs`: 16 passed (valid managed setup, read-only queries, missing/broadened policy, roles, RLS, size, MIME and public-bucket rejection). Runner syntax check passed; updated live inspect passed.

After explicit final approval: recheck local/remote writers, rerun inspect, refresh backup if stale, use README apply then verify commands. Do not run bucket creation. Stop on any error; no automatic rollback, restore, reset or retry.
