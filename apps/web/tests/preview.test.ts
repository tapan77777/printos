import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), agent: vi.fn(), find: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/session", () => ({ getOwnerFromRequest: mocks.owner }));
vi.mock("@/lib/agentAuth", async (importOriginal) => ({ ...await importOriginal<typeof import("../lib/agentAuth")>(), getAgentIdentity: mocks.agent }));
vi.mock("@/lib/prisma", () => ({ prisma: { printJob: { findUnique: mocks.find } } }));
vi.mock("fs/promises", () => ({ readFile: mocks.read }));
import { GET } from "../app/api/jobs/[id]/file/route";
const attempt = "cba44b65-6c61-4cc3-a89a-8dd4e4181491";
const req = (preview = true) => new NextRequest(`http://localhost/api/jobs/test/file${preview ? "?preview=1" : ""}`, { headers: { "x-printos-attempt": attempt } });
beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue({ fileId: "test.pdf", printStatus: "DOWNLOADING", attemptId: attempt, claimedBy: "agent", simulation: false, claimExpiresAt: new Date(Date.now() + 60000), printer: { deviceId: "BOX" } }); mocks.read.mockResolvedValue(Buffer.from("%PDF-1.7")); });
describe("protected inline PDF", () => {
  it("denies anonymous access before looking up any document", async () => {
    expect((await GET(req(), { params: Promise.resolve({ id: "test" }) })).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("does not grant owner preview to an agent token", async () => {
    mocks.agent.mockReturnValue({ id: "agent", printerDeviceId: "BOX", mode: "cups" });
    expect((await GET(req(), { params: Promise.resolve({ id: "test" }) })).status).toBe(401);
  });
  it("serves owners inline with private no-store headers", async () => {
    mocks.owner.mockReturnValue({ role: "owner" });
    const res = await GET(req(), { params: Promise.resolve({ id: "test" }) });
    expect(res.status).toBe(200); expect(res.headers.get("content-disposition")).toContain("inline");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
  it("preserves default agent attachment downloads", async () => {
    mocks.agent.mockReturnValue({ id: "agent", printerDeviceId: "BOX", mode: "cups" });
    const res = await GET(req(false), { params: Promise.resolve({ id: "test" }) });
    expect(res.status).toBe(200); expect(res.headers.get("content-disposition")).toContain("attachment");
  });
  it("rejects paths outside storage", async () => {
    mocks.owner.mockReturnValue({ role: "owner" }); mocks.find.mockResolvedValue({ fileId: "../secret" });
    expect((await GET(req(), { params: Promise.resolve({ id: "test" }) })).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

it("does not serve retained completed documents to an agent", async () => {
  mocks.agent.mockReturnValue({ id: "agent", printerDeviceId: "BOX", mode: "cups" });
  mocks.find.mockResolvedValue({ fileId: "test.pdf", printStatus: "COMPLETED", attemptId: attempt, claimedBy: "agent", simulation: false, claimExpiresAt: new Date(Date.now() + 60000), printer: { deviceId: "BOX" } });
  expect((await GET(req(false), { params: Promise.resolve({ id: "test" }) })).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("an expired download lease is denied", async () => {
  mocks.agent.mockReturnValue({ id: "agent", printerDeviceId: "BOX", mode: "cups" });
  mocks.find.mockResolvedValue({ fileId: "test.pdf", printStatus: "DOWNLOADING", attemptId: attempt, claimedBy: "agent", simulation: false, claimExpiresAt: new Date(0), printer: { deviceId: "BOX" } });
  expect((await GET(req(false), { params: Promise.resolve({ id: "test" }) })).status).toBe(403);
});
