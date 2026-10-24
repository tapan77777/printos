import {createHash} from "node:crypto";
import type { PrintJobRequest } from "../PrintDevice";
export type ClaimedJob = PrintJobRequest & { attemptId: string; printStatus: string; cupsJobId: string | null; submissionAuthorizedAt: string | null; printer?: { deviceId: string } };
export type AttemptEvent = { eventId: string; operation: "renew" | "authorize" | "report"; printStatus?: string; cupsJobId?: string; errorCode?: string; pagesPrinted?: number };
export type Acknowledgement = { acknowledged: true; attemptId: string; eventId: string; printStatus: string; leaseExpiresAt?: string };
export interface Cloud {
  claim(attemptId: string): Promise<ClaimedJob | null>;
  event(jobId: string, attemptId: string, event: AttemptEvent): Promise<Acknowledgement>;
  download(jobId: string, attemptId: string): Promise<Buffer>;
  recovery(): Promise<{ id: string; attemptId: string; cupsJobId: string | null; printStatus: string }[]>;
  heartbeat(state: string, available: boolean | null): Promise<void>;
}
export class CloudError extends Error { constructor(public code: string, public status?: number) { super(code); } }
export async function readBounded(res: Response, max: number): Promise<Buffer> {
  const reader = res.body?.getReader(); if (!reader) throw new CloudError("EMPTY_RESPONSE");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > max) throw new CloudError("RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export class CloudClient implements Cloud {
  private readonly base: string;
  constructor(base: string, private agentId: string, private token: string, private options: {
    version?: string; printerDeviceId?: string; printerIdentifier?:string; leaseMs?: number; timeoutMs?: number; attempts?: number; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>;
  } = {}) {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new CloudError("HTTPS_REQUIRED");
    this.base = base.replace(/\/$/, "");
  }
  private async request(route: string, init: RequestInit, max = 128 * 1024): Promise<{ bytes: Buffer; type: string }> {
    const tries = this.options.attempts ?? 3;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await (this.options.fetch ?? fetch)(`${this.base}${route}`, { ...init, redirect: "error", signal: AbortSignal.timeout(this.options.timeoutMs ?? 10000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}`, "x-printos-agent": this.agentId, ...(this.options.printerIdentifier?{"x-printos-printer-identity":this.options.printerIdentifier}:{}), ...init.headers } });
        if (!res.ok) { await res.body?.cancel(); throw new CloudError("HTTP_REJECTED", res.status); }
        return { bytes: await readBounded(res, max), type: res.headers.get("content-type") ?? "" };
      } catch (err) {
        if (err instanceof CloudError && (!err.status || ![408, 429, 500, 502, 503, 504].includes(err.status))) throw err;
        if (i + 1 >= tries) throw err instanceof CloudError ? err : new CloudError("NETWORK_UNAVAILABLE");
        await (this.options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(Math.min(3000, 250 * 2 ** i) + Math.floor(Math.random() * 100));
      }
    }
    throw new CloudError("NETWORK_UNAVAILABLE");
  }
  private async json<T>(route: string, init: RequestInit): Promise<T> {
    const { bytes } = await this.request(route, init);
    try { return JSON.parse(bytes.toString("utf8")) as T; } catch { throw new CloudError("INVALID_RESPONSE"); }
  }
  async claim(attemptId: string) {
    const data = await this.json<{ jobs: ClaimedJob[] }>("/api/jobs/claim", { method: "POST", body: JSON.stringify({ attemptId, printerDeviceId: this.options.printerDeviceId, max: 1, leaseMs: this.options.leaseMs ?? 120000 }) });
    if (!Array.isArray(data.jobs) || data.jobs.length > 1) throw new CloudError("INVALID_CLAIM");
    const job = data.jobs[0];
    if (job && (job.attemptId !== attemptId || (this.options.printerDeviceId && job.printer?.deviceId !== this.options.printerDeviceId) || !/^[A-Za-z0-9-]{1,80}$/.test(job.id) || !Number.isInteger(job.copies) || job.copies < 1 || job.copies > 50 || !["BW", "COLOUR"].includes(job.colorMode) || !["A4", "A5", "LETTER", "LEGAL"].includes(job.paperSize) || typeof job.duplex !== "boolean" || typeof job.pageRange !== "string" || job.pageRange.length > 64 || !/^(all|\d+(-\d+)?(,\d+(-\d+)?)*)$/.test(job.pageRange))) throw new CloudError("INVALID_CLAIM");
    return job ?? null;
  }
  async event(jobId: string, attemptId: string, event: AttemptEvent) {
    const ack = await this.json<Acknowledgement>(`/api/jobs/${jobId}/status`, { method: "POST", headers: { "x-printos-attempt": attemptId }, body: JSON.stringify(event) });
    if (ack.acknowledged !== true || ack.attemptId !== attemptId || ack.eventId !== event.eventId || (event.printStatus && ack.printStatus !== event.printStatus)) throw new CloudError("INVALID_ACKNOWLEDGEMENT");
    if (event.operation === "authorize" && (!ack.leaseExpiresAt || !Number.isFinite(Date.parse(ack.leaseExpiresAt)) || Date.parse(ack.leaseExpiresAt) <= Date.now())) throw new CloudError("AUTHORIZATION_EXPIRED");
    return ack;
  }
  async download(jobId: string, attemptId: string) {
    const response=await this.request(`/api/jobs/${jobId}/file`, { headers: { "x-printos-attempt": attemptId,"x-printos-download":"manifest-v1" } }, 25 * 1024 * 1024);
    let {bytes,type}=response;
    if(type.includes('application/json')){
      let manifest:any;try{manifest=JSON.parse(bytes.toString());}catch{throw new CloudError('INVALID_DOCUMENT_MANIFEST');}
      let url:URL;try{url=new URL(manifest.url);}catch{throw new CloudError('INVALID_DOCUMENT_MANIFEST');}
      const expiry=Date.parse(manifest.expiresAt);
      if(url.protocol!=='https:'||url.username||url.password||url.hash||!/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)||!/^\/storage\/v1\/object\/sign\/[a-z0-9-]+\/objects\/[a-f0-9]{64}\/[a-f0-9-]{36}\.pdf$/.test(url.pathname)||!url.searchParams.get('token')||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+65000||!Number.isInteger(manifest.sizeBytes)||manifest.sizeBytes<1||manifest.sizeBytes>25*1024*1024||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw new CloudError('INVALID_DOCUMENT_MANIFEST');
      // Never forward the PrintOS agent credential or attempt headers to storage.
      // A failed storage transfer never causes physical submission.
      let downloaded:Response;
      try{downloaded=await (this.options.fetch??fetch)(url.toString(),{redirect:'error',signal:AbortSignal.timeout(this.options.timeoutMs??20000),credentials:'omit'});}catch{throw new CloudError('NETWORK_UNAVAILABLE');}
      if(!downloaded.ok){await downloaded.body?.cancel();throw new CloudError('DOCUMENT_DOWNLOAD_REJECTED',downloaded.status);}
      bytes=await readBounded(downloaded,manifest.sizeBytes);type=downloaded.headers.get('content-type')??'';
      if(bytes.length!==manifest.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw new CloudError('DOCUMENT_CHECKSUM_MISMATCH',415);
    }
    if (!type.includes("application/pdf") || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new CloudError("INVALID_DOCUMENT");
    return bytes;
  }
  async recovery() {
    const data = await this.json<{ jobs: { id: string; attemptId: string; cupsJobId: string | null; printStatus: string }[] }>("/api/agent/recovery", {});
    if (!Array.isArray(data.jobs) || data.jobs.length > 200 || data.jobs.some(job => typeof job.id !== "string" || typeof job.attemptId !== "string" || !/^[a-f0-9-]{36}$/i.test(job.attemptId) || !["DOWNLOADING", "PRINTING", "RECONCILIATION_REQUIRED"].includes(job.printStatus))) throw new CloudError("INVALID_RECOVERY_RESPONSE");
    return data.jobs;
  }
  async heartbeat(processingState: string, printerAvailable: boolean | null) {
    const ack = await this.json<{ acknowledged: boolean }>("/api/agent/heartbeat", { method: "POST", body: JSON.stringify({ version: this.options.version ?? "0.2.0", operatingSystem: process.platform, processingState, printerAvailable }) });
    if (!ack.acknowledged) throw new CloudError("INVALID_ACKNOWLEDGEMENT");
  }
}
