import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity, UUID } from "@/lib/agentAuth";
import { attemptToken, ownsAttempt } from "@/lib/attemptAccess";
import { canTransition } from "@/lib/jobState";
import type { PrintStatus } from "@prisma/client";

const errors: Record<string, string> = {
  SPOOL_OFFLINE: "Windows reports the printer offline. Inspect the queue and output before resolving this attempt.",
  SPOOL_PAPER_OUT: "Windows reports paper unavailable. Output may be partial; do not resubmit automatically.",
  SPOOL_CANCELLED: "Windows reports cancellation or deletion. Output may be partial; reconciliation required.",
  SPOOL_DRIVER_ERROR: "Windows reports a driver or printer error. Inspect the queue and output before resolving this attempt.",
  PRINT_CONFIGURATION_INVALID: "Printer settings or renderer integrity could not be verified. No submission was made.",
  DOWNLOAD_FAILED: "Document download failed before submission.",
  PRINTER_UNAVAILABLE: "Printer is unavailable. No new submission was made.",
  SUBMISSION_UNCERTAIN: "Print submission outcome is uncertain. Reconciliation required; do not reprint automatically.",
  COMPLETION_UNVERIFIED: "Printer completion is not verified. Reconciliation required.",
  SPOOL_FAILED: "The spooler reported cancellation or failure.",
  JOURNAL_LOST: "Local attempt journal is unavailable. Reconciliation required.",
};
const active: PrintStatus[] = ["DOWNLOADING", "PRINTING", "RECONCILIATION_REQUIRED"];
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const {id}=await params;
  const agent = await getAgentIdentity(req); const token = attemptToken(req);
  if (!agent || !token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !["authorize", "renew", "report"].includes(body.operation) || typeof body.eventId !== "string" || !UUID.test(body.eventId)
    || (body.errorCode !== undefined && !Object.hasOwn(errors, body.errorCode))
    || (body.pagesPrinted !== undefined && (!Number.isInteger(body.pagesPrinted) || body.pagesPrinted < 0 || body.pagesPrinted > 1000000))
    || (body.cupsJobId !== undefined && (typeof body.cupsJobId !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(body.cupsJobId)))) return NextResponse.json({ error: "Invalid attempt event" }, { status: 400 });
  if(agent.processingEnabled===false&&body.operation!=="report")return NextResponse.json({error:"Printing activation required"},{status:403});
  const job = await prisma.printJob.findUnique({ where: { id: id }, include: { printer: { select: { deviceId: true } } } });
  if (!job || !ownsAttempt(agent, token, job)) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  const hash = createHash("sha256").update(JSON.stringify([body.operation, body.printStatus ?? null, body.cupsJobId ?? null, body.errorCode ?? null, body.pagesPrinted ?? null])).digest("hex");
  const now = new Date();
  function response(status: PrintStatus, lease: Date | null) { return NextResponse.json({ jobId: job!.id, attemptId: token, eventId: body.eventId, printStatus: status, leaseExpiresAt: lease?.toISOString(), acknowledged: true }); }
  if (job.lastAgentEventId === body.eventId) {
    if (job.lastAgentEventHash !== hash || (body.operation === "renew" && !active.includes(job.printStatus)) || (body.operation === "authorize" && (!job.claimExpiresAt || job.claimExpiresAt <= now || job.printStatus !== "PRINTING"))) return NextResponse.json({ error: "Event conflict or authorization expired" }, { status: 409 });
    return response(job.printStatus, job.claimExpiresAt);
  }
  if (!active.includes(job.printStatus)) return NextResponse.json({ error: "Attempt is no longer active" }, { status: 409 });
  const data: Record<string, unknown> = { lastAgentEventId: body.eventId, lastAgentEventHash: hash };
  let next: PrintStatus = job.printStatus;
  let lease = job.claimExpiresAt;
  if (body.operation === "renew") {
    // Expired attempts are never reassigned. The original owner may renew to recover safely.
    lease = new Date(now.getTime() + 120000); data.claimExpiresAt = lease;
  } else if (body.operation === "authorize") {
    if (body.printStatus !== "PRINTING" || job.printStatus !== "DOWNLOADING" || job.submissionAuthorizedAt || !lease || lease <= now) return NextResponse.json({ error: "Submission authorization denied" }, { status: 409 });
    next = "PRINTING"; data.submissionAuthorizedAt = now; data.startedAt = now;
  } else {
    const allowed: PrintStatus[] = ["PRINTING", "COMPLETED", "FAILED", "RECONCILIATION_REQUIRED"];
    if (!allowed.includes(body.printStatus)) return NextResponse.json({ error: "Invalid agent status" }, { status: 403 });
    next = body.printStatus;
    const bindingSpool = next === "PRINTING" && job.printStatus === "PRINTING" && !!body.cupsJobId && (!job.cupsJobId || job.cupsJobId === body.cupsJobId);
    const repeatReconciliation = next === "RECONCILIATION_REQUIRED" && job.printStatus === next;
    if (!bindingSpool && !repeatReconciliation && !canTransition(job.printStatus, next)) return NextResponse.json({ error: "State conflict" }, { status: 409 });
    if (job.cupsJobId && body.cupsJobId && job.cupsJobId !== body.cupsJobId) return NextResponse.json({ error: "Spool identity cannot change" }, { status: 409 });
    if (body.cupsJobId && (agent.mode === "mock") !== body.cupsJobId.startsWith("SIM-")) return NextResponse.json({ error: "Adapter/spool mismatch" }, { status: 400 });
    if ((next === "PRINTING" || next === "COMPLETED") && !job.submissionAuthorizedAt) return NextResponse.json({ error: "No submission authorization" }, { status: 409 });
    if ((next === "COMPLETED" || (next === "FAILED" && job.submissionAuthorizedAt)) && !(body.cupsJobId || job.cupsJobId)) return NextResponse.json({ error: "Unknown submission must be reconciled" }, { status: 409 });
    if (body.cupsJobId) data.cupsJobId = body.cupsJobId;
    if (body.errorCode) data.agentError = errors[body.errorCode];
    if (next === "COMPLETED") { data.completedAt = now; data.agentError = null; }
    if (next === "FAILED") data.failedAt = now;
    if (next === "COMPLETED" && body.pagesPrinted !== undefined) data.pagesPrinted = body.pagesPrinted;
  }
  data.printStatus = next;
  const result = await prisma.printJob.updateMany({ where: {
    id: job.id, attemptId: token, claimedBy: agent.id, printStatus: job.printStatus,
    lastAgentEventId: job.lastAgentEventId,
    ...(body.operation === "authorize" ? { submissionAuthorizedAt: null, claimExpiresAt: { gt: now } } : {}),
  }, data });
  if (result.count !== 1) {
    // A timeout retry can overlap the original request. Return the same committed
    // acknowledgment when that exact event won the race; never apply it twice.
    const fresh = await prisma.printJob.findUnique({ where: { id: job.id } });
    if (fresh?.attemptId === token && fresh.claimedBy === agent.id && fresh.lastAgentEventId === body.eventId && fresh.lastAgentEventHash === hash
      && (body.operation !== "authorize" || (fresh.printStatus === "PRINTING" && fresh.claimExpiresAt && fresh.claimExpiresAt.getTime() > Date.now()))
      && (body.operation !== "renew" || active.includes(fresh.printStatus))) return response(fresh.printStatus, fresh.claimExpiresAt);
    return NextResponse.json({ error: "Attempt changed; reconcile before continuing" }, { status: 409 });
  }
  return response(next, lease);
}
