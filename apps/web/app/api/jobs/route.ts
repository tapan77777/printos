import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseOptions, isPdfBuffer, MAX_UPLOAD_BYTES } from "@/lib/validate";
import { computePricePaise } from "@/lib/pricing";

const UPLOAD_DIR = path.join(process.cwd(), "tmp-uploads");

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 0 && contentLength > MAX_UPLOAD_BYTES * 1.1) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  const printerId = String(form.get("printerId") ?? "").trim();
  if (!(file instanceof File) || !printerId) {
    return NextResponse.json({ error: "Missing file or printerId" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_UPLOAD_BYTES} bytes` }, { status: 413 });
  }

  const opts = parseOptions(form);
  if (!opts.ok) return NextResponse.json({ error: opts.error }, { status: 400 });

  const printer = await prisma.printer.findUnique({ where: { deviceId: printerId } });
  if (!printer) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isPdfBuffer(bytes)) {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 415 });
  }

  const jobId = randomUUID();
  const storedName = `${jobId}.pdf`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storedName), bytes);

  const customerSessionId = randomUUID();
  const price = computePricePaise(opts.value, null);

  const job = await prisma.printJob.create({
    data: {
      id: jobId,
      printerId: printer.id,
      fileId: storedName,
      customerSessionId,
      copies: opts.value.copies,
      colorMode: opts.value.colorMode,
      pageRange: opts.value.pageRange,
      paperSize: opts.value.paperSize,
      duplex: opts.value.duplex,
      price,
      printStatus: "QUEUED",
      paymentStatus: "NOT_REQUIRED",
    },
  });

  return NextResponse.json({ jobId: job.id, customerSessionId, price });
}
