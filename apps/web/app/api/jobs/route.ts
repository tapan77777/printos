import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { readUploadQuote, UploadError } from "@/lib/uploadQuote";
import { authoritativeQuote } from "@/lib/shopPricing";
import { StorageError } from "@/lib/privateStorage";
import { documents } from "@/lib/documentHttp";
export const maxDuration = 60;
const UPLOAD_DIR = path.join(process.cwd(), "tmp-uploads");
export async function POST(req: NextRequest) {
    let upload;
    try {
        upload = await readUploadQuote(req);
    }
    catch (err) {
        if (err instanceof UploadError || err instanceof StorageError)
            return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
    }
    const { bytes, printerId, options } = upload;
    const printer = await prisma.printer.findUnique({ where: { deviceId: printerId } });
    if (!printer)
        return NextResponse.json({ error: "Printer not found" }, { status: 404 });
    const jobId = randomUUID();
    const document = "document" in upload ? upload.document : null;
    const storedName = document ? `cloud:${document.id}` : `${jobId}.pdf`;
    if (!document) {
        await mkdir(UPLOAD_DIR, { recursive: true });
        await writeFile(path.join(UPLOAD_DIR, storedName), bytes);
    }
    const customerSessionId = randomUUID();
    let quote: any;
    let job;
    try {
        job = await prisma.$transaction(async (tx) => {
            quote = await authoritativeQuote(tx, printer, upload);
            if (printer.shopId && upload.submittedQuoteKey !== quote.quoteKey)
                throw new UploadError("Prices or options changed. Review a fresh quote before submitting.", 409);
            const created = await tx.printJob.create({
                data: {
                    shopId: printer.shopId,
                    id: jobId,
                    printerId: printer.id,
                    fileId: storedName,
                    customerSessionId,
                    copies: options.copies,
                    colorMode: options.colorMode,
                    pageRange: options.pageRange,
                    paperSize: options.paperSize,
                    duplex: options.duplex,
                    price: quote.price,
                    pageCount: quote.pageCount,
                    pricingSnapshot: quote.pricingSnapshot ?? undefined,
                    printStatus: "QUEUED",
                    paymentStatus: "NOT_REQUIRED",
                },
            });
            if (document)
                await documents().attach(tx, document, created.id);
            return created;
        });
    }
    catch (err) {
        if (!document)
            await unlink(path.join(UPLOAD_DIR, storedName)).catch(() => { });
        if (err instanceof UploadError || err instanceof StorageError)
            return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
    }
    return NextResponse.json({ jobId: job.id, customerSessionId, price: quote.price, quote }, { headers: { "Cache-Control": "private, no-store" } });
}
