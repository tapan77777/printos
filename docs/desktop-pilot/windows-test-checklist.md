# PrintOS Desktop 0.1.1 Windows pilot checklist

Prepared 26 October 2026. **All boxes are unexecuted Windows acceptance checks.** This document does not authorize enabling ordering, device processing, live printing, credential/configuration changes, or production record creation.

Record the Windows version/architecture, app version/hash, printer model/driver/connection, renderer source/version/hash, tester and date. Keep credentials, verification links, pairing codes, bearer tokens, customer PDFs and raw logs out of the test report. Use approved synthetic documents and record only sanitized outcomes/error categories.

## A. Installation and read-only owner UI — printing and ordering remain off

- [ ] Use the reviewed x64 installer `apps/desktop/release/PrintOS Setup 0.1.1.exe`. SHA-256 must equal `2b75570fedeb7472b5898c64855b117322c578445f6865381ec1b25c427aef85`. Scan it with Windows security software. Record unsigned/unknown-publisher behavior; stop for unexpected detection or mismatch rather than bypassing it blindly.
- [ ] Install as a standard Windows user without unexpected elevation. Verify finish does not start printing. Record install path, app version and launch success.
- [ ] Enter the approved canonical HTTPS backend, never a Vercel candidate/protection bypass URL or credentials in a URL. Test malformed and insecure origins are rejected.
- [ ] Operator has already completed the intended shop's website registration, email verification, rates and QR. Do not create another account/shop from Desktop just to progress through the wizard.
- [ ] Owner signs in through the embedded login using their own verified account. Do not reuse the operator's account. Confirm the displayed shop and membership. Login creates normal session/rate-limit records; use an explicitly approved account/environment.
- [ ] View Orders, recent History/status filters, Reports and Settings/device/pricing screens. Verify no external browser is needed for those daily views and no printer/ordering side effect occurs from navigation.
- [ ] Check 1366×768 and the laptop's actual scaling/window size. Dialog buttons, errors and Stop/Exit must remain visible with the embedded dashboard open.
- [ ] Record manual-refresh behavior and stale status today; automatic incoming orders must not be claimed as supported. Test no-orders/loading/error states using approved fixtures, not production configuration changes.
- [ ] Preview a designated synthetic PDF through its permitted owner record. Confirm correct file/pages, no owner cookies or privileged bridge in the storage window, and an understandable unavailable/expired-file error.
- [ ] **Do not click the preview Print control, press Ctrl+P or use print menus while the P0 preview issue is unresolved.** After an approved fix, verify every alternative print entry point is denied without submitting to a real printer.
- [ ] Close the main window and confirm it hides to the tray. Verify Stop and safe Exit. Relaunch restores saved cloud/queue state but never starts a worker. Confirm a second instance opens the existing window.
- [ ] Recheck real owner login after full Exit/relaunch and Windows reboot. Distinguish an expired owner session from lost device pairing. Record cookie/session continuity without exporting cookies.

## B. Pairing and read-only printer qualification — approved test records only

Pairing creates cloud records. Perform this phase only in an approved pilot/test shop and account, or under the operator's explicit authorization for the intended shop. Pairing, selection and preparation never grant blanket permission to print.

