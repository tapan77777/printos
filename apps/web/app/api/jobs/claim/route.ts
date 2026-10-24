import {agentShop} from "@/lib/tenantAccess";
import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity, UUID } from "@/lib/agentAuth";

const select = { shopId:true, id: true, copies: true, colorMode: true, paperSize: true, duplex: true, pageRange: true, attemptId: true, printStatus: true, cupsJobId: true, submissionAuthorizedAt: true, claimExpiresAt: true, simulation: true, printer: { select: { name: true, deviceId: true } } } as const;
export async function POST(req: NextRequest) {
  const agent = await getAgentIdentity(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || (body.attemptId !== undefined && (typeof body.attemptId !== "string" || !UUID.test(body.attemptId))) || (body.leaseMs !== undefined && (!Number.isInteger(body.leaseMs) || body.leaseMs < 30000 || body.leaseMs > 300000))) return NextResponse.json({ error: "Invalid claim request" }, { status: 400 });
  if ((body.agentId && body.agentId !== agent.id) || (body.printerDeviceId && body.printerDeviceId !== agent.printerDeviceId)) return NextResponse.json({ error: "Agent scope mismatch" }, { status: 403 });
  if(agent.processingEnabled===false)return NextResponse.json({error:"Device is paired but printing activation is not released"},{status:403});
  const printer = await prisma.printer.findUnique({ where: { deviceId: agent.printerDeviceId } });
  if (!printer || !agentShop(agent,printer) || printer.simulationOnly !== (agent.mode === "mock")) return NextResponse.json({ error: "Printer not available for this adapter" }, { status: 403 });
  // Stable client attemptId makes a lost claim response recoverable. Exactly one job per request.
  const attemptId = body.attemptId ?? randomUUID();
  const previous = await prisma.printJob.findUnique({ where: { attemptId }, select: { ...select, claimedBy: true, printerId: true } });
  if (previous) {
    if (!agentShop(agent,previous) || previous.claimedBy !== agent.id || previous.printerId !== printer.id) return NextResponse.json({ error: "Attempt unavailable" }, { status: 409 });
    return NextResponse.json({ jobs: [previous], leaseExpiresAt: previous.claimExpiresAt?.toISOString() });
  }
  // Never automatically reclaim an existing attempt, even after expiry. Legacy claims are held too.
  const candidate = await prisma.printJob.findFirst({ where: { shopId:agent.shopId??null, printerId: printer.id, printStatus: "APPROVED", attemptId: null, claimedAt: null }, orderBy: { approvedAt: "asc" }, select: { id: true } });
  if (!candidate) return NextResponse.json({ jobs: [] });
  const now = new Date(); const expires = new Date(now.getTime() + (body.leaseMs ?? 120000));
  const result = await prisma.printJob.updateMany({ where: { shopId:agent.shopId??null, id: candidate.id, printStatus: "APPROVED", attemptId: null, claimedAt: null }, data: { attemptId, claimedAt: now, claimedBy: agent.id, claimExpiresAt: expires, printStatus: "DOWNLOADING", simulation: agent.mode === "mock" } });
  if (result.count !== 1) return NextResponse.json({ jobs: [] });
  const job = await prisma.printJob.findUnique({ where: { attemptId }, select });
  return NextResponse.json({ jobs: job ? [job] : [], leaseExpiresAt: expires.toISOString() });
}
