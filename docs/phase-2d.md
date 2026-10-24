# Phase 2D — PrintOS desktop application

## Outcome and honest scope

The repository now contains an Electron desktop application in `apps/desktop`.
It embeds the existing hosted Next.js dashboard in an unprivileged view and provides
local onboarding, installed Windows queue selection, customer QR export and an
isolated shared-engine diagnostic process. No local Next.js server is bundled.

This is a desktop dashboard/setup preview, **not an enabled production printing client**.
Secure enrollment does not exist in the backend. There is no token input, hidden
production-start flag or simulated pairing success. Physical printing remains disabled.
Windows execution, installation, drivers and physical output have not been verified.

| Capability | Implemented | Verification / limitation |
| --- | --- | --- |
| Native window, menus, minimize, tray/reopen | Yes | Electron on macOS with safe mocks |
| Login, Overview, Jobs, Reports | Existing cloud UI embedded directly | Mock cloud routing/cookies and privilege isolation verified; web regressions pass |
| First-run screens | All nine stages | Missing backend stages explicitly explain blockers; skipping a screen never enables printing |
| Printer management | Read-only Windows discovery, capabilities and local selection | Windows adapter reused; not executed on Windows; no cloud printer CRUD UI |
| Pair computer to shop | Blocked | No shop identity, enrollment challenge, per-device token issuance/revocation APIs |
| Driver settings | Capabilities reviewed, existing per-order options preserved | No pretend desktop defaults or unsupported driver reconfiguration |
| Shop prices | Existing cloud quotes/job totals accessible | No editable/readable pricing configuration API; no desktop price changes |
| Customer QR | Authenticated existing printer list; display and PNG save | Generated locally from actual cloud origin + `/p/<deviceId>`; mock registry verified |
| Agent supervision | Diagnostic utility process uses real shared Engine/Journal/Mock adapter | No-network/no-jobs worker only; macOS close/restart/stop verified |
| Real Windows agent launch | Blocked intentionally | Secure enrollment and Phase 2C Windows acceptance required |
| Windows x64 installer | NSIS configuration and cross-build | Static artifact checks only; installation/execution unverified |
| Autostart, service, auto-update | Not implemented | Must follow explicit enrollment, signing and Windows lifecycle qualification |

## Electron versus Tauri

Electron is selected because the existing agent is Node.js/TypeScript and can run
inside Electron's bundled Node utility process. Tauri would introduce Rust and a
separately built/provisioned Node sidecar while the server-rendered Next.js pages still
need the cloud. Electron costs more disk/RAM; in return one pinned runtime includes
Chromium, Node, process supervision and a consistent PDF-capable browser surface.

The packaged app requires a hosted HTTPS origin entered by the owner. It never starts
`next dev`, `next start` or a local web server. Loopback HTTP is permitted only in
unpackaged development. The visible cloud address should be checked against the
operator's approved deployment before signing in. Electron loads the real cloud login;
local setup never receives or handles the owner's password.

## Source and process architecture

- `apps/desktop/src/main.ts`: single-instance application, windows, isolated cloud
  session, restrictive navigation/permissions/download handling, bounded read-only
  registry query, printer discovery, QR save dialog and diagnostic supervisor wiring.
- `src/preload.ts`: narrow action allowlist for the bundled local setup page only.
- `src/policy.ts`: HTTPS/config validation, route allowlist and frame/sender verification.
- `src/supervisor.ts`: no automatic startup, duplicate-launch guard, bounded exponential
  restart budget (three failures), stale-child fencing and acknowledged shutdown.
- `src/worker.ts`: Electron utility-process diagnostic entry using the existing compiled
  `Engine`, `Journal` and `MockPrintDevice`. Its injected cloud returns no jobs and has
  no network client, token, customer download or physical printer adapter.
- `ui/index.html`, `styles.css`, `screens.js`, `app.js`: reusable local onboarding view
  helpers, navy/blue brand, accessible step navigation, discovery/selection, QR display,
  explicit missing-feature explanations and live diagnostic status.
