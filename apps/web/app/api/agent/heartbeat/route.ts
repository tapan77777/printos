import {agentShop} from "@/lib/tenantAccess";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity } from "@/lib/agentAuth";
export async function POST(req: NextRequest) {
  const agent = await getAgentIdentity(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const states = ["IDLE", "CLAIMING", "CLAIMED", "DOWNLOADED", "AUTHORIZING", "SUBMITTING", "SUBMITTED", "RECONCILIATION", "REPORTING", "STOPPING"];
  if (!body || typeof body.version !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(body.version) || !["win32", "darwin", "linux"].includes(body.operatingSystem) || !states.includes(body.processingState) || (body.printerAvailable !== null && typeof body.printerAvailable !== "boolean")) return NextResponse.json({ error: "Invalid health report" }, { status: 400 });
  const printer = await prisma.printer.findUnique({ where: { deviceId: agent.printerDeviceId } });
  if (!printer || !agentShop(agent,printer) || printer.simulationOnly !== (agent.mode === "mock")) return NextResponse.json({ error: "Printer scope unavailable" }, { status: 403 });
  const now = new Date(); const data = { printerId: printer.id, version: body.version, operatingSystem: body.operatingSystem, mode: agent.mode, processingState: body.processingState, printerAvailable: body.printerAvailable, lastHeartbeat: now };
  await prisma.$transaction([
    prisma.agentHealth.upsert({ where: { agentId: agent.id }, create: { agentId: agent.id, ...data }, update: data }),
    prisma.printer.update({ where: { id: printer.id }, data: { lastHeartbeat: now, status: body.printerAvailable === true ? "ONLINE" : "OFFLINE" } }),
  ]);
  return NextResponse.json({ acknowledged: true, serverTime: now.toISOString() });
}
