import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerFromRequest } from "@/lib/session";

// Owner-only summary of a job. Status-mutating transitions go through
// /approve, /reject (owner) and /status (agent). This GET is for the dashboard
// and for owner inspection, not for the customer.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getOwnerFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const job = await prisma.printJob.findUnique({
    where: { id: params.id },
    include: { printer: { select: { name: true, deviceId: true } } },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}
