import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Journal } from "../src/core/Journal";
import { Engine } from "../src/core/Engine";
import { CloudError, type Cloud, type AttemptEvent, type ClaimedJob } from "../src/core/CloudClient";
import type { PrintDevice, JobStatusInfo } from "../src/PrintDevice";

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "printos-engine-test-"));
  const journal = new Journal(dir, "test-scope"); await journal.lock();
  let job: ClaimedJob | null = null; let status: JobStatusInfo = { state: "pending" };
  let offline = false; let denyAuthorization = false; let invalidAck = false; let available: boolean | null = true; let throwSubmit = false;
  let submissions = 0; let downloads = 0; let now = Date.now(); let lostClaimResponse = false;
  const events: AttemptEvent[] = [];
  const cloud: Cloud = {
    async claim(attemptId) {
      if (offline) throw new CloudError("NETWORK_UNAVAILABLE");
      if (job && job.attemptId !== attemptId) return null;
      job ??= { id: "test-job", attemptId, printStatus: "DOWNLOADING", cupsJobId: null, submissionAuthorizedAt: null, copies: 2, colorMode: "BW", paperSize: "A4", pageRange: "all", duplex: false };
      if (lostClaimResponse) { lostClaimResponse = false; throw new CloudError("NETWORK_UNAVAILABLE"); }
      return { ...job };
    },
    async recovery() { return []; },
    async event(_id, attemptId, event) {
      events.push({ ...event });
      if (offline) throw new CloudError("NETWORK_UNAVAILABLE");
      if (event.operation === "authorize" && denyAuthorization) throw new CloudError("HTTP_REJECTED", 409);
      if (event.operation === "authorize") { job!.submissionAuthorizedAt = new Date(now).toISOString(); job!.printStatus = "PRINTING"; }
      if (event.printStatus) job!.printStatus = event.printStatus;
      return { acknowledged: true, attemptId, eventId: invalidAck ? randomUUID() : event.eventId, printStatus: job!.printStatus, leaseExpiresAt: new Date(now + 120000).toISOString() };
    },
    async download() { downloads++; if (offline) throw new CloudError("NETWORK_UNAVAILABLE"); return Buffer.from("%PDF-test"); },
    async heartbeat() { if (offline) throw new CloudError("NETWORK_UNAVAILABLE"); },
  };
  const device: PrintDevice = {
    kind: "cups", async discoverPrinters() { return ["test"]; }, async getPrinterStatus() { return { available }; },
    async submitJob() { submissions++; if (throwSubmit) throw new Error("private-path-and-printer-detail-must-not-be-logged"); return { spoolId: "test-1" }; },
    async getJobStatus() { return status; },
  };
  let engine = new Engine(cloud, device, journal, { now: () => now, completionTimeoutMs: 1000 });
  async function ticks(n: number) { for (let i = 0; i < n; i++) await engine.tick(); }
  async function until(phase: string) { for (let i = 0; i < 20; i++) { if (phase === "IDLE" ? !(await journal.load()) : (await journal.load())?.phase === phase) return; await engine.tick(); } throw new Error(`Did not reach ${phase}`); }
  return { journal, cloud, device, events, dir, ticks, until,
    engine: () => engine, counts: () => ({ submissions, downloads }), job: () => job,
    setOffline(v: boolean) { offline = v; }, denyAuthorization() { denyAuthorization = true; }, invalidAck() { invalidAck = true; }, setAvailable(v: boolean | null) { available = v; }, setSubmitFailure() { throwSubmit = true; }, lostClaim() { lostClaimResponse = true; }, setStatus(v: JobStatusInfo) { status = v; }, advance(ms: number) { now += ms; },
    restart() { engine = new Engine(cloud, device, journal, { now: () => now, completionTimeoutMs: 1000 }); },
    async close() { await journal.unlock(); await rm(dir, { recursive: true, force: true }); },
  };
}

