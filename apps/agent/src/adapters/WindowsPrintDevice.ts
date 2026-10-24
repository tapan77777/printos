import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { rendererVersion } from "./WindowsVersion";
import type { PrintDevice, PrintJobRequest, JobStatusInfo } from "../PrintDevice";
import { PrintSubmissionUncertain } from "../PrintDevice";

export type WindowsPrinter = {
  name: string; identifier: string; isDefault: boolean; available: boolean | null;
  color: boolean; duplex: boolean; maxCopies: number; papers: number[];
};
export type WindowsSpoolJob = { id: number; document: string; status: number };
export interface WindowsSpooler {
  printers(): Promise<WindowsPrinter[]>;
  jobs(printer: string): Promise<WindowsSpoolJob[]>;
}
export type Run = (file: string, args: string[], timeout: number) => Promise<string>;
export const runWindows: Run = (file, args, timeout) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout, maxBuffer: 256 * 1024, windowsHide: true, shell: false }, (error, stdout) => {
    if (error) reject(new Error("WINDOWS_PROCESS_FAILED")); else resolve(stdout);
  });
});
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const papers: Record<string, number> = { A3: 8, A4: 9, A5: 11, LETTER: 1, LEGAL: 5 };
/** Fail closed on renamed/replaced queues. Identity deliberately includes the queue name. */
export class WindowsPrintDevice implements PrintDevice {
  readonly kind = "windows" as const;
  constructor(private selection?: { name: string; identifier: string }, private spooler?: WindowsSpooler,
    private renderer?: { file: string; sha256: string }, private run: Run = runWindows,
    private verify: (file: string, hash: string) => Promise<void> = async (file, hash) => {
      if (!path.isAbsolute(file) || !/^[a-f0-9]{64}$/i.test(hash) || createHash("sha256").update(await readFile(file)).digest("hex") !== hash.toLowerCase()) throw new Error("WINDOWS_RENDERER_INTEGRITY_FAILED");
      await rendererVersion(file);
    }) {}
  async listPrinters() { if (!this.spooler) throw new Error("WINDOWS_CONFIGURATION_REQUIRED"); return this.spooler.printers(); }
  async discoverPrinters() { return (await this.listPrinters()).map(p => p.name); }
  private async selected() {
    const matches = (await this.listPrinters()).filter(p => p.name === this.selection?.name && p.identifier === this.selection?.identifier);
    if (matches.length !== 1) throw new Error("WINDOWS_PRINTER_SELECTION_REQUIRED");
    return matches[0];
  }
  async getPrinterStatus() {
    try { return { available: (await this.selected()).available }; } catch { return { available: null }; }
  }
  async validateJob(job: PrintJobRequest) {
    const p = await this.selected();
    if (!Number.isInteger(job.copies) || job.copies < 1 || job.copies > p.maxCopies ||
      !["BW", "COLOUR"].includes(job.colorMode) || (job.colorMode === "COLOUR" && !p.color) ||
      (job.duplex && !p.duplex) || !papers[job.paperSize.toUpperCase()] || !p.papers.includes(papers[job.paperSize.toUpperCase()]) ||
      (job.pageRange !== "all" && job.pageRange !== "" && !/^[1-9]\d*(?:-[1-9]\d*)?(?:,[1-9]\d*(?:-[1-9]\d*)?)*$/.test(job.pageRange))) throw new Error("WINDOWS_SETTINGS_UNSUPPORTED");
    for (const range of (job.pageRange === "all" ? "" : job.pageRange).split(",").filter(Boolean)) {
      const [a, b = a] = range.split("-").map(Number);
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b < a) throw new Error("WINDOWS_SETTINGS_UNSUPPORTED");
    }
    if (!this.renderer) throw new Error("WINDOWS_RENDERER_REQUIRED");
    await this.verify(this.renderer.file, this.renderer.sha256);
  }
  async submitJob(job: PrintJobRequest, file: string, attemptId: string) {
    // Revalidate immediately before the side effect; Engine has already written SUBMITTING.
    await this.validateJob(job);
    if (!uuid.test(attemptId) || !path.isAbsolute(file) || path.basename(file) !== `${attemptId}.pdf`) throw new Error("WINDOWS_DOCUMENT_ID_INVALID");
    const printer = await this.selected();
    if (printer.available !== true) throw new Error("WINDOWS_PRINTER_UNAVAILABLE");
    // Never adopt an old/duplicate document with the same attempt title.
    if ((await this.spooler!.jobs(printer.name)).some(j => this.matches(j, attemptId))) throw new Error("WINDOWS_DUPLICATE_ATTEMPT");
    const settings = ["ignore-pdf-print-settings", "fit", `${job.copies}x`, job.colorMode === "BW" ? "monochrome" : "color",
      job.duplex ? "duplexlong" : "simplex", `paperkind=${papers[job.paperSize.toUpperCase()]}`, ...(job.pageRange && job.pageRange !== "all" ? [job.pageRange] : [])];
    let done = false;
    // Attach rejection handling immediately: observation must never leave a rejected
    // renderer promise unhandled. No second renderer call, including on timeout.
    const rendering = this.run(this.renderer!.file, ["-new-window", "-silent", "-print-to", printer.name, "-print-settings", settings.join(","), file], 60000)
      .then(() => ({ ok: true }), () => ({ ok: false })).finally(() => { done = true; });
    const ids = new Set<number>();
    const deadline = Date.now() + 60000;
    do {
      try {
        for (const j of await this.spooler!.jobs(printer.name)) if (this.matches(j, attemptId)) ids.add(j.id);
      } catch { /* Monitoring failure cannot authorize a retry. */ }
      if (!done && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
    } while (!done && Date.now() < deadline);
    const result = await rendering;
    try {
      for (const j of await this.spooler!.jobs(printer.name)) if (this.matches(j, attemptId)) ids.add(j.id);
    } catch { /* Earlier exact observations remain valid; absence is not completion. */ }
    // No exit-code-only success. Fast disappearing jobs and altered titles are uncertain.
    const knownId = ids.size === 1 && Number.isInteger([...ids][0]) && [...ids][0] > 0 ? `WIN-${[...ids][0]}` : undefined;
    if (!result.ok || !knownId) throw new PrintSubmissionUncertain(knownId);
    return { spoolId: `WIN-${[...ids][0]}` };
  }
  private matches(job: WindowsSpoolJob, attempt: string) { return job.document === `${attempt}.pdf`; }
  async getJobStatus(spoolId: string, attemptId: string): Promise<JobStatusInfo> {
    if (!/^WIN-[1-9]\d{0,9}$/.test(spoolId) || !uuid.test(attemptId)) return { state: "unknown" };
    try {
      const printer = await this.selected();
      const matches = (await this.spooler!.jobs(printer.name)).filter(j => j.id === Number(spoolId.slice(4)) && this.matches(j, attemptId));
      if (matches.length !== 1) return { state: "unknown" };
      const status = matches[0].status;
      // Deleted/cancelled, driver errors, paper/offline and "printed" cannot prove physical output.
      if (status & (4 | 256)) return { state: "unknown", reconciliationCode: "SPOOL_CANCELLED" };
      if (status & 32) return { state: "unknown", reconciliationCode: "SPOOL_OFFLINE" };
      if (status & 64) return { state: "unknown", reconciliationCode: "SPOOL_PAPER_OUT" };
      if (status & (2 | 512 | 1024)) return { state: "unknown", reconciliationCode: "SPOOL_DRIVER_ERROR" };
      // Even JOB_STATUS_COMPLETE/PRINTED only means handed to the device. Human confirmation required.
      if (status & (128 | 4096)) return { state: "unknown", reconciliationCode: "COMPLETION_UNVERIFIED" };
      return { state: "pending" };
    } catch { return { state: "unknown" }; }
  }
}
