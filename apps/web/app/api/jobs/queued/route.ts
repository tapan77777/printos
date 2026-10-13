import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agentAuth";

// Agent-authenticated inspection endpoint — returns APPROVED jobs for the
// given printer that are not currently claimed. Does NOT claim; use /claim.
export async function GET(req: NextRequest) {
  if (!verifyAgentToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const printerDeviceId = url.searchParams.get("printerDeviceId");
  if (!printerDeviceId) {
    return NextResponse.json({ error: "printerDeviceId required" }, { status: 400 });
  }

  const printer = await prisma.printer.findUnique({ where: { deviceId: printerDeviceId } });
  if (!printer) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

  const now = new Date();
  const jobs = await prisma.printJob.findMany({
    where: {
      printerId: printer.id,
      printStatus: "APPROVED",
      OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
    },
    orderBy: { approvedAt: "asc" },
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
