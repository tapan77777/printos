import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerFromRequest } from "@/lib/session";
import { canTransition } from "@/lib/jobState";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getOwnerFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await prisma.printJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canTransition(job.printStatus, "APPROVED")) {
    return NextResponse.json({ error: `Cannot approve from ${job.printStatus}` }, { status: 409 });
  }

  const updated = await prisma.printJob.update({
    where: { id: job.id },
    data: { printStatus: "APPROVED", approvedAt: new Date() },
  });

  return NextResponse.json({ jobId: updated.id, printStatus: updated.printStatus });
}
