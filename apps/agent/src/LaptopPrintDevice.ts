import { PrintDevice, PrintJobRequest, JobStatusInfo, PrinterStatusInfo } from "./PrintDevice";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const CUPS_POLL_INTERVAL_MS = Number(process.env.CUPS_POLL_INTERVAL_MS ?? 2000);
const CUPS_COMPLETION_TIMEOUT_MS = Number(process.env.CUPS_COMPLETION_TIMEOUT_SEC ?? 300) * 1000;

export class LaptopPrintDevice implements PrintDevice {
  constructor(
    private cupsPrinterName: string,
    private cloudUrl: string,
    private agentToken: string,
  ) {}

  async connect(): Promise<void> {
    console.log(`[LaptopPrintDevice] target CUPS printer: ${this.cupsPrinterName}`);
    const info = await this.getPrinterStatus();
    console.log(`[LaptopPrintDevice] printer online=${info.online}`);
  }

  async heartbeat(): Promise<void> {
    const info = await this.getPrinterStatus();
    if (!info.online) console.warn(`[heartbeat] ${this.cupsPrinterName} is offline`);
  }

  async submitJob(job: PrintJobRequest): Promise<void> {
    const tempPath = path.join(tmpdir(), `${job.jobId}.pdf`);

    try {
      await this.patchStatus(job.jobId, { printStatus: "DOWNLOADING" });

      const res = await fetch(job.fileUrl, {
        headers: { Authorization: `Bearer ${this.agentToken}` },
      });
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/pdf")) {
        throw new Error(`Unexpected content-type: ${ct}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
        throw new Error("Downloaded file is not a PDF (magic bytes mismatch)");
      }
      await writeFile(tempPath, buf);

      const lpArgs = this.buildLpArgs(job, tempPath);
      const { stdout } = await execFileAsync("lp", lpArgs);
      const cupsJobId = parseCupsJobId(stdout);
      console.log(`[agent] lp ok (cups job ${cupsJobId ?? "<unknown>"})`);

      await this.patchStatus(job.jobId, { printStatus: "PRINTING", cupsJobId: cupsJobId ?? undefined });

      const done = await this.waitForCupsCompletion(cupsJobId);
      if (done.ok) {
        await this.patchStatus(job.jobId, {
          printStatus: "COMPLETED",
          pagesPrinted: done.pages ?? undefined,
        });
      } else {
        await this.patchStatus(job.jobId, {
          printStatus: "FAILED",
          agentError: done.error ?? "CUPS completion not verified",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agent] submitJob(${job.jobId}) error:`, msg);
      await this.patchStatus(job.jobId, { printStatus: "FAILED", agentError: msg });
    } finally {
      unlink(tempPath).catch(() => {});
    }
  }

  async getJobStatus(_jobId: string): Promise<JobStatusInfo> {
    return { jobId: _jobId, status: "FAILED", error: "Not implemented" };
  }

  async getPrinterStatus(): Promise<PrinterStatusInfo> {
    try {
      const { stdout } = await execFileAsync("lpstat", ["-p", this.cupsPrinterName]);
      const online = /is idle|is printing|now printing/.test(stdout);
      return { online, name: this.cupsPrinterName };
    } catch {
      return { online: false, name: this.cupsPrinterName };
    }
  }

  private buildLpArgs(job: PrintJobRequest, filePath: string): string[] {
    const args: string[] = ["-d", this.cupsPrinterName, "-n", String(job.copies)];
    if (job.colorMode === "COLOUR") {
      args.push("-o", "ColorModel=RGB");
    } else {
      args.push("-o", "ColorModel=Gray");
    }
    if (job.duplex) {
      args.push("-o", "sides=two-sided-long-edge");
    } else {
      args.push("-o", "sides=one-sided");
    }
    if (job.paperSize) {
      args.push("-o", `media=${job.paperSize}`);
    }
    if (job.pageRange && job.pageRange !== "all") {
      args.push("-o", `page-ranges=${job.pageRange}`);
    }
    args.push(filePath);
    return args;
  }

  // Polls CUPS until the given job id disappears from the active queue and
  // appears in the completed list. If we never captured a CUPS job id, we
  // conservatively mark FAILED after the timeout rather than lie.
  private async waitForCupsCompletion(cupsJobId: string | null): Promise<{ ok: boolean; pages?: number; error?: string }> {
    if (!cupsJobId) return { ok: false, error: "No CUPS job id captured — completion cannot be verified" };

    const deadline = Date.now() + CUPS_COMPLETION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const active = await execFileAsync("lpstat", ["-o", this.cupsPrinterName]).then((r) => r.stdout).catch(() => "");
      if (!new RegExp(`^${escapeRe(cupsJobId)}\\s`, "m").test(active)) {
        const completed = await execFileAsync("lpstat", ["-W", "completed", "-o", this.cupsPrinterName])
          .then((r) => r.stdout)
          .catch(() => "");
        if (new RegExp(`^${escapeRe(cupsJobId)}\\s`, "m").test(completed)) {
          return { ok: true };
        }
      }
      await new Promise((r) => setTimeout(r, CUPS_POLL_INTERVAL_MS));
    }
    return { ok: false, error: "Timed out waiting for CUPS completion" };
  }

  private async patchStatus(
    jobId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(`${this.cloudUrl}/api/jobs/${jobId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.agentToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[agent] status update for ${jobId} failed: HTTP ${res.status}`);
    } else {
      console.log(`[agent] ${jobId} → ${body.printStatus}`);
    }
  }
}

function parseCupsJobId(stdout: string): string | null {
  // lp prints: `request id is PRINTER-123 (1 file(s))`
  const m = stdout.match(/request id is (\S+)/);
  return m ? m[1] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
