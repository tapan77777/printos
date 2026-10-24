import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeEqual } from "crypto";

// Customer status endpoint. Requires the customerSessionId returned at upload
// so links are only valid for the uploader of this job.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const {id}=await params;
  const url = new URL(req.url);
  const session = url.searchParams.get("s") ?? "";
  if (!session) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const job = await prisma.printJob.findUnique({
    where: { id: id },
    select: {
      id: true,
      customerSessionId: true,
      printStatus: true,
      copies: true,
      colorMode: true,
      paperSize: true,
      duplex: true,
      pageRange: true,
      price: true,
      pageCount: true,
      rejectionReason: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      failedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const a = Buffer.from(job.customerSessionId);
  const b = Buffer.from(session);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { customerSessionId: _drop, ...safe } = job;
  return NextResponse.json(safe,{headers:{"Cache-Control":"private, no-store"}});
}
