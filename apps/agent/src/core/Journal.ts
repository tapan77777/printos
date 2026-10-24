import { mkdir, open, readFile, rename, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import type { ClaimedJob, AttemptEvent } from "./CloudClient";
export type Phase = "CLAIMING" | "CLAIMED" | "DOWNLOADED" | "AUTHORIZING" | "SUBMITTING" | "SUBMITTED" | "RECONCILIATION" | "REPORTING";
export type RecordState = { version: 1; scope: string; attemptId: string; phase: Phase; job?: ClaimedJob; spoolId?: string; fileHash?: string; submittedAt?: number; pending?: AttemptEvent; finalStatus?: "COMPLETED" | "FAILED" | "RECONCILIATION_REQUIRED"; orphanScanDone?: boolean };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class Journal {
  readonly scope: string;
  constructor(readonly directory: string, scope: string) { this.scope = createHash("sha256").update(scope).digest("hex"); }
  private lockOwned = false;
  private async syncDirectory(directory: string) {
    // Windows does not expose directory fsync consistently; file sync + rename still fail closed on errors.
    if (process.platform === "win32") return;
    const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); }
  }
  async lock() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const guard = path.join(this.directory, ".lock-acquire");
    try { await mkdir(guard, { mode: 0o700 }); } catch { throw new Error("JOURNAL_LOCK_REQUIRES_INSPECTION"); }
    try {
    const lock = path.join(this.directory, ".lock");
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw new Error("JOURNAL_LOCK_FAILED");
      let owner: { pid: number; host: string };
      try { owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8")); } catch { throw new Error("JOURNAL_LOCK_REQUIRES_INSPECTION"); }
      if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error("JOURNAL_LOCK_REQUIRES_INSPECTION");
      try { process.kill(owner.pid, 0); throw new Error("AGENT_ALREADY_RUNNING"); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("AGENT_ALREADY_RUNNING"); }
      // Rename the entire stale lock before creating a new one. Competing recoverers cannot both win.
      const stale = path.join(this.directory, `.stale-${randomUUID()}`);
      await rename(lock, stale);
      try { await mkdir(lock, { mode: 0o700 }); } catch { throw new Error("AGENT_ALREADY_RUNNING"); }
      await unlink(path.join(stale, "owner.json")).catch(() => {}); await rmdir(stale).catch(() => {});
    }
    const owner = await open(path.join(lock, "owner.json"), "wx", 0o600);
    try { await owner.writeFile(JSON.stringify({ pid: process.pid, host: hostname() })); await owner.sync(); } finally { await owner.close(); }
    this.lockOwned = true;
    } finally { await rmdir(guard); }
  }
  async unlock() {
    if (!this.lockOwned) return;
    await unlink(path.join(this.directory, ".lock/owner.json")); await rmdir(path.join(this.directory, ".lock")); this.lockOwned = false;
  }
  private async atomic(name: string, bytes: string | Buffer) {
    if (!this.lockOwned) throw new Error("JOURNAL_NOT_LOCKED");
    const temp = path.join(this.directory, `.write-${randomUUID()}`);
    const handle = await open(temp, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, path.join(this.directory, name)); await this.syncDirectory(this.directory);
  }
  async load(): Promise<RecordState | null> {
    let text: string;
    try { text = await readFile(path.join(this.directory, "active.json"), "utf8"); }
    catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return null; throw new Error("JOURNAL_UNREADABLE"); }
    try {
      const state = JSON.parse(text) as RecordState;
      if (state.version !== 1 || state.scope !== this.scope || !UUID.test(state.attemptId) || !["CLAIMING", "CLAIMED", "DOWNLOADED", "AUTHORIZING", "SUBMITTING", "SUBMITTED", "RECONCILIATION", "REPORTING"].includes(state.phase) || (state.job && state.job.attemptId !== state.attemptId)) throw new Error();
      return state;
    } catch { throw new Error("JOURNAL_INVALID_RECONCILIATION_REQUIRED"); }
  }
  async save(state: RecordState) { await this.atomic("active.json", JSON.stringify(state)); }
  filePath(attemptId: string) { if (!UUID.test(attemptId)) throw new Error("INVALID_ATTEMPT_ID"); return path.join(this.directory, `${attemptId}.pdf`); }
  async document(state: RecordState, bytes: Buffer) {
    await this.atomic(`${state.attemptId}.pdf`, bytes);
    state.fileHash = createHash("sha256").update(bytes).digest("hex");
  }
  async validDocument(state: RecordState) {
    try { return !!state.fileHash && createHash("sha256").update(await readFile(this.filePath(state.attemptId))).digest("hex") === state.fileHash; } catch { return false; }
  }
  async finish(state: RecordState) {
    if (state.job) await this.atomic(`history-${state.attemptId}.json`, JSON.stringify({ ...state, pending: undefined }));
    await unlink(this.filePath(state.attemptId)).catch(err => { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("DOCUMENT_CLEANUP_FAILED"); });
    await unlink(path.join(this.directory, "active.json")); await this.syncDirectory(this.directory);
  }
}
