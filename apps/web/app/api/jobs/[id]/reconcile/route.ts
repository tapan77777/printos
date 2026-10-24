import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/tenantAccess";
import { getOwnerFromRequest } from "@/lib/session";
import { UUID } from "@/lib/agentAuth";
// Explicit human resolution only. Never resets a submission latch or queues a reprint.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const {id}=await params;
  const owner = await getOwnerFromRequest(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if(owner.role!=="owner")return NextResponse.json({error:"Owner role required"},{status:403});
  const body = await req.json().catch(() => null);
  if (!body || !UUID.test(body.attemptId ?? "") || !["COMPLETED", "FAILED", "RECONCILIATION_REQUIRED"].includes(body.resolution) || typeof body.note !== "string" || !body.note.trim() || body.note.length > 500) return NextResponse.json({ error: "Attempt, resolution and inspection note required" }, { status: 400 });
  const now = new Date();
  if (body.resolution === "RECONCILIATION_REQUIRED") {
    const result = await prisma.printJob.updateMany({ where: { ...ownerScope(owner), id: id, attemptId: body.attemptId, printStatus: { in: ["DOWNLOADING", "PRINTING"] }, claimExpiresAt: { lt: now } }, data: { printStatus: "RECONCILIATION_REQUIRED", agentError: "An expired attempt requires inspection. Do not automatically reprint.", reconciliationNote: body.note.trim() } });
    if (result.count !== 1) return NextResponse.json({ error: "Attempt is still leased or already terminal" }, { status: 409 });
    return NextResponse.json({ jobId: id, printStatus: "RECONCILIATION_REQUIRED" });
  }
  const result = await prisma.printJob.updateMany({ where: { ...ownerScope(owner), id: id, attemptId: body.attemptId, printStatus: "RECONCILIATION_REQUIRED" }, data: { printStatus: body.resolution, reconciledAt: now, reconciliationNote: body.note.trim(), ...(body.resolution === "COMPLETED" ? { completedAt: now } : { failedAt: now }) } });
  if (result.count !== 1) return NextResponse.json({ error: "Job changed or is not awaiting reconciliation" }, { status: 409 });
  return NextResponse.json({ jobId: id, printStatus: body.resolution });
}
