# Desktop verification

Screenshots were captured from the real Electron application on macOS against an
isolated synthetic cloud fixture. They contain no customer documents or real shop data.
They verify the desktop shell/onboarding, not physical Windows printing or a deployed
Next.js dashboard. The app embeds the hosted dashboard without replacing its UI.

- `welcome-macos.png`: local welcome/setup screen.
- `pairing-blocked-macos.png`: honest enrollment blocker.
- `qr-mock-macos.png`: QR for a synthetic registered printer.
- `diagnostics-macos.png`: stopped isolated shared-engine diagnostic worker.
- `setup-1440-macos.png`: large-window setup after width checks.
- `results.json`: Electron mock review results.
- `security.json`: sanitized npm audit summary.
- `artifacts.json`: installer/application hashes and static artifact validation.

Windows execution, installation, code-signing trust and physical printing are pending.
See [Phase 2D](../phase-2d.md) for architecture, instructions and release gates.
