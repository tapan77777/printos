# Phase 2A — Reliable attempts and Windows readiness

## Scope and guarantees

The shared TypeScript core now owns cloud requests, claims, leases, durable state,
shutdown, reconciliation and diagnostics. CUPS and mock adapters own only OS/device
operations. The PDF/quote workflow and premium frontend remain in place; small
presentation additions expose the real reconciliation state and simulation marker.

**This is not exactly-once physical printing.** The implementation prevents automatic
resubmission of the same claimed job by compliant agents under the documented durable
storage assumptions. A spooler can still print after an application timeout, drivers
can duplicate output, customers can submit separate duplicate jobs, operators can
print outside PrintOS, and faulty storage can violate fsync guarantees. The safe
choice is to block an uncertain attempt, sometimes requiring human inspection even
when no print actually occurred.

## Architecture and files

- `apps/agent/src/core/Engine.ts`: one active attempt, acknowledged submission gate,
  restart recovery and reconciliation. No OS commands or cloud credentials in adapters.
- `core/Journal.ts`: private atomic writes, file fsync, rename, POSIX directory sync,
  checksummed PDFs, process lock, scope binding, terminal metadata archive.
- `core/CloudClient.ts`: bounded downloads/JSON, timeouts, idempotent retries, strict
  acknowledgment checks, HTTPS except loopback; redirects are refused.
- `LaptopPrintDevice.ts` and `adapters/ipp.ts`: single `lp` invocation; bounded local
  IPP Get-Job/Printer-Attributes; structured terminal states rather than queue disappearance. Submission and probes
  target the same local CUPS server; job titles bind spool IDs to the attempt, preventing
  reused OS IDs from being mistaken for the original job.
- `MockPrintDevice.ts`: latency/failure/skip-download settings retained. Its spool ID
  records deterministic completion time/outcome, so observation survives adapter restarts.
- `adapters/WindowsPrintDevice.ts`: explicit fail-closed interface placeholder.
- `lib/agentAuth.ts`, `attemptAccess.ts`, `agentHealth.ts`: scoped credentials, attempt
  authorization and freshness derivation.
- Claim/status/file APIs, atomic owner approval/rejection, agent recovery/heartbeat/
  health routes, and an owner-only reconciliation route.
- `prisma/migrations/20261023000000_reliable_attempts/migration.sql`: additive migration,
  tested in disposable embedded PostgreSQL; **not deployed**.

## Server protocol

Each agent sends `Authorization: Bearer <token>` and `X-PrintOS-Agent: <id>`.
The server's `AGENT_CREDENTIALS_JSON` holds entries with `id`, `printerDeviceId`,
`mode` (`cups` or `mock`) and `tokenSha256`. Authentication returns a trusted scope;
caller-supplied IDs cannot select another printer. Rotation/revocation is an operator
configuration/redeployment operation; this task does not modify actual secrets.
The optional single-agent compatibility path requires AGENT_ID, AGENT_DEVICE_ID and
AGENT_TOKEN together and remains CUPS-only. An unbound global token is denied.

1. The client durably records a random attempt UUID before `POST /api/jobs/claim`.
   The conditional update atomically binds that attempt and moves APPROVED to
   DOWNLOADING. A unique attempt index and state predicates arbitrate concurrent claims.
   Repeating the same attempt returns the existing job. One request claims at most one.
2. Claims with any existing attempt or legacy claimedAt are never automatically
   reclaimed, even when expired. This prevents stale agents from printing reassigned
   work; permanently abandoned attempts need inspection, not automatic requeueing.
3. Status and file requests also require `X-PrintOS-Attempt`. File access is limited
   to the original agent/printer/mode, DOWNLOADING state and a live lease. Owner PDF
   preview remains protected by the existing owner cookie and works after completion.
4. Status events contain a UUID eventId and `operation`: `renew`, `authorize`, or
   `report`. The server atomically compares current state, owner, attempt and last
   event ID. Duplicate events return acknowledgments without reapplying effects;
   reusing an event ID with different content is rejected.
5. `authorize` with PRINTING requires DOWNLOADING, an unexpired lease and a null
   submissionAuthorizedAt latch. It persists PRINTING and the permanent latch before
   acknowledging. A replay is accepted only while the same acknowledgment/lease is valid.
6. Only after verifying that acknowledgment does the agent durably write SUBMITTING.
   It checks stop/expiry again, then invokes the adapter once. A failed journal write
   prevents invocation. After the OS call returns, the spool ID is persisted before
   any cloud report. Spool identity cannot subsequently change.
7. The adapter reports confirmed completion/failure; missing IDs, command exceptions,
   unknown spool history and completion timeouts require RECONCILIATION_REQUIRED.
   A timeout never asserts cancellation. Observing a known spool ID can later resolve
   the same attempt without another submission.

Initial leases are 30–300 seconds (default 120); renewals use 120 seconds. Renewal
of an expired lease by the original agent is safe because no other agent can reclaim
that attempt. Reporting an existing submission may continue after lease expiry;
expiry controls starting a submission, not whether its outcome may be recorded.

