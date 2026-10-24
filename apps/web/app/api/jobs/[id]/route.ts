import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope, sameShop } from "@/lib/tenantAccess";
import { getOwnerFromRequest } from "@/lib/session";

// Owner-only summary of a job. Status-mutating transitions go through
// /approve, /reject (owner) and /status (agent). This GET is for the dashboard
// and for owner inspection, not for the customer.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const {id}=await params;
  const owner = await getOwnerFromRequest(req);
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const job = await prisma.printJob.findUnique({
    where: { id: id, ...ownerScope(owner) },
    include: { printer: { select: { name: true, deviceId: true } } },
  });
  if (!job || !sameShop(owner,job)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job,{headers:{"Cache-Control":"private, no-store"}});
}
