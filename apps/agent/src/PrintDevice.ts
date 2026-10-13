export interface PrinterStatusInfo {
  online: boolean;
  name: string;
}

export interface JobStatusInfo {
  jobId: string;
  status: "DOWNLOADING" | "PRINTING" | "COMPLETED" | "FAILED";
  error?: string;
}

export interface PrintJobRequest {
  jobId: string;
  fileUrl: string;
  copies: number;
  colorMode: "BW" | "COLOUR";
  paperSize: string;
  duplex: boolean;
  pageRange: string;
}

export interface PrintDevice {
  connect(): Promise<void>;
  heartbeat(): Promise<void>;
  submitJob(job: PrintJobRequest): Promise<void>;
  getJobStatus(jobId: string): Promise<JobStatusInfo>;
  getPrinterStatus(): Promise<PrinterStatusInfo>;
}
