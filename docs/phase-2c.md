# Phase 2C — Windows queue integration

## Status and boundaries

Implemented portable TypeScript Windows adapter, fixed read-only PowerShell bridge,
operator discovery tool, headless SumatraPDF submission, capability preflight and
spool monitoring through the existing Phase 2A engine. Automated tests simulate
Windows interfaces on macOS. **No Windows execution or physical printing has been
verified. Do not enable unattended operation until the acceptance checklist passes.**
No Electron wrapper, database migration, credentials change, automatic installation,
printer configuration change or customer-data change is part of this phase.

The implementation favors stopping for reconciliation over duplicate output. It
cannot guarantee exactly-once printing. Windows completion flags describe spooler
progress, not independently measured paper output. This adapter deliberately does
not report automatic COMPLETED or a physical page count. Owner reconciliation is
required after output inspection; ordinary pending jobs reach the existing bounded
completion timeout and require reconciliation. Automated completion with a calibrated,
printer-specific confirmation policy remains future work.

## Architecture and changed files

- `apps/agent/src/adapters/WindowsPrintDevice.ts`: typed queue/capability interface,
  exact selection, settings validation, binary checksum, single renderer invocation,
  bounded concurrent spool observation and attempt-correlated `WIN-<jobID>` identity.
- `WindowsSpooler.ts`, `WindowsVersion.ts`, `windows/spooler.ps1`: fixed script queries
  installed queues, driver capabilities, jobs and renderer file version. No dynamic
  PowerShell expressions, shell interpolation, execution-policy bypass or elevation.
- `src/windows-printers.ts`: read-only operator selection aid, independent of the agent.
- `PrintDevice.ts`, `core/Engine.ts`: optional read-only preflight before authorization.
  Preflight failure quarantines with a sanitized diagnostic and never authorizes output.
- `src/index.ts`: Windows-only mode, explicit selected queue and selection-bound journal.
- Web claim API accepts the already-supported authenticated `windows` registry mode;
  device scope, atomic claim, simulation fence, leases and authorization are retained.
  Status API adds fixed, sanitized preflight and spooler-attention diagnostic codes.
- New Windows tests plus shared-engine and authenticated route regression tests.

Existing `cupsJobId` stores generic spool identities; no schema or API field renames.
The Windows queue identifier hashes name + driver + port. It is a selection fingerprint,
not hardware identity. Renames, driver/port changes require explicit reselection.
Changing selection while an attempt is active fails journal scope validation. Resolve
that attempt using the original configuration before selecting another queue. Duplicate
fingerprints or missing queues never cause fallback to the Windows default printer.

## Windows installation prerequisites (operator steps, not executed here)

1. Use a supported Windows desktop with Node.js >=22, Windows PowerShell 5.1,
   PrintManagement cmdlets, CIM, .NET Framework System.Drawing and an installed vendor
   driver. Install USB/network queues through Windows first. Run under a dedicated
   non-administrator user with access to the selected queue. Queue visibility is per user;
   test using the exact future service account. Do not use virtual printers requiring
   save dialogs for unattended operation.
2. Obtain SumatraPDF only from its official distributor. Current documented settings
   include numeric paper kinds and ignoring embedded PDF preferences. The adapter
   requires file version >=3.7, rejecting older versions that may ignore those flags.
   If those features are available only in a prerelease for your deployment, deployment
   is blocked until that exact build is reviewed and qualified. A version check is not
   a security approval. Pin an independently verified SHA-256; do not copy a hash from
   an untrusted binary and treat that as verification. No renderer is bundled or downloaded.
3. Review the exact build's security advisories and license/redistribution requirements.
   Keep the executable and its dependency directory writable only by the operator/admin;
   checksum verification cannot prevent a malicious local administrator replacing files
   between verification and process creation. Retest and update the approved hash when
   upgrading. Never run the renderer elevated: it parses customer-controlled PDFs.
4. Install agent dependencies (`npm ci` in `apps/agent`) and `npm run build`.
   Preserve the `windows/` folder beside `dist/`; the script is not emitted by TypeScript.
   Sign/trust the shipped PowerShell script using organizational policy if required.
   Do not weaken machine execution policy to run it. The bridge fails closed when blocked.
