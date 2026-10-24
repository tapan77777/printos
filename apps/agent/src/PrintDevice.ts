/** OS adapters never call the cloud, retry submissions, or own lifecycle state. */
export type PrinterStatusInfo = { available: boolean | null };
export type JobStatusInfo = {
  state: "pending" | "completed" | "failed" | "unknown"; pages?: number;
  reconciliationCode?: "SPOOL_OFFLINE" | "SPOOL_PAPER_OUT" | "SPOOL_CANCELLED" | "SPOOL_DRIVER_ERROR" | "COMPLETION_UNVERIFIED";
};
export interface PrintJobRequest {
  id: string;
  copies: number;
  colorMode: "BW" | "COLOUR";
  paperSize: string;
  duplex: boolean;
  pageRange: string;
}
/** Observation only: a known spool ID never grants permission to submit again. */
export class PrintSubmissionUncertain extends Error {
  constructor(readonly spoolId?: string) { super("PRINT_SUBMISSION_UNCERTAIN"); }
}
export interface PrintDevice {
  readonly kind: "cups" | "mock" | "windows";
  discoverPrinters(): Promise<string[]>;
  getPrinterStatus(): Promise<PrinterStatusInfo>;
  /** Read-only settings/integrity check before requesting submission authorization. */
  validateJob?(job: PrintJobRequest): Promise<void>;
  /** Invoke once per attempt. Any throw after invocation is an uncertain outcome. */
  submitJob(job: PrintJobRequest, filePath: string, attemptId: string): Promise<{ spoolId: string }>;
  getJobStatus(spoolId: string, attemptId: string): Promise<JobStatusInfo>;
}