- `scripts/stage.cjs`: builds/copies only agent `dist/` and the fixed Windows scripts;
  no `.env`, uploads or existing local journals are staged.
- `scripts/icons.cjs`: deterministic PrintOS PNG/Windows icon generation.
- `scripts/review.cjs`: real Electron testing against a synthetic HTTP cloud, in a private
  temporary profile, blocking all non-GET cloud requests in review mode.
- `scripts/inspect-artifacts.cjs`: PE architecture/certificate-presence, ASAR/fuse,
  staged-agent equality and secret/document filename checks. Reports artifact hashes.
- `package.json`, `package-lock.json`: pinned Electron/build versions, locked dependencies,
  Windows x64 per-user NSIS build and security-fuse configuration.

The dashboard is a separate `WebContentsView`, with no preload, Node, Electron bridge,
webview or permission grants. It shares only a dedicated cloud browser session with
owner PDF-preview windows. Local setup retains its own web contents and strict CSP;
all cloud access from it goes through fixed main-process actions. Customer PDFs are
not downloaded by the desktop setup or diagnostic worker. Owner preview uses the
existing protected `/api/jobs/<id>/file` route. Arbitrary downloads/external windows
are denied. Native PDF-viewer behavior still needs Windows qualification.

## Authentication, tenancy and pairing gaps

`apps/web/lib/session.ts` signs `{role: owner, iat, exp}`. It contains no owner ID,
shop ID or tenant membership. `GET /api/admin/printers` authorizes that global owner
role and lists the current instance's printers. Agent credentials are provisioned in
server environment configuration, mapped to a device and mode. That is not a shop
pairing API, and an owner browser session cannot safely manufacture an agent token.

Consequently the desktop only supports one explicitly selected cloud instance at a
time. Changing origin destroys the previous cloud view, clears the dedicated browser
session and invalidates cached registry results. The local Windows selection is not
represented as a cloud-device binding. QR generation and export recheck authenticated
registry membership and exclude simulation-only printers every time. They never
register a printer, change pricing or enable claims.

Before enabling real desktop printing, implement a separately reviewed backend phase:

1. Stable shop/owner identities and authorization over devices, jobs and documents.
2. Short-lived, one-use enrollment challenges bound to authenticated shop/device and
   confirmed locally, with rate limits, replay protection and a verification display.
3. Device-specific token issuance, revocation, rotation and approved printer scope.
   Never deliver existing global credentials to a web page or copy them across shops.
4. OS-backed credential storage (and failure handling) outside renderer/IPC payloads.
   Enrollment must not mark success before secure storage and server confirmation.
5. Explicit owner activation after renderer/driver qualification. No launch-on-login
   or restored configuration may quietly enable real printing in an unpaired state.
6. Exclusive active-device enrollment and a common device-keyed local lock/journal
   location shared with any standalone agent. The current desktop single-instance
   lock prevents duplicate desktop workers; it is not a cross-account/service lock.
7. Securely connect the existing real `CloudClient`/Windows adapter to the supervisor,
   preserving authorization, checksummed documents, SUBMITTING, attempt recovery,
   spool observation and reconciliation. Add real enrollment/revocation integration tests.

## Background lifecycle and recovery

Closing the window hides it; the tray process stays alive. Reopen through tray, menu,
OS activation or a second app launch. Nothing starts an agent automatically. Clicking
**Run safe diagnostics** explicitly starts one no-network utility process. Closing the
window leaves that process alive. Unexpected exits are restarted after 2/4 seconds,
then blocked after three crashes rather than spinning. Process environment is assembled
from a minimal allowlist; inherited cloud tokens and Node options are not passed.

**Stop diagnostics** and **Exit safely** send a stop message and wait for the worker to
stop the shared engine and unlock its private diagnostic journal. The parent does not
force-kill a worker to make shutdown appear successful. A hung local I/O operation can
therefore delay safe exit. Abrupt OS termination still depends on the existing durable
journal/lock recovery; Windows power-loss/fsync behavior remains unverified.

The real engine's cloud reconnect and uncertain-submission behavior is unchanged and
covered by existing agent tests. The diagnostic worker does not exercise live claims,
leases, heartbeat APIs or physical submission. There is no claim that a Windows service
or real Windows agent has run in this desktop app.