5. Run `npm run printers:windows` (or `node dist/windows-printers.js` after building).
   This lists real queue names, fingerprint, default, availability, copies, color,
   duplex and supported Windows paper-kind IDs. It does not print or contact PrintOS.
6. Select the exact `WINDOWS_PRINTER_NAME` and `WINDOWS_PRINTER_IDENTIFIER` in the
   agent's private environment. Set `WINDOWS_SUMATRA_PATH` to an absolute executable
   path and `WINDOWS_SUMATRA_SHA256` to its approved hash. Use `PRINT_DEVICE_MODE=windows`.
   Examples are in `.env.example`; this implementation has not changed real secrets.
7. An authorized operator must provision a server credential with `mode: windows`,
   bound to this device ID, and a non-simulation printer. Existing CUPS/mock credentials
   must not be reused across devices. No credential provisioning was performed here.
8. Use a private local NTFS state directory with an ACL restricting access to that user
   and administrators. POSIX `0600/0700` does not establish Windows ACL privacy. Avoid
   roaming/cloud/network/temp state directories. Confirm disk durability and process-lock
   behavior under the actual service account before any unattended pilot.

## Settings contract

All settings are explicit: copies, monochrome/color, simplex/long-edge duplex,
fit-to-printable-area, numeric Windows paper kind, and selected pages. Embedded PDF
printing preferences are ignored so document metadata cannot override copies or media.
A3/A4/A5/Letter/Legal are mapped to Windows standard IDs; unrecognized/custom paper
sizes are rejected. Unknown driver capability data fails closed. Ranges support `all`,
empty (legacy all), or ascending positive comma-separated pages/ranges. The backend
continues to validate actual document bounds; the agent does not reparse PDFs.

Capabilities indicate driver support, not loaded paper or proven fidelity. The physical
checklist must verify the exact driver honors these options. Unsupported color, duplex,
copy count or paper is quarantined before server submission authorization. Driver-side
coercion cannot be ruled out without device-specific tests; do not advertise an option
as supported until tested. There is no fallback to default settings.

## Submission, monitoring and recovery

The existing private checksummed journal PDF (`<attemptUUID>.pdf`) is passed directly
as an argument; no shared temporary copy or original customer filename is used. The
renderer runs headlessly with silent printing, a 60-second process timeout and capped
output. PowerShell queries have a 15-second timeout and capped output. No renderer
stdout/stderr, credentials, document contents or local paths are logged by the agent.

After mandatory server acknowledgement and durable SUBMITTING, invoke the renderer
once. Observe queue entries while it runs and collect only an exact attempt filename
match. A unique observed Windows job ID becomes `WIN-<id>` in the durable journal and
server spool field. Subsequent polls require both ID and attempt filename on the selected
queue, including after restart. No timestamp-only/first-new-job heuristic is used.

A driver may rewrite document names (including using PDF metadata), generate multiple
jobs for copies, or remove a fast job between polls. These cases are uncertain and do
not justify another submission. A renderer failure/timeout is uncertain even if a queue
entry was observed; a unique observed spool ID is retained for reconciliation. If the process dies before the spool ID is journaled, SUBMITTING
recovery quarantines without submission. Do not delete the journal to unblock printing.

Pending spooling/printing/paused states remain pending. Offline, paper-out, deletion,
cancellation, errors and completion flags return unknown and require reconciliation. Known spooler errors and completion flags reconcile immediately
with sanitized offline/paper/cancellation/driver/completion diagnostics. Queue disappearance and query/network failures also return
unknown. Cancellation may occur after some sheets printed, so is not automatically
reported as zero-output FAILED. The adapter does not cancel or restart queue entries.
The owner must inspect spooler/device/output before resolving an attempt. Retained
spool files contain customer data; enabling retention is not required or performed here.

Internet is needed to claim, download, renew, authorize and acknowledge status. Once
fresh authorization exists and the barrier is durable, local submission/monitoring can
continue through an outage. A network printer still needs its LAN connection. Offline
status reporting is durable; reconnection retries events, never physical submission.
Read-only local discovery works without PrintOS internet access. A disconnected printer
blocks new submission; an already submitted queue can resume independently of PrintOS.

