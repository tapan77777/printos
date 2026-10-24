import path from "node:path";
import type { WindowsSpooler, WindowsPrinter, WindowsSpoolJob, Run } from "./WindowsPrintDevice";
import { runWindows } from "./WindowsPrintDevice";
/** Fixed script, argument vector, no shell, no ExecutionPolicy bypass or elevation. */
export class PowerShellSpooler implements WindowsSpooler {
  constructor(private run: Run = runWindows, private platform = process.platform) {}
  private async query(operation: "printers" | "jobs", name?: string): Promise<unknown[]> {
    if (this.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
    const shell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const script = path.resolve(__dirname, "../../windows/spooler.ps1");
    const parsed = JSON.parse(await this.run(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script, "-Operation", operation, ...(name ? ["-PrinterName", name] : [])], 15000));
    if (!Array.isArray(parsed) || parsed.length > 1000) throw new Error("WINDOWS_RESPONSE_INVALID");
    return parsed;
  }
  async printers(): Promise<WindowsPrinter[]> {
    const items = await this.query("printers") as WindowsPrinter[];
    for (const p of items) if (typeof p.name !== "string" || !p.name || p.name.length > 512 || /[\x00-\x1f]/.test(p.name) ||
      !/^[a-f0-9]{64}$/.test(p.identifier) || typeof p.isDefault !== "boolean" || ![true,false,null].includes(p.available) ||
      typeof p.color !== "boolean" || typeof p.duplex !== "boolean" || !Number.isInteger(p.maxCopies) || p.maxCopies < 0 ||
      !Array.isArray(p.papers) || !p.papers.every(Number.isInteger)) throw new Error("WINDOWS_RESPONSE_INVALID");
    return items;
  }
  async jobs(name: string): Promise<WindowsSpoolJob[]> {
    const items = await this.query("jobs", name) as WindowsSpoolJob[];
    for (const j of items) if (!Number.isSafeInteger(j.id) || j.id < 1 || typeof j.document !== "string" ||
      !Number.isInteger(j.status) || j.status < 0 || j.status > 65535) throw new Error("WINDOWS_RESPONSE_INVALID");
    return items;
  }
}
