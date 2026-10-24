import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { timingSafeEqual } from "node:crypto";
import { cloudDocuments, localDocumentsAllowed, privateStorage } from "@/lib/privateStorage";
import { documentJson, documentError, documents } from "@/lib/documentHttp";
import { prisma } from "@/lib/prisma";
import { sameShop } from "@/lib/tenantAccess";
import { getAgentIdentity } from "@/lib/agentAuth";
import { attemptToken, ownsAttempt } from "@/lib/attemptAccess";
import { getOwnerFromRequest } from "@/lib/session";
const UPLOAD_DIR = path.join(process.cwd(), "tmp-uploads");
export async function GET(req: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await params;
    const preview = req.nextUrl.searchParams.get("preview") === "1";
    const owner = await getOwnerFromRequest(req);
    const agent = await getAgentIdentity(req);
    const customer = req.headers.get("x-printos-customer-session") ?? "";
    const authorized = preview ? !!owner : !!agent || !!owner || !!customer;
    if (!authorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const job = await prisma.printJob.findUnique({
        where: { id: id },
        select: { customerSessionId: true, shopId: true, fileId: true, printStatus: true, attemptId: true, claimedBy: true, simulation: true, claimExpiresAt: true, printer: { select: { deviceId: true } } },
    });
    if (!job || (owner && !sameShop(owner, job)))
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    const customerAccess = !preview && !!customer && typeof job.customerSessionId === 'string' && Buffer.byteLength(customer) === Buffer.byteLength(job.customerSessionId) && timingSafeEqual(Buffer.from(customer), Buffer.from(job.customerSessionId));
    if (!owner && !agent && !customerAccess)
        return documentJson({ error: 'Not found' }, 404);
    if (!owner && !customerAccess && (!agent || agent.processingEnabled === false || !ownsAttempt(agent, attemptToken(req), job) || job.printStatus !== "DOWNLOADING" || !job.claimExpiresAt || job.claimExpiresAt <= new Date())) {
        return NextResponse.json({ error: "Active download lease required" }, { status: 403 });
    }
    // Preview remains owner-only. Agent downloads require their current attempt.
    if (job.fileId.startsWith('cloud:')) {
        try {
            if (!cloudDocuments())
                return documentJson({ error: 'Private storage is not configured' }, 503);
            const d = await prisma.storedDocument.findFirst({ where: { id: job.fileId.slice(6), jobId: id, shopId: job.shopId ?? undefined } });
            if (!d || d.shopId !== job.shopId || d.status !== 'READY' || !d.sha256)
                return documentJson({ error: 'Document is no longer available' }, 410);
            const storage = privateStorage();
            if (d.storageNamespace !== storage.namespace)
                return documentJson({ error: "Document storage configuration changed" }, 503);
            await storage.check();
            const url = await storage.sign(d.objectKey, !preview);
            if (agent && !owner && !customerAccess && req.headers.get('x-printos-download') !== 'manifest-v1')
                return documentJson({ error: 'Agent requires private-download manifest support' }, 409);
            if (req.headers.get('x-printos-download') === 'manifest-v1') {
                return documentJson({ url, sha256: d.sha256, sizeBytes: d.expectedBytes, expiresAt: new Date(Date.now() + 60000).toISOString() });
            }
            return new NextResponse(null, { status: 307, headers: { Location: url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
        }
        catch (e) {
            return documentError(e);
        }
    }
    // Never fall back to ephemeral Vercel files. Existing local PDFs remain
    // readable on the original local installation; no historical files move.
    if (!localDocumentsAllowed())
        return documentJson({ error: 'Legacy PDF remains on its original local installation' }, 410);
    const base = path.resolve(UPLOAD_DIR);
    const abs = path.resolve(base, job.fileId);
    if (!abs.startsWith(base + path.sep)) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    let bytes: Buffer;
    try {
        bytes = await readFile(abs);
    }
    catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return new NextResponse(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${id}.pdf"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; frame-ancestors 'self'",
        },
    });
}
export async function DELETE(req: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const owner = await getOwnerFromRequest(req);
    if (!owner?.shopId)
        return documentJson({ error: 'Shop membership required' }, 401);
    if (owner.role !== 'owner')
        return documentJson({ error: 'Owner role required' }, 403);
    try {
        const result = await documents().markDelete((await params).id, owner.shopId);
        return documentJson(result, result.deleted ? 200 : 202);
    }
    catch (e) {
        return documentError(e);
    }
}
