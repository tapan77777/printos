import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readUploadQuote, UploadError } from "@/lib/uploadQuote";
import { authoritativeQuote } from "@/lib/shopPricing";
import { StorageError } from "@/lib/privateStorage";
export const maxDuration = 60;
// Additive, stateless quote: no file storage, job creation, or printer calls.
export async function POST(req: NextRequest) {
    try {
        const upload = await readUploadQuote(req);
        const { printerId } = upload;
        const printer = await prisma.printer.findUnique({ where: { deviceId: printerId } });
        if (!printer)
            return NextResponse.json({ error: "Printer not found" }, { status: 404 });
        const quote = await prisma.$transaction(tx => authoritativeQuote(tx, printer, upload));
        return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
    }
    catch (err) {
        if (err instanceof UploadError || err instanceof StorageError)
            return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
    }
}
