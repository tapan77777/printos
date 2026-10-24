import { PowerShellSpooler } from "./adapters/WindowsSpooler";
// Explicit, read-only owner/operator tool. Never imports or starts the job engine.
new PowerShellSpooler().printers().then(printers => console.log(JSON.stringify(printers, null, 2)))
  .catch(() => { console.error("WINDOWS_PRINTER_DISCOVERY_FAILED"); process.exitCode = 1; });
