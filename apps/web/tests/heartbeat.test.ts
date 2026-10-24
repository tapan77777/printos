import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), printer: vi.fn(), upsert: vi.fn(), update: vi.fn(), transaction: vi.fn(), owner: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/agentAuth", () => ({ getAgentIdentity: mocks.identity }));
vi.mock("@/lib/session", () => ({ getOwnerFromRequest: mocks.owner }));
vi.mock("@/lib/prisma", () => ({ prisma: { printer: { findUnique: mocks.printer, update: mocks.update }, agentHealth: { upsert: mocks.upsert, findMany: mocks.health }, $transaction: mocks.transaction } }));
import { POST } from "../app/api/agent/heartbeat/route";
import { GET } from "../app/api/agent/health/route";
const request = (overrides = {}) => new NextRequest("http://localhost/api/agent/heartbeat", { method: "POST", body: JSON.stringify({ version: "0.2.0", operatingSystem: "win32", processingState: "SUBMITTED", printerAvailable: true, ...overrides }) });
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockReturnValue({ id: "test", printerDeviceId: "BOX", mode: "cups" }); mocks.printer.mockResolvedValue({ id: "p", simulationOnly: false }); });
describe("agent heartbeat and diagnostics", () => {
  it("requires scoped agent credentials before writing health", async () => { mocks.identity.mockReturnValue(null); expect((await POST(request())).status).toBe(401); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("records version, OS, printer availability and current processing state using server time", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ agentId: "test", operatingSystem: "win32", version: "0.2.0", processingState: "SUBMITTED", printerAvailable: true });
    expect(mocks.upsert.mock.calls[0][0].create.lastHeartbeat).toBeInstanceOf(Date);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
  it("rejects unexpected payloads instead of persisting arbitrary diagnostics", async () => { expect((await POST(request({ processingState: "/private/file.pdf" }))).status).toBe(400); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("health inspection requires owner authentication", async () => { expect((await GET(new NextRequest("http://localhost/api/agent/health"))).status).toBe(401); });
  it("stale agents are offline with unknown printer availability", async () => {
    mocks.owner.mockReturnValue({ role: "owner" }); mocks.health.mockResolvedValue([{ agentId: "test", lastHeartbeat: new Date(0), printerAvailable: true }]);
    const response = await GET(new NextRequest("http://localhost/api/agent/health"));
    expect((await response.json())[0]).toMatchObject({ online: false, printerAvailable: null });
  });
});