- [ ] OS protected storage is available to the intended Windows user. An unavailable/corrupt store must produce a clear stop, not plaintext fallback or automatic re-pairing.
- [ ] Start one pairing challenge. Operator verifies computer label, fingerprint, shop and intended registered printer, then enters the matching code in owner-authorized Devices & printers. Reject unsolicited or wrong-shop requests.
- [ ] Redeem once and confirm receipt. Processing and customer ordering remain disabled. Confirm device summary exposes no token/private key.
- [ ] Exit/relaunch, then reboot/sign in as the same Windows user. The same confirmed device ID and shop/printer binding return; no second challenge/device is created and no Start occurs.
- [ ] In an isolated fixture, verify pending/expired challenge, wrong code, lost acknowledgement, interrupted secure write and consumed response behavior. Do not deliberately corrupt the pilot's real vault or delete its journal.
- [ ] Install the official printer driver outside PrintOS. Discover installed USB/network queues for this Windows user. Check default flag, exact queue name, color/duplex/copies/paper capabilities, and unavailable/unknown states.
- [ ] Select the intended queue; restart and verify exact identity persists. A renamed queue/changed driver/port must require explicit reselection. Test changes on a disposable queue or approved test printer only.
- [ ] Unplug/turn off the test printer, then reconnect. Discovery must not invent availability or submit a test page. Record Windows spooler/driver/PowerShell-policy errors and user guidance; do not disable execution policy to make discovery pass.
- [ ] Qualify an official compatible SumatraPDF >=3.7 executable and independent hash. Confirm missing, wrong-version and modified binaries fail closed. Preserve the integrity/version guard. Do not use the current stable 3.6.1 as a substitute.
- [ ] Check paired shop/device vs selected owner workspace. Switching to another authorized shop must not make the operator believe it controls the paired queue. A running device remains bound to its actual approved scope.
- [ ] Exercise offline launch/reconnect without starting processing. Errors must be visible, retries bounded, and identity retained. Test expiry/revocation on a disposable fixture; approved revocation must stop access without requeueing jobs.

## C. Full printing/ordering journey — BLOCKED until separate explicit approval

Do not execute these steps under this audit. Require resolved P0 findings, qualified renderer/driver, an approved isolated environment or designated intended pilot shop, authorization for its synthetic records, and an explicit decision on ordering/device activation. Customer intake and physical printing are separate controls.

- [ ] Receive a designated harmless PDF with recorded expected copies, page range, color, duplex, paper and price. Preview it; a customer submission alone must not print.
- [ ] Reject one synthetic job with a reason; verify customer status and that it is never claimed. Test double-click/competing approval produces a safe conflict, not duplicate output.
- [ ] Approve one job with processing stopped; verify it waits. Only the explicitly authorized device and an explicit Desktop Start may release it to the agent.
- [ ] For the first output, print one small document and inspect the Windows queue and physical sheets. Verify exact options and one renderer submission per attempt.
- [ ] Confirm spool completion/disappearance alone is not reported as verified physical success. Use Record inspected outcome with a factual note; verify the queue then advances. Do not reset the submission latch or reprint an uncertain attempt.
- [ ] Validate printer offline/paper-out before submission, offline/error after submission, driver failure, renderer timeout and unknown spool IDs. No blind automatic reprint or false success is acceptable.
- [ ] In the isolated test setup, interrupt network, worker and app at approved points before/after submission. Recovery must reuse attempt/event IDs; uncertain output must require inspection. Never delete journals or repeat a real job just to test recovery.
- [ ] Stop and safe Exit during processing; verify no new submission after acknowledged stop. Closing to tray may keep processing active and must be clear to the owner. Reboot/full launch must remain stopped.
- [ ] History contains the expected immutable submitted values and terminal outcomes. Validate paging beyond 200 records in a disposable fixture, not by creating production records.
- [ ] Reports match known completed/non-simulation totals and their inspection completion times. Check IST midnight/week/month boundaries, rejected/failed counts and recorded vs collected values. Do not describe totals as a payment ledger.

## D. Optional Windows startup

- [ ] Record that v0.1.1 currently has no startup preference. This is not a failed implemented feature.
- [ ] If a future startup toggle is approved, verify off by default, opt-in for the current Windows user, visible OS registration, reliable disable/uninstall behavior, single-instance handling and login/reboot recovery.
- [ ] Startup must open the app only. It must never silently resume processing, activate a device, accept orders or run a hidden print service.

## Handoff and stop criteria

- [ ] Operator hands over the intended owner workspace, known printer, initial poster and a short Orders / History / Settings runbook. Record who handles account recovery, revoked/expired pairing and driver/renderer maintenance.
- [ ] Record every item as PASS / FAIL / NOT RUN with sanitized evidence. Any plaintext credential, unintended activation/output, duplicate submission, wrong-shop action or false completion stops the pilot. Do not change auth/database configuration, weaken guards, deploy, publish or automatically roll back as a recovery step.
