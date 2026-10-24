# PrintOS frontend redesign

## Scope and inventory

This phase redesigns all seven existing pages: `/`, `/login`, `/p/[printerId]`,
`/p/[printerId]/j/[jobId]`, `/dashboard`, `/dashboard/jobs` and `/dashboard/reports`.
It adds a shared owner layout plus loading/error boundaries; it adds no product
routes, API endpoints, application dependencies, or database fields.

The customer has a printer device ID, local file metadata, a server-parsed page
count from the existing Phase 1A quote endpoint, and the existing quote function.
The status endpoint supplies job options, stored price and status/rejection reason.
No public shop-name/capability/online metadata endpoint exists. Customer screens
therefore display the actual printer ID, with no invented shop name or availability.
Owner pages use their existing Prisma queries unchanged.

Existing functionality remains: server quote validation, multipart job submission,
owner login redirect, protected PDF preview, approval/rejection payloads, three-second
customer polling and stored-value reports. Only GET status refresh can be manually
restarted after a connection failure. Submission and print actions never retry
without another explicit user action. Logout now navigates back to login after
the same existing logout POST rather than displaying the JSON response.

## Design system

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#172554` | Brand, headings, owner sidebar |
| `--blue` | `#2563EB` | Primary actions, active navigation, focus |
| `--background` | `#F8FAFC` | Canvas |
| `--success` | `#0F766E` | Completed status |
| `--error` | `#B91C1C` | Errors and destructive confirmation |
| `--warning` | `#B45309` | Awaiting review / warning |
| `--muted` | `#5F6E84` | Supporting text |
| `--line` | `#E2E8F0` | Borders and separators |
| `--surface` | `#FFFFFF` | Cards and controls |

Typography uses the installed system sans-serif stack; no external fonts are loaded.
Spacing follows a primarily four-pixel rhythm; cards use 16px corners, controls
8–10px, with restrained shadows. Icons are small inline SVGs. Focus outlines,
keyboard-only skip navigation, semantic labels and reduced-motion support are shared.

Components live in `apps/web/app/components`: `Brand`, `Icon`, `OwnerShell`,
`CustomerFrame`, `StatusBadge`, `Notice`, `PageHeading`, `EmptyState`, `Skeleton`,
`RefreshButton` and `ConfirmDialog`.

## Interaction changes

- Customer: prominent accessible file picker; actual filename/size/page count;
  copy stepper, colour choices, paper/range controls, duplex; shared existing
  quote calculation; sticky action with visible total; validation/submission states.
- Status: recorded progress timeline, receipt, stopped-job messaging, rejection
  note, loading skeleton and manual connection recovery. Terminal failure states
  do not invent successful intermediate steps. Timers/fetches clean up on unmount.
- Owner: persistent navy sidebar and topbar; mobile navigation; operational jobs
  workspace; readable badges; compact cards below 900px; explicit Refresh.
- Approval/rejection: native modal dialogs with browser focus trapping, Cancel
  initially focused, Escape/backdrop cancellation, reason input and pending/error
  states. Requests keep the original endpoints/bodies and occur only on confirmation.
- Reports: real period summaries, horizontally scrollable accessible table,
  explicit recorded/collected definitions, incomplete-page and timezone notes.
- Login: labeled password field, visibility toggle, disabled/pending state and
  network recovery. Existing authentication endpoint, cookie handling and redirect
  target behavior are unchanged.

## Safe, repeatable review

The screenshots show **synthetic fixture data**, not real shop activity. The
fixture is disposable and separate from the real application; no production `.env`
is copied. Its database module imports no Prisma client and throws on every write.
The browser script checks a fixture marker before starting and intercepts **all**
API requests, including login, quotes, uploads, approval and rejection.

1. From the repository root: `node apps/web/scripts/prepare-ui-review.mjs`.
2. In a separate terminal:
   `cd /tmp/printos-ui-review && npm run dev -- --hostname 127.0.0.1 --port 3047`.
3. With optional external Playwright and axe-core installed outside the app:
   `PRINTOS_PLAYWRIGHT_PATH=/absolute/path/to/playwright PRINTOS_AXE_PATH=/absolute/path/to/axe-core/axe.js node apps/web/scripts/review-ui.cjs`.

The script uses installed Google Chrome on macOS. No Playwright/axe runtime
application dependency was added. Stop the fixture server when finished.

Verification:

- TypeScript and production build pass.
- 75 tests across 11 files pass, including quote/pricing/API tests from Phase 1A.
- 48 responsive page/state checks: all seven pages plus selected-file state at
  320, 375, 430, 768, 1024 and 1440px; no page-level horizontal overflow.
- 16 axe WCAG A/AA checks: all seven pages at 375/1440, selected file at 375,
  and rejection dialog at 320; zero violations. This is an automated check,
  not a full accessibility certification or screen-reader usability audit.
- Browser checks cover quote loading, invalid ranges, mocked quote/submission, network recovery,
  login error/success, modal initial focus/trapping/Escape/Cancel, confirmed
  approval/rejection, reason payload, active/terminal statuses, empty queue and
  keyboard focus indicators. Zero JavaScript page errors; only deliberately
  simulated HTTP/network failure console messages.

See [machine-readable results](ui-review/results.json) and screenshots:

- [Customer print options, 375px](ui-review/customer-options-375.png)
- [Customer status, 375px](ui-review/status-375.png)
- [Owner jobs, desktop](ui-review/jobs-1440.png)
- [Owner jobs, mobile](ui-review/jobs-375.png)
- [Owner overview](ui-review/dashboard-1440.png)
- [Reports](ui-review/reports-1440.png)
- [Login](ui-review/login-1440.png)
- [Home](ui-review/home-1440.png)
- [Rejection confirmation, 320px](ui-review/rejection-dialog-320.png)

## Existing limitations and future work

This phase does not prove physical printing or fix print lifecycle reliability.
Claims/leases, concurrent transitions, reconciliation, retries and physical completion
still need backend/agent work and supervised printer testing. Existing job records
are not repriced. No payment collection is implemented. Printer online counts and
printed-page totals rely on incomplete existing records. Report dates still follow
the server timezone. Owner lists remain capped at 200, newest first, with manual
refresh; pagination/live updates require separate work. Public shop identity and
capability enforcement require backend support. Printer management, payment and
settings pages remain future work and are absent from navigation. Existing lint
configuration and dependency advisories are unchanged.

Native browser PDF preview continues using the existing protected endpoint. Its
physical-document rendering and printer output are outside this mocked UI review.
