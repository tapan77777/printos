# Website entry points and Windows release handoff

Local changes reuse the existing pages and UI: homepage registration/sign-in/setup links, Windows download section with installation steps, shop-selection guidance and a dashboard setup callout linking Devices & printers, Pricing and the download section. No new onboarding route is required. Login still goes to /shops; select a shop to open /dashboard.

## Release hosting

Use a public GitHub Release on tapan77777/printos. GitHub supports binary release attachments; do not commit the installer to Git or put it in the Vercel public directory. If the source repository is made private, use a separate public downloads repository so owners can download without GitHub credentials.

No release/upload/tag/push/deployment was performed. GitHub's public releases API returned an empty list during this review.

Current local artifact: apps/desktop/release/PrintOS Setup 0.1.1.exe (112375279 bytes).
SHA-256: 2b75570fedeb7472b5898c64855b117322c578445f6865381ec1b25c427aef85
The file hash was checked against docs/mvp-verification/artifacts.json. This is unsigned; Windows installation and physical output remain unverified.

## Minimum remaining steps (approval required)

1. Validate installation and physical printing on Windows with its driver and the qualified renderer described in README.md. Decide whether to sign the installer or explicitly approve distribution of the unsigned build. Signing/rebuilding changes the checksum: recalculate it.
2. After release approval, manually create a GitHub Release from the reviewed desktop source/tag (suggested tag desktop-v0.1.1). Attach the actual EXE, renamed PrintOS.Setup.0.1.1.exe, and a SHA256SUMS.txt file. Explain signing and validation status in release notes. Publish only with approval. Any required tag/push also needs approval.
3. Download the asset anonymously, verify its bytes and SHA-256 against the approved local file, and confirm the link returns an EXE rather than an HTML/login/error page. A draft release is not publicly downloadable.
4. Set PRINTOS_WINDOWS_INSTALLER_URL in the web build environment to the verified asset URL, for example https://github.com/tapan77777/printos/releases/download/desktop-v0.1.1/PrintOS.Setup.0.1.1.exe . The section accepts HTTPS GitHub release EXE asset links only. Until configured, it displays a pending-release message with no pretend download button.
5. Rebuild and, after deployment approval, deploy. The homepage is statically generated, so changing the URL requires a new build. Verify the homepage download on the deployed site, then exercise verified email login → shop creation/selection → printer registration → pairing → rates → QR → PDF submission → approval on an authorized test shop.

Existing backend account/email, enrollment, storage and live-printing configuration requirements remain in docs/mvp/README.md. Public route checks do not prove those services work. This entry-point work does not alter their gates.

Verification: deployed /, /register, /login and /shops respond successfully; /dashboard/devices redirects signed-out requests to /login. Production web build passes lint/type checking and route generation. No hosted accounts or jobs were created.
