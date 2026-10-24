import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrintDevice, PrintJobRequest, JobStatusInfo } from "./PrintDevice";
import { queryIpp } from "./adapters/ipp";
const exec = promisify(execFile);
export type Command = (file: string, args: string[]) => Promise<{ stdout: string }>;
const run: Command = async (file, args) => {
  try { const { stdout } = await exec(file, args, { timeout: 15000, maxBuffer: 128 * 1024, env: { ...process.env, LC_ALL: "C" } }); return { stdout }; }
  catch { throw new Error("CUPS_COMMAND_FAILED"); }
};
export class LaptopPrintDevice implements PrintDevice {
  readonly kind = "cups" as const;
  constructor(private printer: string, private command: Command = run, private query = queryIpp) {
    if (!/^[A-Za-z0-9_.-]{1,127}$/.test(printer)) throw new Error("INVALID_CUPS_PRINTER");
  }
  async discoverPrinters() { return (await this.command("lpstat", ["-h", "127.0.0.1:631", "-e"])).stdout.trim().split(/\s+/).filter(name => /^[A-Za-z0-9_.-]+$/.test(name)); }
  async getPrinterStatus() {
    try {
      const attributes = await this.query(`/printers/${encodeURIComponent(this.printer)}`, 0x0b, ["printer-state", "printer-is-accepting-jobs", "printer-state-reasons"]);
      const reasons = attributes["printer-state-reasons"];
      const blocked = (Array.isArray(reasons) ? reasons : [String(reasons ?? "")]).some(reason => /offline|media-empty|door-open|paused|shutdown|connecting-to-device/.test(reason));
      return { available: !blocked && [3, 4].includes(Number(attributes["printer-state"])) && attributes["printer-is-accepting-jobs"] === true };
    } catch { return { available: null }; }
  }
  async submitJob(job: PrintJobRequest, filePath: string, attemptId: string) {
    const args = ["-h", "127.0.0.1:631", "-d", this.printer, "-t", `PrintOS-${attemptId}`, "-n", String(job.copies), "-o", job.colorMode === "COLOUR" ? "ColorModel=RGB" : "ColorModel=Gray", "-o", job.duplex ? "sides=two-sided-long-edge" : "sides=one-sided", "-o", `media=${job.paperSize}`];
    if (job.pageRange !== "all") args.push("-o", `page-ranges=${job.pageRange}`);
    args.push("--", filePath);
    const { stdout } = await this.command("lp", args);
    const spoolId = stdout.match(/request id is ([A-Za-z0-9_.-]+-\d+)/)?.[1];
    if (!spoolId || !spoolId.startsWith(`${this.printer}-`)) throw new Error("CUPS_SUBMISSION_UNCERTAIN");
    return { spoolId };
  }
  async getJobStatus(spoolId: string, attemptId: string): Promise<JobStatusInfo> {
    const id = spoolId.match(/-(\d+)$/)?.[1]; if (!id) return { state: "unknown" };
    try {
      const attributes = await this.query(`/jobs/${id}`, 9, ["job-state", "job-state-reasons", "job-impressions-completed", "job-name"]);
      if (attributes["job-name"] !== `PrintOS-${attemptId}`) return { state: "unknown" };
      const state = attributes["job-state"];
      if (state === 9) {
        const reasons = attributes["job-state-reasons"];
        if ((Array.isArray(reasons) ? reasons : [reasons]).includes("job-completed-with-errors")) return { state: "failed" };
        const pages = attributes["job-impressions-completed"];
        return { state: "completed", ...(typeof pages === "number" && Number.isInteger(pages) && pages >= 0 && pages <= 1000000 ? { pages } : {}) };
      }
      if (state === 7 || state === 8) return { state: "failed" };
      return { state: [3, 4, 5, 6].includes(Number(state)) ? "pending" : "unknown" };
    } catch { return { state: "unknown" }; }
  }
}
