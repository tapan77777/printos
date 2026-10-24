import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity } from "@/lib/agentAuth";
export async function GET(req: NextRequest) {
  const agent = await getAgentIdentity(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.printJob.findMany({ where: { shopId:agent.shopId??null, claimedBy: agent.id, printer: { deviceId: agent.printerDeviceId }, attemptId: { not: null }, printStatus: { in: ["DOWNLOADING", "PRINTING", "RECONCILIATION_REQUIRED"] } }, take: 200, select: { id: true, attemptId: true, printStatus: true, submissionAuthorizedAt: true, cupsJobId: true, claimExpiresAt: true } });
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}
