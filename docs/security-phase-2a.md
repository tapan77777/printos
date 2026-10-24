# Phase 2A dependency review

The npm registry advisory service was queried before and after compatible updates.
[Machine-readable summary](security-phase-2a.json) lists all original packages,
advisory URLs, affected ranges, remaining severity and proposed fixes. These are
package-tree findings; this work did not exploit the application or prove each
advisory reachable in this deployment. No automatic major upgrades were applied.

| Scope | Before | After |
| --- | --- | --- |
| Web, full tree | 16: 3 critical / 8 high / 5 moderate | 14: 3 critical / 6 high / 5 moderate |
| Web, production only | — | 1 critical (`next`) |
| Agent, full tree | — | 0 |
| Root Prisma tooling/client tree | — | 0 |

Counts are packages, including dependency-chain meta-advisories, not independent
exploits. They reflect the registry response at implementation time and can change.

## Applied and verified

- Updated within existing semver ranges. Web TypeScript, types, Tailwind 3.4.19,
  Autoprefixer and related compatible transitive patches were installed; Next remains
  14.2.35 and Vitest remains 2.1.9 because their current ranges do not supply complete fixes.
- Updated source-map-js to 1.2.2, removing its indexed-map CPU exhaustion advisory.
- Required PostCSS ^8.5.31 and used the same-major `$postcss` override so Next's nested
  8.4.31 dependency also resolves to the patched version. This removes the PostCSS
  style-stringification and attacker-controlled source-map loading advisories from
  both full and production audits. The production build verifies CSS/toolchain compatibility.
- Updated the agent's compatible tsx/esbuild tooling. Its final audit is clean.
- Added PGlite as a development-only migration test dependency; it is not imported
  by production routes, nor does it connect to the configured DATABASE_URL.

## All original findings and deployment exposure

| Package(s) | Original severity | Exposure and disposition |
| --- | --- | --- |
| next | Critical | Production framework. Includes RSC/App Router, cache, image, rewrite and Windows-hosting advisories. Windows-hosted Next servers have a documented RCE exposure; this is distinct from the future standalone Windows agent. No Next image imports, custom rewrites, CSP nonce handling or user Server Actions were found in application source, but absence of those usages is not proof that every framework endpoint is unreachable. Internet deployment remains blocked pending a tested supported-major migration. |
| vitest | Critical | Development/test tooling. The UI-server advisory requires an exposed Vitest UI server; verification here used `vitest run` and did not expose that server. Other mock-registration findings also apply to the installed range. Upgrade requires a separately tested major change. |
| tinypool | Critical | Transitive Vitest worker pool. Prototype-pollution gadgets require attacker-controlled worker/run options or an applicable upstream path; not an app production dependency. It remains flagged. Do not force an incompatible major worker override beneath Vitest 2. |
| @vitest/mocker | Moderate | Vitest/mock server traversal and registration paths; test/dev context, not application production routes. Fixed by the tested Vitest migration, not a blind subdependency replacement. |
| vite | High | Transitive test/dev server. Includes file access, editor and Windows-path advisories. Not used as the production web server; do not expose its development server. Requires a compatible Vitest/Vite major migration. |
| vite-node | Moderate | Meta-advisory through Vite. Same remediation/exposure boundary. |
| esbuild | Moderate | Web test/dev dependency with development-server cross-origin advisory. The app does not start an esbuild HTTP server. The flagged web version remains under Vite; agent tooling has a clean separate tree. |
| braces | High | Build/test glob parsing stack exhaustion from attacker-controlled nested patterns. Application PDF upload does not pass user filenames as glob patterns. No safe patched release within the existing dependency constraints was supplied by the audit. |
| chokidar | High | Meta-advisory through braces in the build/watch tree. Same controlled-input boundary; assess with the Tailwind/tooling migration. |
| micromatch | High | Meta-advisory through braces; not a public request globbing service in this app. Same remediation. |
| fast-glob | High | Meta-advisory through micromatch/braces. Compatible updates alone did not remove it. Same remediation. |
| tailwindcss | High | Build-time meta-advisory through the glob/parser chain. Stayed on 3.4.19 to preserve the verified UI. Audit suggests a Tailwind 4 major migration, which needs a separate CSS/config review and visual verification. |
| postcss-selector-parser | Moderate | Selector parser CPU exhaustion on hostile selectors. The CSS source is repository-controlled; no user CSS editing feature exists. A major parser change beneath Tailwind 3 was not forced. |
| postcss-nested | Moderate | Remaining meta-advisory through selector parser. Same build-time input boundary. |
| postcss | High | Patched to 8.5.31, including Next's nested copy. Removed from final audit. Source-map inputs were repository-controlled, but the patch is compatible and independently useful. |
| source-map-js | High | Patched to 1.2.2. Removed from final audit. Source maps are build inputs, not uploaded PDFs. |

A malicious pull request/build input is a different threat boundary from a public
customer upload. Development-only status does not make findings harmless; untrusted
repository code and exposed test/dev servers must not be treated as safe.

## Upgrade plan and blockers

The final audit proposes Next 16.4.2, Vitest 5.0.5 and Tailwind 4.3.3 as available
major resolutions for the affected chains. Those version suggestions are from the
saved registry response, not a compatibility guarantee. A Next migration must review
route params, cookies/middleware/runtime behavior, React compatibility and deployment
requirements. A Vitest migration must verify mocks, React component tests and Node
requirements. A Tailwind migration must preserve the Phase 1B design with browser
screenshots and accessibility checks. Do not use `npm audit fix --force` blindly.

The three critical web findings are explicitly **unresolved release blockers**, not
an assertion that the new printing engine is ready for internet production. Do not
host the current Next version on Windows; the future Windows desktop application
should use the standalone agent core and should not embed a vulnerable Next server.

Primary references:

- [Next Windows server RCE advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
- [Vitest UI server advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)
- Other exact advisory links/ranges are retained in the machine-readable summary.