## Security and dependency review

- Context isolation, renderer sandbox and web security are enabled. Remote contents
  receive no preload or IPC API; every local IPC request verifies web contents ID,
  exact bundled file URL and top-level frame. Data enters DOM through `textContent`.
- Cloud requests use normal certificate validation. There is no certificate bypass.
  Packaged builds reject HTTP/localhost origins. Cloud subresources must stay on the
  selected origin; dashboard navigation has a 15-second timeout and can be cancelled
  by returning to setup. Deployments needing third-party auth/assets require a reviewed
  explicit policy change. External links and arbitrary file/URL opens are blocked.
- Permission requests are denied. Main-process registry requests are GET-only, fixed
  path, no redirects, 10-second deadline, 256 KiB limit and validated public fields.
- Local config stores only origin and queue fingerprint. No global/agent credentials
  are accepted or persisted. Cloud HttpOnly cookies remain in a separate browser
  profile. Packaged security fuses enable OS cookie encryption and ASAR integrity,
  enforce ASAR loading, and disable RunAsNode, Node options and CLI inspector injection.
- Windows state/cookie directories need correct user ACLs. Cookie encryption and
  macOS/Windows key-store behavior need signed-build qualification. ASAR validation
  does not protect mutable external agent resources against a malicious local user;
  a signed distribution/update trust chain and installation ACLs remain release work.
- Desktop npm audit: **0 vulnerabilities** (314 installed packages at verification).
  No runtime npm dependency was added to the shared agent. npm audit cannot certify
  Electron's Chromium/Node binaries, Windows, drivers or a future Sumatra build.
- Refreshed web audit: **14 findings: 3 critical, 6 high, 5 moderate**. Critical package
  entries are Next.js, Vitest and tinypool. Production-only audit reports Next.js as
  the one critical package. Vite/Tailwind dependency chains account for other findings.
  Test tooling is not packaged in the desktop; Next.js is not run locally. The cloud
  remains affected according to advisories; this wrapper does not fix the server.
  Exposure varies by advisory and configured features; package counts are not proof
  every attack path is reachable. Prioritize a separately tested Next migration and
  test-toolchain upgrades before public deployment. No uncontrolled major upgrades
  were made in this phase. Sanitized audit summaries are in `desktop-verification/security.json`.

## Runtime components and SumatraPDF

Electron bundles Node and Chromium, so an installed app does not need a separate Node
runtime. Windows supplies PowerShell/.NET/PrintManagement; vendor printer drivers must
already be installed. The shared compiled agent and read-only spooler script are included.

SumatraPDF is **not bundled, downloaded or launched** by Phase 2D. Phase 2C requires an
independently verified executable hash, file version >=3.7 and tested settings behavior;
older builds may ignore flags. An operator-qualified renderer, its dependent libraries
and a secure signed provisioning/update mechanism remain prerequisites for enabling
real Windows output. Current upstream licensing includes (A)GPLv3 and BSD-covered code;
review the exact binary/source/license notices and redistribution/source obligations
before bundling it. Do not silently copy a developer's local executable into an installer.

## Development and installer build instructions

Use Node >=22.12 (verified here with Node 24 on Apple Silicon macOS).

```sh
npm ci --prefix apps/agent
npm ci --prefix apps/desktop
npm run build --prefix apps/desktop
npm test --prefix apps/desktop
npm run typecheck --prefix apps/desktop
npm run start --prefix apps/desktop
```

Starting the app alone never starts diagnostics or printing. Supply your approved hosted
cloud URL through setup, or use only isolated fixture review during development:

```sh
npm run test:electron --prefix apps/desktop
```

The review creates a temporary app profile, synthetic registry/QR data, no real customer
PDFs and a local mock cloud. It does not connect to the configured Supabase test database
or actual PrintOS server. GUI access is required on macOS. Screenshots are labeled as mocks.

Build unsigned artifacts (downloads from the pinned toolchain may require network):

