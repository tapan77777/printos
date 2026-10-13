import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerFromRequest } from "@/lib/session";
import { canTransition } from "@/lib/jobState";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getOwnerFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = (body.reason ?? "").slice(0, 500) || null;

  const job = await prisma.printJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canTransition(job.printStatus, "REJECTED")) {
    return NextResponse.json({ error: `Cannot reject from ${job.printStatus}` }, { status: 409 });
  }

  const updated = await prisma.printJob.update({
    where: { id: job.id },
    data: { printStatus: "REJECTED", rejectedAt: new Date(), rejectionReason: reason },
  });

  return NextResponse.json({ jobId: updated.id, printStatus: updated.printStatus });
}
