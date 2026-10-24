import type { PrintDevice, PrintJobRequest, JobStatusInfo } from "./PrintDevice";
/** Simulation preserves latency/failure knobs, but never calls CUPS or the cloud. */
export class MockPrintDevice implements PrintDevice {
  readonly kind = "mock" as const;
  private latency: number; private failureRate: number;
  constructor(options: { latencyMs?: number; failureRate?: number; now?: () => number; random?: () => number } = {}) {
    this.options = options;
    this.latency = options.latencyMs ?? Number(process.env.MOCK_PRINT_LATENCY_MS ?? 3000);
    this.failureRate = options.failureRate ?? Number(process.env.MOCK_FAIL_RATE ?? 0);
    if (!Number.isFinite(this.latency) || this.latency < 0 || this.latency > 300000 || !Number.isFinite(this.failureRate) || this.failureRate < 0 || this.failureRate > 1) throw new Error("INVALID_MOCK_CONFIGURATION");
  }
  private options;
  async discoverPrinters() { return ["simulation"]; }
  async getPrinterStatus() { return { available: true }; }
  async submitJob(_job: PrintJobRequest, _file: string, attemptId: string) {
    const fail = (this.options.random ?? Math.random)() < this.failureRate;
    return { spoolId: `SIM-${attemptId}-${(this.options.now ?? Date.now)() + this.latency}-${fail ? "F" : "S"}` };
  }
  async getJobStatus(spoolId: string): Promise<JobStatusInfo> {
    const match = spoolId.match(/^SIM-[a-f0-9-]{36}-(\d+)-([FS])$/i);
    if (!match) return { state: "unknown" };
    if ((this.options.now ?? Date.now)() < Number(match[1])) return { state: "pending" };
    return { state: match[2] === "F" ? "failed" : "completed" };
  }
}
