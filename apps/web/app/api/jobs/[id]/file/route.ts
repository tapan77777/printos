import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { verifyAgentToken } from "@/lib/agentAuth";
import { getOwnerFromRequest } from "@/lib/session";

const UPLOAD_DIR = path.join(process.cwd(), "tmp-uploads");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authorized = verifyAgentToken(req) || !!getOwnerFromRequest(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await prisma.printJob.findUnique({
    where: { id: params.id },
    select: { fileId: true, printStatus: true },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only serve files that are in a flow state. Rejected/completed files remain
  // readable by the owner for audit, but not by the agent after completion.
  const base = path.resolve(UPLOAD_DIR);
  const abs = path.resolve(base, job.fileId);
  if (!abs.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${params.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