test("submission runs once only after acknowledged authorization and a durable SUBMITTING marker", async () => {
  const f = await fixture();
  try {
    const submit = f.device.submitJob;
    f.device.submitJob = async (...args) => { assert.equal((await f.journal.load())?.phase, "SUBMITTING"); assert.ok(f.events.some(e => e.operation === "authorize")); return submit(...args); };
    await f.until("SUBMITTED"); await f.ticks(3); assert.equal(f.counts().submissions, 1);
    f.setStatus({ state: "completed", pages: 8 }); await f.until("IDLE");
    assert.equal(await f.journal.load(), null); assert.equal(f.counts().submissions, 1);
  } finally { await f.close(); }
});
test("a denied authorization never invokes the printer", async () => {
  const f = await fixture(); try { f.denyAuthorization(); await f.until("AUTHORIZING"); await f.ticks(2); assert.equal(f.counts().submissions, 0); assert.equal((await f.journal.load())?.phase, "RECONCILIATION"); } finally { await f.close(); }
});
test("a mismatched server acknowledgement never invokes the printer", async () => {
  const f = await fixture(); try { await f.until("AUTHORIZING"); f.invalidAck(); await f.ticks(1); assert.equal(f.counts().submissions, 0); assert.equal((await f.journal.load())?.phase, "RECONCILIATION"); } finally { await f.close(); }
});
test("offline authorization remains durable and reuses the same event after reconnection", async () => {
  const f = await fixture(); try {
    await f.until("AUTHORIZING"); const before = (await f.journal.load())!.pending!.eventId;
    f.setOffline(true); await assert.rejects(f.ticks(1)); assert.equal(f.counts().submissions, 0);
    f.restart(); f.setOffline(false); await f.ticks(1); assert.equal(f.counts().submissions, 1);
    assert.equal(f.events.filter(e => e.operation === "authorize").at(-1)!.eventId, before);
  } finally { await f.close(); }
});
test("lost claim acknowledgement recovers the same claim after restart", async () => {
  const f = await fixture(); try {
    await f.ticks(1); const attempt = (await f.journal.load())!.attemptId; f.lostClaim(); await assert.rejects(f.ticks(1));
    f.restart(); await f.until("SUBMITTED"); assert.equal(f.job()!.attemptId, attempt); assert.equal(f.counts().submissions, 1);
  } finally { await f.close(); }
});
test("restart after download resumes without duplicate download or print", async () => {
  const f = await fixture(); try { await f.until("DOWNLOADED"); f.restart(); await f.until("SUBMITTED"); assert.deepEqual(f.counts(), { submissions: 1, downloads: 1 }); } finally { await f.close(); }
});
test("restart after SUBMITTING without spool identity requires reconciliation, never another submission", async () => {
  const f = await fixture(); try {
    await f.until("AUTHORIZING"); const state = (await f.journal.load())!; state.phase = "SUBMITTING"; state.pending = undefined; await f.journal.save(state);
    f.restart(); await f.ticks(3); assert.equal(f.counts().submissions, 0); assert.equal(f.job()!.printStatus, "RECONCILIATION_REQUIRED");
  } finally { await f.close(); }
});
test("restart after spool id is recorded observes the existing job only", async () => {
  const f = await fixture(); try { await f.until("SUBMITTED"); f.restart(); f.setStatus({ state: "completed" }); await f.until("IDLE"); assert.equal(f.counts().submissions, 1); assert.equal(await f.journal.load(), null); } finally { await f.close(); }
});
test("spool observation continues offline and completion is reported after reconnect", async () => {
  const f = await fixture(); try {
    await f.until("SUBMITTED"); f.setOffline(true); f.setStatus({ state: "completed", pages: 6 }); await assert.rejects(f.ticks(1));
    const saved = JSON.parse(await readFile(path.join(f.dir, "active.json"), "utf8")); assert.equal(saved.outcome.state, "completed");
    f.setOffline(false); await f.ticks(3); assert.equal(await f.journal.load(), null); assert.equal(f.counts().submissions, 1);
  } finally { await f.close(); }
});
test("unknown submission error is reconciled rather than marked failed or reprinted", async () => {
  const f = await fixture(); try { f.setSubmitFailure(); await f.until("RECONCILIATION"); await f.ticks(3); assert.equal(f.counts().submissions, 1); assert.equal(f.job()!.printStatus, "RECONCILIATION_REQUIRED"); } finally { await f.close(); }
});
test("printer unavailability waits and does not submit", async () => {
  const f = await fixture(); try { f.setAvailable(false); await f.until("CLAIMED"); await f.ticks(4); assert.equal(f.counts().submissions, 0); f.setAvailable(true); await f.until("SUBMITTED"); assert.equal(f.counts().submissions, 1); } finally { await f.close(); }
});
test("timeout is uncertain, but later spool completion can still reconcile", async () => {
  const f = await fixture(); try { await f.until("SUBMITTED"); await f.ticks(1); f.advance(2000); await f.until("RECONCILIATION"); await f.ticks(1); assert.equal(f.job()!.printStatus, "RECONCILIATION_REQUIRED"); f.setStatus({ state: "completed" }); await f.until("IDLE"); assert.equal(await f.journal.load(), null); assert.equal(f.counts().submissions, 1); } finally { await f.close(); }
});
test("confirmed spool failure is terminal and never resubmitted", async () => {
  const f = await fixture(); try { await f.until("SUBMITTED"); f.setStatus({ state: "failed" }); await f.ticks(4); assert.equal(f.job()!.printStatus, "FAILED"); assert.equal(f.counts().submissions, 1); } finally { await f.close(); }
});
test("download checksum changes cause safe redownload before authorization", async () => {
  const f = await fixture(); try { await f.until("DOWNLOADED"); const state = (await f.journal.load())!; await writeFile(f.journal.filePath(state.attemptId), "tampered"); await f.until("SUBMITTED"); assert.equal(f.counts().downloads, 2); assert.equal(f.counts().submissions, 1); } finally { await f.close(); }
});
test("shutdown after authorization but before OS invocation does not print", async () => {
  const f = await fixture(); try { await f.until("AUTHORIZING"); const event = f.cloud.event; f.cloud.event = async (...args) => { const ack = await event(...args); f.engine().stopping = true; return ack; }; await f.ticks(1); assert.equal(f.counts().submissions, 0); } finally { await f.close(); }
});
test("lost journal with remote active attempt is quarantined instead of adopted for printing", async () => {
  const f = await fixture(); try {
    const attemptId = randomUUID(); const remote = await f.cloud.claim(attemptId);
    f.cloud.recovery = async () => [{ id: remote!.id, attemptId, cupsJobId: null, printStatus: "PRINTING" }];
    await f.ticks(3); assert.equal(f.counts().submissions, 0); assert.equal(f.job()!.printStatus, "RECONCILIATION_REQUIRED");
  } finally { await f.close(); }
});
test("a live journal lock rejects a second agent and corrupt state fails closed", async () => {
  const f = await fixture(); try {
    await assert.rejects(new Journal(f.dir, "test-scope").lock(), /ALREADY_RUNNING/);
    await writeFile(path.join(f.dir, "active.json"), "corrupt"); await assert.rejects(f.ticks(1), /JOURNAL_INVALID/); assert.equal(f.counts().submissions, 0);
  } finally { await f.close(); }
});
test("failure to persist the submission barrier prevents the OS call", async () => {
  const f = await fixture(); try {
    await f.until("AUTHORIZING"); const save = f.journal.save.bind(f.journal);
    f.journal.save = async state => { if (state.phase === "SUBMITTING") throw new Error("disk failure"); await save(state); };
    await assert.rejects(f.ticks(1)); assert.equal(f.counts().submissions, 0);
    f.journal.save = save; f.restart(); await f.until("SUBMITTED"); assert.equal(f.counts().submissions, 1);
  } finally { await f.close(); }
});
test("lost spool-id persistence leaves SUBMITTING on disk and cannot trigger another print", async () => {
  const f = await fixture(); try {
    await f.until("AUTHORIZING"); const save = f.journal.save.bind(f.journal);
    f.journal.save = async state => { if (state.phase === "SUBMITTED") throw new Error("disk failure"); await save(state); };
    await assert.rejects(f.ticks(1)); assert.equal(f.counts().submissions, 1); assert.equal((await f.journal.load())!.phase, "SUBMITTING");
    f.journal.save = save; f.restart(); await f.until("RECONCILIATION"); await f.ticks(3); assert.equal(f.counts().submissions, 1);
  } finally { await f.close(); }
});
test("closing and reopening the journal recovers the persisted download across a new engine", async () => {
  const f = await fixture(); let reopened: Journal | undefined;
  try {
    await f.until("DOWNLOADED"); await f.journal.unlock(); reopened = new Journal(f.dir, "test-scope"); await reopened.lock();
    const engine = new Engine(f.cloud, f.device, reopened);
    for (let i = 0; i < 5 && f.counts().submissions === 0; i++) await engine.tick();
    assert.deepEqual(f.counts(), { submissions: 1, downloads: 1 });
  } finally { if (reopened) await reopened.unlock(); await f.close(); }
});
for(const status of [404,410,415]) test(`a permanently unavailable document (${status}) fails before printing without endless download retries`, async () => {
  const f = await fixture(); try {
    let downloads = 0; f.cloud.download = async () => { downloads++; throw new CloudError("HTTP_REJECTED", status); };
    await f.until("CLAIMED"); await f.until("IDLE");
    assert.equal(f.counts().submissions, 0); assert.equal(downloads, 1); assert.equal(f.job()!.printStatus, "FAILED");
  } finally { await f.close(); }
});