```sh
npm run package:mac --prefix apps/desktop
npm run package:win --prefix apps/desktop
npm run inspect:artifacts --prefix apps/desktop
```

Windows output: `apps/desktop/release/PrintOS Setup 0.1.0.exe` and `win-unpacked/`.
macOS smoke artifact: `release/mac-arm64/PrintOS.app`. Artifacts are gitignored.
The Windows installer is x64, per-user, `asInvoker`, has elevation disabled and does
not run the app after installation. Uninstall preserves application data/recovery
state. There is no production certificate, notarization, upload, publication or auto-update.
Builder messages saying “signing” do not prove a trusted signature; see artifact checks.

The lockfile, exact Electron/builder versions and fixed target make build inputs
repeatable. NSIS timestamps, downloaded toolchains and future signing mean bit-for-bit
reproducibility is not claimed. Validate hashes, dependency provenance, fuses and staged
content on each release; build and install on a clean Windows x64 machine before release.

## Windows autostart/service work — separate, not implemented

No login item, scheduled task or Windows service is installed. Tray background lifetime
only lasts while the desktop process is alive. A future per-user login task must be opt-in,
show pairing/printer health and preserve active attempts; it must not elevate. Windows
services run in a different session/account and often cannot see the user's queues,
network credentials, profile or credential vault. Do not convert the GUI agent to a
service without account/ACL/queue-access and shutdown/update/reboot acceptance tests.

## Verification and release gates

Verified on macOS, 2026-10-23:

| Check | Result |
| --- | --- |
| Desktop unit tests | 12 passed |
| Agent regression tests | 76 passed |
| Web regression tests | 112 passed across 16 files |
| Desktop, agent and web TypeScript checks/builds | Passed |
| Actual Electron mock navigation/onboarding/lifecycle review | Passed; no page errors or cloud writes |
| Unsigned macOS arm64 app bundle | Built; static content/fuse checks passed |
| Unsigned Windows x64 NSIS installer | Cross-built; PE/ASAR/content/fuse checks passed |
| Installer signature | No Authenticode certificate; unsigned |
| Windows install/execution/physical printing | Not performed |

The installer is 112,366,602 bytes. Its SHA-256 is
`80b131d917ab725ffc4eaefce267972b5f72267df9167871bc5d60d352ee1a6d`.
The NSIS launcher uses an x86 stub (`14c`); its packaged PrintOS executable is
x64 (`8664`). A successful static check is not a working-Windows-installer claim.

Automated macOS results and artifact hashes are in `docs/desktop-verification/`.
Tests cover HTTPS/routes, sender/frame checks, restricted config, installer policy,
no automatic start, duplicate worker prevention, backoff limits and graceful stopping.
The Electron review checks onboarding, mocked login cookie flow, QR generation,
unprivileged cloud views, navigation, diagnostic crash recovery, hidden-window lifetime
and safe stop, with zero cloud writes and no `/api/jobs/claim` requests.

Before a real pilot:

1. Fix/qualify the cloud dependency vulnerabilities and deploy an approved HTTPS endpoint
   through a separate release process.
2. Complete secure shop/device enrollment and storage, then add explicit printing activation.
3. Install the signed x64 artifact on clean Windows; test installation, upgrade, uninstall
   preservation, SmartScreen/AV, user ACLs, cookies, tray, lock/reopen and interrupted exit.
4. Test Windows queue discovery/rename/offline/capabilities and headless PDF preview.
5. Qualify/provision the exact renderer and run all of `phase-2c.md`'s physical checklist.
6. Verify real supervised-agent crashes, network outages, shutdown/reboot, stale journal,
   device revocation and uncertain spool outcomes without duplicate physical submissions.
7. Add signed updates and optional login startup only after those safety gates pass.

## Primary references

- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron utility processes](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Tauri Node sidecar approach](https://tauri.app/learn/sidecar-nodejs/)
- [electron-builder cross-platform targets](https://www.electron.build/docs/architecture/)
- [NSIS configuration](https://www.electron.build/nsis/)
- [Sumatra upstream source/licensing](https://github.com/sumatrapdfreader/sumatrapdf)
