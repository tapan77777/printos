import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agentAuth";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!verifyAgentToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    printerDeviceId?: string;
    leaseMs?: number;
    max?: number;
  };

  const agentId = (body.agentId ?? "").slice(0, 128).trim();
  const printerDeviceId = (body.printerDeviceId ?? "").slice(0, 128).trim();
  const leaseMs = Math.min(Math.max(body.leaseMs ?? DEFAULT_LEASE_MS, 30_000), 60 * 60_000);
  const max = Math.min(Math.max(body.max ?? 1, 1), 10);

  if (!agentId || !printerDeviceId) {
    return NextResponse.json({ error: "agentId and printerDeviceId required" }, { status: 400 });
  }

  const printer = await prisma.printer.findUnique({ where: { deviceId: printerDeviceId } });
  if (!printer) return NextResponse.json({ error: "Printer not registered" }, { status: 404 });

  const now = new Date();
  const expires = new Date(Date.now() + leaseMs);

  // Atomic claim: only rows that are APPROVED and either unclaimed or whose
  // lease expired. Use updateMany with the current claim as a filter.
  //
  // Prisma lacks "RETURNING" with updateMany, so pick candidate IDs first and
  // then conditionally update each. The conditional WHERE guards against
  // another agent having claimed in the meantime.
  const candidates = await prisma.printJob.findMany({
    where: {
      printerId: printer.id,
      printStatus: "APPROVED",
      OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
    },
    orderBy: { approvedAt: "asc" },
    take: max,
    select: { id: true, claimExpiresAt: true },
  });

  const claimed: Array<{ id: string }> = [];
  for (const c of candidates) {
    const r = await prisma.printJob.updateMany({
      where: {
        id: c.id,
        printStatus: "APPROVED",
        OR: [{ claimedAt: null }, { claimExpiresAt: { lt: now } }],
      },
      data: {
        claimedAt: now,
        claimedBy: agentId,
        claimExpiresAt: expires,
      },
    });
    if (r.count === 1) claimed.push({ id: c.id });
  }

  if (claimed.length === 0) return NextResponse.json({ jobs: [] });

  const jobs = await prisma.printJob.findMany({
    where: { id: { in: claimed.map((c) => c.id) } },
    select: {
      id: true,
      copies: true,
      colorMode: true,
      paperSize: true,
      duplex: true,
      pageRange: true,
      printer: { select: { name: true, deviceId: true } },
    },
  });

  return NextResponse.json({ jobs, leaseExpiresAt: expires.toISOString() });
}