test("Windows capability preflight failure quarantines before authorization and printing", async () => {
  const f = await fixture();
  try {
    f.device.validateJob = async () => { throw new Error("WINDOWS_SETTINGS_UNSUPPORTED"); };
    await f.until("RECONCILIATION");
    assert.equal(f.counts().submissions, 0);
    assert.equal(f.events.some(e => e.operation === "authorize"), false);
  } finally { await f.close(); }
});

test("Windows adapter shares the durable barrier and only observes after restart", async () => {
  const { WindowsPrintDevice } = await import("../src/adapters/WindowsPrintDevice");
  const f = await fixture();
  try {
    const printer = {name:"Test",identifier:"a".repeat(64),isDefault:true,available:true,color:true,duplex:true,maxCopies:99,papers:[9]};
    let jobs: {id:number;document:string;status:number}[] = []; let calls=0;
    const device = new WindowsPrintDevice({name:printer.name,identifier:printer.identifier}, {async printers(){return [printer];},async jobs(){return jobs;}}, {file:"fake.exe",sha256:"test"},async()=>{
      calls++;const state=await f.journal.load();assert.equal(state?.phase,"SUBMITTING");
      assert.ok(f.events.some(e=>e.operation==="authorize"));jobs=[{id:12,document:`${state!.attemptId}.pdf`,status:8}];return "";
    },async()=>{});
    let engine = new Engine(f.cloud,device,f.journal);
    for(let i=0;i<12 && (await f.journal.load())?.phase!=="SUBMITTED";i++) await engine.tick();
    assert.equal((await f.journal.load())?.spoolId,"WIN-12");assert.equal(calls,1);
    engine=new Engine(f.cloud,device,f.journal);await engine.tick();await engine.tick();assert.equal(calls,1);
  } finally { await f.close(); }
});

test("Windows paper error is diagnosed without claiming zero output or resubmitting", async () => {
  const f=await fixture();
  try {
    await f.until("SUBMITTED");f.setStatus({state:"unknown",reconciliationCode:"SPOOL_PAPER_OUT"});
    await f.ticks(1);assert.equal((await f.journal.load())?.phase,"RECONCILIATION");
    assert.equal(f.events.at(-1)?.errorCode,"SPOOL_PAPER_OUT");assert.equal(f.counts().submissions,1);
  } finally { await f.close(); }
});

test("an uncertain submission's observed spool ID is durably reconciled, never resubmitted", async () => {
  const { PrintSubmissionUncertain }=await import("../src/PrintDevice");const f=await fixture();
  try {
    let calls=0;f.device.submitJob=async()=>{calls++;throw new PrintSubmissionUncertain("WIN-42");};
    await f.until("RECONCILIATION");assert.equal((await f.journal.load())?.spoolId,"WIN-42");
    f.restart();await f.ticks(3);assert.equal(calls,1);
  } finally {await f.close();}
});
