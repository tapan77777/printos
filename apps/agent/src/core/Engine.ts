import { randomUUID } from "node:crypto";
import type { PrintDevice } from "../PrintDevice";
import { PrintSubmissionUncertain } from "../PrintDevice";
import { CloudError, type Cloud, type AttemptEvent } from "./CloudClient";
import { Journal, type RecordState } from "./Journal";

type EngineState = RecordState & { leaseExpiresAt?: string; spoolBound?: boolean; outcome?: { state: "completed" | "failed"; pages?: number } };
export class Engine {
  stopping = false;
  processingState = "IDLE";
  private ticking = false;
  constructor(private cloud: Cloud, private device: PrintDevice, private journal: Journal, private options: { completionTimeoutMs?: number; skipMockDownload?: boolean; now?: () => number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }
  async heartbeat() {
    const health = await this.device.getPrinterStatus().catch(() => ({ available: null }));
    await this.cloud.heartbeat(this.stopping ? "STOPPING" : this.processingState, health.available);
  }
  private async queue(state: EngineState, event: Omit<AttemptEvent, "eventId">) {
    state.pending = { ...event, eventId: randomUUID() }; await this.journal.save(state);
  }
  private async reconcile(state: EngineState, code = "SUBMISSION_UNCERTAIN") {
    state.phase = "RECONCILIATION"; state.pending = undefined;
    await this.queue(state, { operation: "report", printStatus: "RECONCILIATION_REQUIRED", cupsJobId: state.spoolId, errorCode: code });
  }
  private async submitAuthorized(state: EngineState, lease: string | undefined) {
    // Write-ahead physical side-effect barrier. Never retry past this point, even if
    // the process dies before the actual OS call. This intentionally sacrifices liveness.
    state.phase = "SUBMITTING"; state.pending = undefined; state.submittedAt = this.now();
    await this.journal.save(state);
    this.processingState = "SUBMITTING";
    if (this.stopping || !lease || !Number.isFinite(Date.parse(lease)) || Date.parse(lease) <= this.now() + 1000) { await this.reconcile(state); return; }
    let result: { spoolId: string };
    try { result = await this.device.submitJob(state.job!, this.journal.filePath(state.attemptId), state.attemptId); }
    catch (err) {
      if (err instanceof PrintSubmissionUncertain && err.spoolId && /^[A-Za-z0-9_.-]{1,128}$/.test(err.spoolId)) state.spoolId = err.spoolId;
      await this.reconcile(state); return;
    }
    if (!result.spoolId || !/^[A-Za-z0-9_.-]{1,128}$/.test(result.spoolId)) { await this.reconcile(state); return; }
    state.spoolId = result.spoolId; state.phase = "SUBMITTED";
    await this.journal.save(state); // If this fails, disk still says SUBMITTING: fail closed on restart.
    await this.queue(state, { operation: "report", printStatus: "PRINTING", cupsJobId: state.spoolId });
  }
  private async flush(state: EngineState) {
    const event = state.pending!;
    try {
      const ack = await this.cloud.event(state.job!.id, state.attemptId, event);
      if (ack.acknowledged !== true || ack.eventId !== event.eventId || ack.attemptId !== state.attemptId || (event.printStatus && ack.printStatus !== event.printStatus)) throw new CloudError("INVALID_ACKNOWLEDGEMENT");
      if (event.operation === "authorize") { await this.submitAuthorized(state, ack.leaseExpiresAt); return; }
      state.pending = undefined;
      if (event.operation === "renew") state.leaseExpiresAt = ack.leaseExpiresAt;
      if (event.printStatus === "PRINTING") state.spoolBound = true;
      if (event.printStatus === "COMPLETED" || event.printStatus === "FAILED") { state.finalStatus = event.printStatus; await this.journal.finish(state); return; }
      await this.journal.save(state);
    } catch (err) {
      // Rejected authorization can never authorize a physical retry. A lost response
      // stays pending with the SAME event id; a 409 is reconciled, not retried blindly.
      if (event.operation === "authorize" && err instanceof CloudError && (err.status === 409 || err.code === "INVALID_ACKNOWLEDGEMENT" || err.code === "AUTHORIZATION_EXPIRED")) { await this.reconcile(state); return; }
      if (err instanceof CloudError && err.status === 409) {
        const remote = await this.cloud.claim(state.attemptId);
        if (remote && ["COMPLETED", "FAILED", "CANCELLED"].includes(remote.printStatus)) { await this.journal.finish(state); return; }
        if (remote?.printStatus === "RECONCILIATION_REQUIRED" && event.printStatus === "PRINTING") {
          state.pending = undefined; state.phase = "RECONCILIATION"; await this.journal.save(state); return;
        }
      }
      throw err;
    }
  }
  private async monitor(state: EngineState) {
    if (!state.spoolId || state.outcome) return;
    const result = await this.device.getJobStatus(state.spoolId, state.attemptId).catch(() => ({ state: "unknown" as const }));
    if (result.state === "completed" || result.state === "failed") {
      state.outcome = { state: result.state, ...("pages" in result && Number.isInteger(result.pages) && result.pages! >= 0 && result.pages! <= 1000000 ? { pages: result.pages } : {}) };
      await this.journal.save(state);
    } else if (state.phase !== "RECONCILIATION" && "reconciliationCode" in result && result.reconciliationCode) {
      await this.reconcile(state, result.reconciliationCode);
    } else if (state.phase !== "RECONCILIATION" && this.now() - (state.submittedAt ?? 0) > (this.options.completionTimeoutMs ?? 300000)) {
      // Timeout does not imply failure or cancellation of the OS job.
      await this.reconcile(state, "COMPLETION_UNVERIFIED");
    }
  }
  async tick() {
    if (this.ticking) throw new Error("CONCURRENT_ENGINE_TICK");
    this.ticking = true;
    try { await this.step(); } finally { this.ticking = false; }
  }
  private async step() {
    let state = await this.journal.load() as EngineState | null;
    this.processingState = state?.phase ?? "IDLE";
    if (this.stopping) return;
    if (!state) {
      const orphan = (await this.cloud.recovery())[0];
      if (orphan) {
        const job = await this.cloud.claim(orphan.attemptId);
        if (!job) throw new CloudError("RECOVERY_CONFLICT");
        state = { version: 1, scope: this.journal.scope, attemptId: orphan.attemptId, phase: "RECONCILIATION", job, spoolId: orphan.cupsJobId ?? undefined };
        if (orphan.printStatus !== "RECONCILIATION_REQUIRED") await this.reconcile(state, "JOURNAL_LOST");
        else await this.journal.save(state);
        return;
      }
      state = { version: 1, scope: this.journal.scope, attemptId: randomUUID(), phase: "CLAIMING" };
      await this.journal.save(state); return;
    }
    if (state.phase === "SUBMITTING") { await this.reconcile(state); return; }
    // Local spool observation continues even if a cloud status update is pending/offline.
    if (state.phase === "SUBMITTED" || state.phase === "RECONCILIATION") await this.monitor(state);
    if (state.pending) { await this.flush(state); return; }
    if (state.outcome) {
      state.phase = "REPORTING";
      await this.queue(state, { operation: "report", printStatus: state.outcome.state === "completed" ? "COMPLETED" : "FAILED", cupsJobId: state.spoolId, pagesPrinted: state.outcome.pages, ...(state.outcome.state === "failed" ? { errorCode: "SPOOL_FAILED" } : {}) });
      return;
    }
    if (state.phase === "RECONCILIATION") {
      const remote = await this.cloud.claim(state.attemptId);
      if (remote && ["COMPLETED", "FAILED", "CANCELLED"].includes(remote.printStatus)) await this.journal.finish(state);
      return;
    }
    if (state.phase === "SUBMITTED") return;
    if (state.phase === "CLAIMING") {
      const job = await this.cloud.claim(state.attemptId);
      if (!job) { await this.journal.finish(state); return; }
      state.job = job;
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.printStatus)) { await this.journal.finish(state); return; }
      if (job.submissionAuthorizedAt || job.printStatus !== "DOWNLOADING") { state.spoolId = job.cupsJobId ?? undefined; await this.reconcile(state); return; }
      state.phase = "CLAIMED"; await this.journal.save(state); return;
    }
    if (state.phase === "AUTHORIZING" || state.phase === "REPORTING") { await this.reconcile(state); return; }
    if (!state.leaseExpiresAt || !Number.isFinite(Date.parse(state.leaseExpiresAt)) || Date.parse(state.leaseExpiresAt) < this.now() + 30000) {
      await this.queue(state, { operation: "renew" }); return;
    }
    if ((await this.device.getPrinterStatus().catch(() => ({ available: null }))).available !== true) return;
    if (state.phase === "CLAIMED") {
      try {
        if (!(this.device.kind === "mock" && this.options.skipMockDownload)) await this.journal.document(state, await this.cloud.download(state.job!.id, state.attemptId));
      } catch (err) {
        if (err instanceof CloudError && err.status === 403) { state.leaseExpiresAt = undefined; await this.journal.save(state); return; }
        if (err instanceof CloudError && ([404, 410, 413, 415].includes(err.status ?? 0) || ["INVALID_DOCUMENT", "RESPONSE_TOO_LARGE"].includes(err.code))) {
          state.phase = "REPORTING"; await this.queue(state, { operation: "report", printStatus: "FAILED", errorCode: "DOWNLOAD_FAILED" }); return;
        }
        throw err;
      }
      state.phase = "DOWNLOADED"; await this.journal.save(state); return;
    }
    if (state.phase === "DOWNLOADED") {
      if (!(this.device.kind === "mock" && this.options.skipMockDownload) && !await this.journal.validDocument(state)) { state.phase = "CLAIMED"; await this.journal.save(state); return; }
      try { await this.device.validateJob?.(state.job!); }
      catch { await this.reconcile(state, "PRINT_CONFIGURATION_INVALID"); return; }
      state.phase = "AUTHORIZING";
      await this.queue(state, { operation: "authorize", printStatus: "PRINTING" });
    }
  }
}
