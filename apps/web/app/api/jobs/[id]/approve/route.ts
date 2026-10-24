import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope, sameShop } from "@/lib/tenantAccess";
import { getOwnerFromRequest } from "@/lib/session";
import { canTransition } from "@/lib/jobState";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const {id}=await params;
  const owner = await getOwnerFromRequest(req);
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await prisma.printJob.findUnique({ where: { id: id, ...ownerScope(owner) } });
  if (!job || !sameShop(owner,job)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canTransition(job.printStatus, "APPROVED")) {
    return NextResponse.json({ error: `Cannot approve from ${job.printStatus}` }, { status: 409 });
  }

  const updated = await prisma.printJob.updateMany({
    where: { ...ownerScope(owner), id: job.id, printStatus: "QUEUED" },
    data: { printStatus: "APPROVED", approvedAt: new Date() },
  });

  if (updated.count !== 1) return NextResponse.json({ error: "Job changed; refresh before continuing" }, { status: 409 });
  return NextResponse.json({ jobId: job.id, printStatus: "APPROVED" });
}