## Physical acceptance checklist — NOT performed

Use only approved synthetic PDFs and a designated test printer/device/credential.
No real job should be submitted without separate operator approval.

1. Record Windows, driver, queue, firmware, renderer version/hash and service account.
   List both USB and network queues; compare default and capabilities with Windows.
   Check a disconnected queue reports false/unknown and never falls back to another.
2. Verify discovery and agent operation without administrator privileges or policy bypass.
   Check ACLs prevent another standard user reading the journal/PDF/token.
3. With explicit printing approval, use a numbered multipage PDF and test one/three copies,
   pages `1,3-5`, BW/color, simplex/long-edge duplex and every offered paper size.
   Count sheets/pages; verify orientation and color. Include a PDF with conflicting
   embedded copy/duplex preferences and non-ASCII printer names. No viewer/dialog may open.
4. Confirm queue DocumentName equals the attempt UUID filename and ID is journaled.
   Exercise fast jobs, PDF title metadata and multicopy jobs. Unexpected title/multiple
   IDs must reconcile. If these are common with this pipeline, pilot is blocked pending
   a renderer/native bridge returning the StartDoc job ID directly.
5. Reject unsupported paper/color/duplex/copies before authorize and before any spool job.
   An old or modified renderer must fail preflight. A missing script/cmdlet must fail closed.
6. Deny/drop server authorization acknowledgement: observe zero submissions. Restore
   internet and verify identical event retry. Test slow/failed downloads and checksum recovery.
7. Disconnect internet after download, during authorization, during renderer execution
   and after submission. Restore it; verify at most one renderer call per attempt and
   status recovery. Disconnect LAN printer/USB, switch it off, empty paper and cancel
   mid-job. Never infer no physical output from cancellation or offline status.
8. Kill/reboot after download, after authorization, at SUBMITTING, during renderer execution
   and after spool-ID persistence. Confirm safe resume before the barrier and observation/
   reconciliation after it, without another renderer invocation. Check for a surviving
   renderer child before owner reconciliation; timeout/kill is not proof it stopped printing.
9. Change queue name/port/driver with an active attempt: fail closed; resolve original
   attempt before reselection. Simulate journal loss, corrupt file and a second agent process.
10. Independently inspect physical output before owner resolution. Record every unknown
    result. Establish acceptable manual-reconciliation load before a one-shop pilot.

## Security review and verification

Agent npm audit on 2026-10-23: **0 vulnerabilities**, no runtime npm dependencies added.
This does not audit Sumatra, Windows, drivers or native libraries. Their review and signed/
verified distribution remain installation blockers. The previously documented web Next/
Vitest/tinypool advisories remain separate work (`security-phase-2a.md`); no Next server
is embedded in the Windows agent. No uncontrolled major upgrades were applied.

Verification on macOS, 2026-10-23:

| Check | Result |
| --- | --- |
| Agent tests (`npm test --prefix apps/agent`) | 76 passed |
| Web tests (`npm test --prefix apps/web`) | 112 passed across 16 files |
| Agent and web TypeScript checks | Passed |
| Agent TypeScript build and web production build | Passed |
| Agent `npm audit --json` | 0 vulnerabilities |
| `git diff --check` | Passed |
| Native PowerShell / Windows renderer / physical printer | Not executed; Windows unavailable |

Mocks verify argument
separation, settings rejection, spool correlation, errors/timeouts, cancellation/unknown
states, reconnection, shared journal barrier/restart and scoped Windows server requests.
They do not exercise Windows PowerShell, actual driver capabilities, Sumatra or physical
printers. Next phase: run this checklist on a Windows test station, qualify a renderer/
driver combination, improve direct spool-ID handoff if needed, then consider the desktop
wrapper and controlled installer/update/signing workflow.

## Primary references

- [Sumatra command-line printing options](https://www.sumatrapdfreader.org/docs/Command-line-arguments)
- [Microsoft Get-PrintJob](https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printjob)
- [Microsoft job status semantics](https://learn.microsoft.com/en-us/windows/win32/printdocs/job-info-2)
- [Microsoft Win32_Printer](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-printer)
