import {agentShop} from "@/lib/tenantAccess";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity } from "@/lib/agentAuth";

// Agent-authenticated inspection endpoint — returns APPROVED jobs for the
// given printer that are not currently claimed. Does NOT claim; use /claim.
export async function GET(req: NextRequest) {
  const agent = await getAgentIdentity(req);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const printerDeviceId = url.searchParams.get("printerDeviceId");
  if (printerDeviceId !== agent.printerDeviceId) return NextResponse.json({ error: "Scope mismatch" }, { status: 403 });
  if (!printerDeviceId) {
    return NextResponse.json({ error: "printerDeviceId required" }, { status: 400 });
  }

  if(agent.processingEnabled===false)return NextResponse.json({error:"Device is paired but printing activation is not released"},{status:403});
  const printer = await prisma.printer.findUnique({ where: { deviceId: printerDeviceId } });
  if (!printer || !agentShop(agent,printer)) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

  if (printer.simulationOnly !== (agent.mode === "mock")) return NextResponse.json({ error: "Adapter scope mismatch" }, { status: 403 });
  const jobs = await prisma.printJob.findMany({
    where: {
      shopId:agent.shopId??null, printerId: printer.id,
      printStatus: "APPROVED",
      attemptId: null,
      claimedAt: null,
    },
    orderBy: { approvedAt: "asc" },
    take: 200,
    select: {
      id: true,
      copies: true,
      colorMode: true,
      paperSize: true,
      duplex: true,
      pageRange: true,
    },
  });
  return NextResponse.json(jobs);
}