## Journal and crash boundaries

The default directory is `~/.printos-agent/<AGENT_ID>`; AGENT_STATE_DIR can choose
another private local directory. Tokens are never persisted in the journal. Scope
is bound to a hash of cloud URL, agent, device ID and mode. Do not put active state
on temporary disks, shared/network folders or sync services; do not delete it to
"fix" a stuck job. PDF files use private permissions where supported and are
removed on terminal resolution. Terminal history contains metadata, not documents.
Empty queue polls do not create history archives. Terminal metadata retention is
currently manual; archive it safely rather than deleting active evidence.

| Durable phase at restart | Recovery |
| --- | --- |
| CLAIMING | Replay the same claim UUID; a lost response cannot create another claim |
| CLAIMED | Renew as needed, wait for detectable printer availability, download |
| DOWNLOADED | Verify checksum; redownload only before submission authorization |
| AUTHORIZING | Replay the exact pending event; denied/expired authorization quarantines |
| SUBMITTING | Outcome is unknown; never invoke the adapter again |
| SUBMITTED | Observe the recorded OS spool ID; never submit again |
| RECONCILIATION | Observe a known ID or await explicit owner inspection |
| REPORTING | Replay the same final event until acknowledged |

If local state is missing, the recovery endpoint discovers server-owned active
attempts. They are quarantined instead of being adopted for printing. A known spool
ID can still be observed. Corrupt/scope-mismatched state fails closed. A live process
lock rejects another process using the same directory. Dead process locks are recovered
under a serialized acquisition guard; PID reuse, unreadable owner metadata or an
interrupted lock-acquisition guard require operator inspection. Ordinary engine
restart does not require manual state changes.

SIGTERM/SIGINT stops new processing, waits for the current bounded step, then releases
the lock. A forced termination leaves its durable barrier for restart recovery.
Logs contain fixed diagnostic codes, version and mode, not documents, tokens,
printer names, raw server errors or local file paths.

## Offline operation and request budgets

| Operation | Internet required? | Behavior offline |
| --- | --- | --- |
| Claim, renewal, PDF download | Yes | Persist state and retry the same safe operation later |
| New submission authorization | Yes | No physical call without a valid acknowledgment |
| OS submission immediately after authorization | No new request | May continue once with a valid gate and durable barrier |
| Observe an already submitted local spool job | No | Continue locally; persist observed outcome |
| Report outcome / heartbeat | Yes | Keep pending outcome; replay after reconnection |
| Resume an uncertain submission | Not automatic | Human/known-spool reconciliation only |

Cloud requests default to 10 seconds each and at most three attempts, with bounded
exponential backoff/jitter. Only idempotent protocol operations are retried. JSON is
capped at 128 KiB and PDFs at 25 MiB; bodies are read under the request timeout.
`lp`/discovery commands have a 15-second deadline and 128 KiB output limit. Local
IPP queries have a five-second deadline and 128 KiB response limit. Concurrency is
one active attempt; heartbeats are separately bounded and never overlap themselves.
Network failure does not turn a potentially submitted job into a retryable print.

## Health and simulation safety

`POST /api/agent/heartbeat` records the agent's version, OS, mode, processing state,
server-timestamped heartbeat and detected printer availability. Owner-only
`GET /api/agent/health` derives online/offline using a 45-second TTL. Stale or
future timestamps imply offline/unknown availability. Dashboard and printer-list
availability also apply freshness; stored Printer.status alone is not live health.

CUPS availability means a fresh local spooler observation: accepting jobs, idle or
processing, without known blocking/offline reasons. It is not a guarantee that a
remote hardware device is powered on, has paper, or will successfully output pages.

Mock credentials can claim only simulationOnly printers; physical credentials cannot
claim those printers. New simulated jobs are marked simulation=true and excluded
from business aggregates. Migration recognizes prior SIM-/sim- tags in the new flag
without changing historical prices/statuses. Mock completion no longer invents a
one-page output measurement. Register a simulation printer only in an isolated test
instance, using the owner API's additive simulationOnly field or the seed script's
`--simulation` flag. Do not run a simulator against production jobs.

## Human reconciliation

There is no new UI redesign. The Jobs list and customer receipt expose the real
reconciliation state. The protected owner API supports explicit inspection workflows:

`POST /api/jobs/:id/reconcile`

- Body `{attemptId, resolution: "RECONCILIATION_REQUIRED", note}` quarantines an
  expired DOWNLOADING/PRINTING attempt. A live lease cannot be quarantined this way.
- After checking the physical output/spooler, `{attemptId, resolution: "COMPLETED"
  | "FAILED", note}` resolves only a quarantined attempt.
- Neither operation resets submissionAuthorizedAt, changes attempt identity, requeues
  work or cancels an OS spool job. An operator must account for any still-active spool
  job before deciding to create another customer request. Notes/timestamps persist.

