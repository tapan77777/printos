import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agentAuth";
import { canTransition, AGENT_ALLOWED_TRANSITIONS } from "@/lib/jobState";
import type { PrintStatus } from "@prisma/client";

type Body = {
  printStatus: PrintStatus;
  cupsJobId?: string;
  agentError?: string;
  pagesPrinted?: number;
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!verifyAgentToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.printStatus) {
    return NextResponse.json({ error: "printStatus required" }, { status: 400 });
  }
  if (!AGENT_ALLOWED_TRANSITIONS.has(body.printStatus)) {
    return NextResponse.json({ error: "Agent cannot set this status" }, { status: 403 });
  }

  const job = await prisma.printJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canTransition(job.printStatus, body.printStatus)) {
    return NextResponse.json(
      { error: `Cannot transition ${job.printStatus} -> ${body.printStatus}` },
      { status: 409 },
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = { printStatus: body.printStatus };

  if (body.cupsJobId) data.cupsJobId = String(body.cupsJobId).slice(0, 128);
  if (typeof body.pagesPrinted === "number" && Number.isInteger(body.pagesPrinted)) {
    data.pagesPrinted = body.pagesPrinted;
  }
  if (body.agentError) data.agentError = String(body.agentError).slice(0, 500);

  if (body.printStatus === "PRINTING") data.startedAt = now;
  if (body.printStatus === "COMPLETED") data.completedAt = now;
  if (body.printStatus === "FAILED") data.failedAt = now;

  const updated = await prisma.printJob.update({ where: { id: job.id }, data });
  return NextResponse.json({ jobId: updated.id, printStatus: updated.printStatus });
}
