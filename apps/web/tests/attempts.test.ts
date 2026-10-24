import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ rows: [] as any[], printer: { shopId:null as string|null, id: "printer", deviceId: "BOX", simulationOnly: false }, writes: 0 }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  printer: { findUnique: vi.fn(async () => ({ ...db.printer })) },
  printJob: {
    findUnique: vi.fn(async ({ where }: any) => { const row = db.rows.find(r => where.id ? r.id === where.id : r.attemptId === where.attemptId); return row ? structuredClone({ ...row, printer: db.printer }) : null; }),
    findFirst: vi.fn(async () => { const row = db.rows.find(r => r.printStatus === "APPROVED" && r.claimedAt === null && r.attemptId === null); return row ? { id: row.id } : null; }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = db.rows.find(r => r.id === where.id);
      if (!row) return { count: 0 };
      for (const [key, value] of Object.entries(where) as [string, any][]) {
        if (value && typeof value === "object" && "in" in value) { if (!(value.in as string[]).includes(row[key])) return { count: 0 }; }
        else if (value && typeof value === "object" && "lt" in value) { if (!(row[key] < value.lt)) return { count: 0 }; }
        else if (value && typeof value === "object" && "gt" in value) { if (!(row[key] > value.gt)) return { count: 0 }; }
        else if (row[key] !== value) return { count: 0 };
      }
      Object.assign(row, data); db.writes++; return { count: 1 };
    }),
  },
} }));
vi.mock("@/lib/session", () => ({ getOwnerFromRequest: () => ({ role: "owner" }) }));
import { POST as claim } from "../app/api/jobs/claim/route";
import { POST as status } from "../app/api/jobs/[id]/status/route";
import { POST as approve } from "../app/api/jobs/[id]/approve/route";
import { POST as reject } from "../app/api/jobs/[id]/reject/route";
import { POST as reconcile } from "../app/api/jobs/[id]/reconcile/route";
import { getAgentIdentity } from "../lib/agentAuth";
import { effectiveHealth } from "../lib/agentHealth";
const token = "synthetic-test-token";
function req(body: any, identity = "agent-one", attemptId?: string) {
  return new NextRequest("http://localhost/api/jobs", { method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${token}`, "x-printos-agent": identity, ...(attemptId ? { "x-printos-attempt": attemptId } : {}) }, body: JSON.stringify(body) });
}
function row(state = "APPROVED") { return { shopId:null, id: "job", printerId: "printer", attemptId: null, claimedAt: null, claimedBy: null, claimExpiresAt: null, lastAgentEventId: null, lastAgentEventHash: null, submissionAuthorizedAt: null, cupsJobId: null, printStatus: state, copies: 1, colorMode: "BW", paperSize: "A4", duplex: false, pageRange: "all", simulation: false }; }
async function claimed() { const attempt = randomUUID(); expect((await claim(req({ attemptId: attempt }))).status).toBe(200); return attempt; }
async function event(attemptId: string, body: any, agent = "agent-one") { return status(req({ eventId: randomUUID(), ...body }, agent, attemptId), { params: Promise.resolve({ id: "job" }) }); }
beforeEach(() => {
  vi.stubEnv("AGENT_CREDENTIALS_JSON", JSON.stringify(["agent-one", "agent-two"].map(id => ({ id, printerDeviceId: "BOX", mode: "cups", tokenSha256: createHash("sha256").update(token).digest("hex") }))));
  db.rows = [row()]; db.writes = 0; db.printer.simulationOnly = false; db.printer.shopId=null;
});
afterEach(() => vi.unstubAllEnvs());
describe("atomic, scoped attempts (in-memory CAS route harness)", () => {
  it("concurrent claims have one winner and cannot expire into a duplicate claim", async () => {
    const responses = await Promise.all([claim(req({ attemptId: randomUUID() })), claim(req({ attemptId: randomUUID() }, "agent-two"))]);
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results.reduce((sum, r) => sum + r.jobs.length, 0)).toBe(1);
    expect(db.rows[0].printStatus).toBe("DOWNLOADING"); db.rows[0].claimExpiresAt = new Date(0);
    expect((await (await claim(req({ attemptId: randomUUID() }))).json()).jobs).toEqual([]);
  });
  it("replaying a claim returns the original attempt without creating another", async () => {
    const attempt = await claimed(); const before = db.writes;
    expect((await (await claim(req({ attemptId: attempt }))).json()).jobs[0].attemptId).toBe(attempt);
    expect(db.writes).toBe(before);
  });
  it("legacy claimed records are never automatically reprinted", async () => {
    db.rows[0].claimedAt = new Date(0); expect((await (await claim(req({}))).json()).jobs).toEqual([]);
  });
  it("rejects wrong token, caller-selected printer and caller-selected agent", async () => {
    const request = req({}); request.headers.set("authorization", "Bearer wrong"); expect((await claim(request)).status).toBe(401);
    expect((await claim(req({ printerDeviceId: "OTHER" }))).status).toBe(403);
    expect((await claim(req({ agentId: "agent-two" }))).status).toBe(403);
  });
  it("rejects cross-agent, missing and wrong attempt credentials", async () => {
    const attempt = await claimed();
    expect((await event(attempt, { operation: "authorize", printStatus: "PRINTING" }, "agent-two")).status).toBe(404);
    expect((await status(req({ operation: "renew", eventId: randomUUID() }), { params: Promise.resolve({ id: "job" }) })).status).toBe(401);
    expect((await event(randomUUID(), { operation: "renew" })).status).toBe(404);
  });
  it("submission gate requires a current lease and cannot be entered twice", async () => {
    const attempt = await claimed(); db.rows[0].claimExpiresAt = new Date(0);
    expect((await event(attempt, { operation: "authorize", printStatus: "PRINTING" })).status).toBe(409);
    expect((await event(attempt, { operation: "renew" })).status).toBe(200);
    expect((await event(attempt, { operation: "authorize", printStatus: "PRINTING" })).status).toBe(200);
    expect((await event(attempt, { operation: "authorize", printStatus: "PRINTING" })).status).toBe(409);
  });
  it("lost acknowledgements replay idempotently; altered payloads cannot reuse the event", async () => {
    const attempt = await claimed(); const body = { eventId: randomUUID(), operation: "authorize", printStatus: "PRINTING" };
    expect((await event(attempt, body)).status).toBe(200); const before = db.writes;
    expect((await event(attempt, body)).status).toBe(200); expect(db.writes).toBe(before);
    expect((await event(attempt, { ...body, cupsJobId: "test-1" })).status).toBe(409);
  });
  it("overlapping retries of the identical authorization get the same acknowledgement", async () => {
    const attempt = await claimed(); const body = { eventId: randomUUID(), operation: "authorize", printStatus: "PRINTING" };
    const writes = db.writes;
    const responses = await Promise.all([event(attempt, body), event(attempt, body)]);
    expect(responses.map(r => r.status)).toEqual([200,200]); expect(db.writes).toBe(writes + 1);
  });
  it("concurrent owner approval/rejection cannot overwrite each other", async () => {
    db.rows = [row("QUEUED")]; const responses = await Promise.all([approve(req({}), { params: Promise.resolve({ id: "job" }) }), reject(req({ reason: "no" }), { params: Promise.resolve({ id: "job" }) })]);
    expect(responses.map(r => r.status).sort()).toEqual([200,409]); expect(db.writes).toBe(1);
  });
  it("concurrent authorize/renew use compare-and-swap rather than last-writer-wins", async () => {
    const attempt = await claimed(); const results = await Promise.all([event(attempt, { operation: "authorize", printStatus: "PRINTING" }), event(attempt, { operation: "renew" })]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
  });
  it("unknown physical outcome requires reconciliation; spool identity cannot change", async () => {
    const attempt = await claimed(); await event(attempt, { operation: "authorize", printStatus: "PRINTING" });
    expect((await event(attempt, { operation: "report", printStatus: "FAILED" })).status).toBe(409);
    expect((await event(attempt, { operation: "report", printStatus: "PRINTING", cupsJobId: "test-1" })).status).toBe(200);
    expect((await event(attempt, { operation: "report", printStatus: "PRINTING", cupsJobId: "test-1" })).status).toBe(200);
    expect((await event(attempt, { operation: "report", printStatus: "COMPLETED", cupsJobId: "other-1" })).status).toBe(409);
    expect((await event(attempt, { operation: "report", printStatus: "RECONCILIATION_REQUIRED", errorCode: "COMPLETION_UNVERIFIED" })).status).toBe(200);
    expect((await event(attempt, { operation: "report", printStatus: "COMPLETED", cupsJobId: "test-1", pagesPrinted: 3 })).status).toBe(200);
  });
  it("rejects unsanitized error text and negative page counters", async () => {
    const attempt = await claimed();
    expect((await event(attempt, { operation: "report", printStatus: "FAILED", errorCode: "/private/file.pdf token=secret" })).status).toBe(400);
    expect((await event(attempt, { operation: "report", printStatus: "COMPLETED", pagesPrinted: -1 })).status).toBe(400);
  });
  it("mock credentials cannot claim a physical printer", async () => {
    vi.stubEnv("AGENT_CREDENTIALS_JSON", JSON.stringify([{ id: "agent-one", printerDeviceId: "BOX", mode: "mock", tokenSha256: createHash("sha256").update(token).digest("hex") }]));
    expect((await claim(req({ attemptId: randomUUID() }))).status).toBe(403);
    db.printer.simulationOnly = true; expect((await claim(req({ attemptId: randomUUID() }))).status).toBe(200); expect(db.rows[0].simulation).toBe(true);
  });
  it("owners may quarantine an expired attempt but cannot quarantine a live lease", async () => {
    const attempt = await claimed();
    const request = () => req({ attemptId: attempt, resolution: "RECONCILIATION_REQUIRED", note: "Agent computer is offline; inspection required" });
    expect((await reconcile(request(), { params: Promise.resolve({ id: "job" }) })).status).toBe(409);
    db.rows[0].claimExpiresAt = new Date(0);
    expect((await reconcile(request(), { params: Promise.resolve({ id: "job" }) })).status).toBe(200);
    expect(db.rows[0].printStatus).toBe("RECONCILIATION_REQUIRED");
  });
  it("owner inspection resolution never resets authorization or queues a reprint", async () => {
    const attempt = await claimed(); await event(attempt, { operation: "authorize", printStatus: "PRINTING" });
    await event(attempt, { operation: "report", printStatus: "RECONCILIATION_REQUIRED", errorCode: "SUBMISSION_UNCERTAIN" });
    const authorized = db.rows[0].submissionAuthorizedAt;
    expect((await reconcile(req({ attemptId: attempt, resolution: "COMPLETED", note: "Inspected output at counter" }), { params: Promise.resolve({ id: "job" }) })).status).toBe(200);
    expect(db.rows[0].submissionAuthorizedAt).toBe(authorized); expect(db.rows[0].printStatus).toBe("COMPLETED");
  });
});
describe("identity and fresh health", () => {
  it("unscoped legacy secrets and duplicate configured identities fail closed", async () => {
    vi.stubEnv("AGENT_CREDENTIALS_JSON", "[]"); vi.stubEnv("AGENT_ID", ""); vi.stubEnv("AGENT_TOKEN", token);
    expect(await getAgentIdentity(req({}))).toBeNull();
    const entry = { id: "agent-one", printerDeviceId: "BOX", mode: "cups", tokenSha256: createHash("sha256").update(token).digest("hex") };
    vi.stubEnv("AGENT_CREDENTIALS_JSON", JSON.stringify([entry,entry])); expect(await getAgentIdentity(req({}))).toBeNull();
  });
  it("stale or future heartbeats never imply printer availability", () => {
    const now = Date.now(); expect(effectiveHealth(new Date(now - 46000), true, now)).toEqual({ online: false, printerAvailable: null });
    expect(effectiveHealth(new Date(now + 1), true, now).online).toBe(false);
    expect(effectiveHealth(new Date(now), false, now)).toEqual({ online: true, printerAvailable: false });
  });
});

describe("Windows adapter protocol", () => {
  function windows() {
    vi.stubEnv("AGENT_CREDENTIALS_JSON", JSON.stringify([{ id:"agent-one",printerDeviceId:"BOX",mode:"windows",tokenSha256:createHash("sha256").update(token).digest("hex") }]));
  }
  it("allows scoped Windows claims and fences acknowledged spool binding", async () => {
    windows(); const attempt=await claimed();
    expect((await event(attempt,{operation:"authorize",printStatus:"PRINTING"})).status).toBe(200);
    expect((await event(attempt,{operation:"report",printStatus:"PRINTING",cupsJobId:"WIN-42"})).status).toBe(200);
    expect((await event(attempt,{operation:"report",printStatus:"PRINTING",cupsJobId:"WIN-43"})).status).toBe(409);
  });
  it("does not allow Windows credentials to claim simulation printers or select another device", async () => {
    windows();db.printer.simulationOnly=true;
    expect((await claim(req({attemptId:randomUUID()}))).status).toBe(403);
    db.printer.simulationOnly=false;
    expect((await claim(req({attemptId:randomUUID(),printerDeviceId:"OTHER"}))).status).toBe(403);
  });
  it("accepts sanitized preflight diagnostics without authorizing submission", async () => {
    windows();const attempt=await claimed();
    expect((await event(attempt,{operation:"report",printStatus:"RECONCILIATION_REQUIRED",errorCode:"PRINT_CONFIGURATION_INVALID"})).status).toBe(200);
    expect(db.rows[0].submissionAuthorizedAt).toBeNull();
  });
});

it("legacy agent credentials cannot claim an assigned tenant printer",async()=>{
 db.printer.shopId="tenant-shop";expect((await claim(req({attemptId:randomUUID()}))).status).toBe(403);expect(db.writes).toBe(0);
});