A complete guided operator inspection UI and remote safe cancellation are future work.
Never clear a latch or reset a job to APPROVED as a recovery shortcut.

## Migration and rollout (not executed)

1. Stop old agents and freeze approvals during a planned maintenance window. Inventory
   existing claimed/active jobs and inspect their real spool/output before proceeding.
2. Back up the database. Test all migrations and a restored database in staging.
3. Apply the additive migration through the normal approved deployment process, generate
   the Prisma client and deploy the new server and agent together. No production
   migration, seed or job submission was performed in this implementation task.
4. Configure distinct scoped credentials out of band; match AGENT_ID and DEVICE_ID to
   the registry and deliberately pair CUPS_PRINTER_NAME with the physical printer.
   No actual environment files or tokens were changed here.
5. Node 22+ is required for the agent scripts. `npm run dev`/`start` explicitly load
   the local .env; build only compiles TypeScript. Install a supervisor with a shutdown
   grace period sufficient for bounded cloud retries and OS submission. Do not enable
   real service startup until supervised hardware acceptance passes.
6. Verify heartbeats in an isolated mock environment first, then perform the physical
   acceptance plan below with explicit authorization and an operator present.

The initial migration adds fields/health storage, not tenants. It does not reprice old
jobs or reset their statuses. Unknown legacy claims remain blocked. Rollback must not
restart old agents against active new attempts; retain latches/journals and inspect
outcomes before any downgrade. Existing QUEUED customer jobs remain owner-reviewed.

## Windows readiness and exact remaining work

The agent core, journal, cloud protocol and mock adapter avoid CUPS dependencies.
The Windows adapter is deliberately not selectable for printing or server claims.
No Windows discovery or physical printing has been executed or claimed verified.

Remaining implementation and acceptance requirements:

1. Implement discovery/availability using Windows printer APIs (EnumPrinters/GetPrinter)
   or an equivalently bounded helper. Match stable spooler names; do not infer readiness
   solely from an installed driver or stale WMI status.
2. Choose and pin a maintained PDF renderer (for example a reviewed native PDFium helper)
   and verify its license/update path. Win32 raw spooling does not generally render a PDF
   for arbitrary printer drivers. Do not use an untracked shell "print" verb or assume
   a PDF viewer exit code proves completion.
3. Return a real Windows spool job ID from the submission boundary and observe it with
   GetJob/EnumJobs. Map spool states/reasons, cancellation and lost spool history into
   the shared pending/completed/failed/unknown contract. Unknown remains reconciliation.
4. Verify copies, colour, duplex, paper and ranges against target drivers; avoid applying
   copies/ranges twice between renderer and driver. Test USB/network queues and service
   vs interactive user accounts.
5. Package a signed installer/service with least-privilege account, private state/credential
   ACLs, controlled updates and graceful shutdown. Validate file-sync/rename durability,
   locking, power-loss recovery, antivirus interference and spooler restart on Windows.
6. Run real printer tests for cancellation, paper-out, unplugging, network loss at each
   boundary, service/computer restart and lost completion history. No test should assert
   usable paper delivery merely because a spool job disappeared.

References: [Microsoft print/spooler functions](https://learn.microsoft.com/en-us/windows/win32/printdocs/printing-and-print-spooler-functions),
[IPP semantics](https://www.rfc-editor.org/rfc/rfc8011.html),
[IPP encoding](https://www.rfc-editor.org/rfc/rfc8010.html),
[CUPS lp](https://www.cups.org/doc/man-lp.html).

## Verification and blockers

Verification completed locally:

- 101 web tests across 14 files and 45 agent tests pass (146 total).
- Web and agent TypeScript checks pass; both production builds pass.
- Prisma schema validation and the actual additive migration test pass.
- `git diff --check` passes.
- Final dependency audits: web 14 full-tree findings / one production finding;
  agent and root dependency trees zero findings. See the security review for
  exploitability boundaries and unresolved critical upgrades.

See the automated suites in `apps/agent/tests` and `apps/web/tests`. They use fake
cloud/device transports, temporary journals and embedded disposable PostgreSQL;
no CUPS command, real print, production DB operation or agent service was started.
The embedded engine executes the actual migrations and verifies legacy preservation,
new enum/columns, CAS and unique-attempt behavior. Route concurrency tests separately
exercise Prisma predicates with an in-memory CAS harness; multi-connection PostgreSQL
load/transaction tests are still required in staging.

Real CUPS/driver acceptance, Windows implementation, a guided reconciliation UI,
production-grade document storage/retention, metadata retention and a complete event
ledger remain work. The web dependency tree still has critical advisories requiring
a separately tested major framework/tooling migration; see [security review](security-phase-2a.md).
Physical availability/usable output cannot be guaranteed from spooler telemetry.

Recommended next phase: security migration to a maintained framework/test stack,
then an isolated staging service and supervised CUPS pilot with recovery drills;
then implement/test the Windows adapter before building the desktop wrapper.
