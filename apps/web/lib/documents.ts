import { assertOrderingEnabled } from './ordering';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient, Prisma, StoredDocument, PrintStatus } from '@prisma/client';
import { countPdfPages } from './pdf';
import { MAX_UPLOAD_BYTES, parseOptions } from './validate';
import { createQuote } from './pricing';
import { UploadError } from './uploadQuote';
import type { PrivateStorage } from './privateStorage';
export const documentHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const terminalDocuments: PrintStatus[] = ['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'EXPIRED'];
export function retentionCandidates(now: Date): Prisma.StoredDocumentWhereInput { return { status: { not: 'DELETED' }, OR: [{ quarantineDeletedAt: null, uploadGrantExpiresAt: { lte: now } }, { status: 'DELETING', uploadGrantExpiresAt: { lte: now } }, { jobId: null, uploadGrantExpiresAt: { lte: now } }, { status:'READY',job: { printStatus: { in: terminalDocuments } }, OR: [{ retentionUntil: null }, { retentionUntil: { lte: now } }] }] }; }
export function validDocumentToken(token: string, hash: string) { const candidate = documentHash(token); return /^pdu_[A-Za-z0-9_-]{43}$/.test(token) && timingSafeEqual(Buffer.from(candidate), Buffer.from(hash)); }
export function documentService(db: PrismaClient, storage: PrivateStorage, now = () => new Date()) {
    async function scoped(id: string, token: string) { const d = await db.storedDocument.findUnique({ where: { id } }); if (!d || !validDocumentToken(token, d.tokenHash))
        throw new UploadError('Document not found', 404); if (d.storageNamespace !== storage.namespace)
        throw new UploadError("Document storage configuration changed", 503); if (d.expiresAt <= now() || d.jobId || ['DELETING', 'DELETED'].includes(d.status))
        throw new UploadError('Document upload expired or already submitted', 410); await assertOrderingEnabled(db,d.shopId); return d; }
    async function purge(d: StoredDocument) {
        if (d.storageNamespace !== storage.namespace)
            throw new UploadError("Document storage configuration changed", 503);
        await storage.check();
        await storage.remove([d.objectKey]);
        // Upload grants outlive app finalization tokens. Do not remove the quarantine
        // slot until the provider grant has expired, avoiding resurrection by replay.
        if (d.uploadGrantExpiresAt > now())
            return false;
        await storage.remove([d.uploadKey]);
        await db.storedDocument.updateMany({ where: { id: d.id, status: 'DELETING' }, data: { status: 'DELETED', deletedAt: now(), quarantineDeletedAt: now() } });
        return true;
    }
    return {
        async begin(printerDeviceId: string, expectedBytes: number) {
            if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_UPLOAD_BYTES)
                throw new UploadError('PDF exceeds the upload size limit', 413);
            const printer = await db.printer.findUnique({ where: { deviceId: printerDeviceId } });
            if (!printer?.shopId)
                throw new UploadError('A configured shop printer is required', 404);
            await assertOrderingEnabled(db,printer.shopId);
            await storage.check();
            const id = randomUUID(), token = 'pdu_' + randomBytes(32).toString('base64url'), prefix = documentHash(printer.shopId), date = now();
            const document = await db.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "Shop" WHERE id=${printer.shopId} FOR UPDATE`;
                await assertOrderingEnabled(tx,printer.shopId);
                await tx.$queryRaw `SELECT id FROM "Printer" WHERE id=${printer.id} FOR UPDATE`;
                const pending = await tx.storedDocument.count({ where: { printerId: printer.id, jobId: null, createdAt: { gt: new Date(date.getTime() - 3 * 3600000) }, status: { not: 'DELETED' } } });
                if (pending >= 100)
                    throw new UploadError('This printer has too many pending uploads', 429);
                return tx.storedDocument.create({ data: { id, shopId: printer.shopId!, printerId: printer.id, tokenHash: documentHash(token), storageNamespace: storage.namespace, expectedBytes, uploadKey: `uploads/${prefix}/${id}.pdf`, objectKey: `objects/${prefix}/${id}.pdf`, expiresAt: new Date(date.getTime() + 30 * 60000), uploadGrantExpiresAt: new Date(date.getTime() + 125 * 60000) } });
            });
            const uploadUrl = await storage.uploadGrant(document.uploadKey);
            return { documentId: id, documentToken: token, uploadUrl, expiresAt: document.expiresAt.toISOString(), maxBytes: MAX_UPLOAD_BYTES };
        },
        async finalize(id: string, token: string) {
            const d = await scoped(id, token);
            if (d.status === 'READY')
                return { documentId: d.id, pageCount: d.pageCount };
            const result = await db.storedDocument.updateMany({ where: { id, status: 'UPLOADING', jobId: null, expiresAt: { gt: now() } }, data: { status: 'VALIDATING' } });
            if (result.count !== 1)
                throw new UploadError('Validation is already in progress. If interrupted, select the PDF again.', 409);
            try {
                await storage.check();
                const bytes = await storage.read(d.uploadKey, MAX_UPLOAD_BYTES);
                if (bytes.length !== d.expectedBytes)
                    throw new UploadError('Uploaded size does not match the selected file', 415);
                let pages: number;
                try {
                    pages = await countPdfPages(bytes);
                }
                catch (e) {
                    throw new UploadError((e as Error).message, 415);
                }
                const sha256 = documentHash(bytes);
                await storage.put(d.objectKey, bytes);
                const saved = await db.storedDocument.updateMany({ where: { id, status: 'VALIDATING', jobId: null, expiresAt: { gt: now() } }, data: { status: 'READY', pageCount: pages, sha256 } });
                if (saved.count !== 1)
                    throw new UploadError('Document validation expired', 410);
                return { documentId: id, pageCount: pages };
            }
            catch (e) {
                await db.storedDocument.updateMany({ where: { id, status: 'VALIDATING' }, data: { status: 'INVALID' } }).catch(() => { });
                throw e;
            }
        },
        async upload(id: string, token: string, printerDeviceId: string, form: FormData) {
            const d = await scoped(id, token);
            if (d.status !== 'READY' || !d.sha256 || !d.pageCount)
                throw new UploadError('A validated PDF is required', 409);
            const printer = await db.printer.findUnique({ where: { id: d.printerId } });
            if (!printer || printer.shopId !== d.shopId || printer.deviceId !== printerDeviceId)
                throw new UploadError('Document not found', 404);
            const opts = parseOptions(form);
            if (!opts.ok)
                throw new UploadError(opts.error);
            // Re-read the canonical bytes so the immutable quote fingerprint remains
            // compatible with Phase 2E.3. No request carries a PDF through Next.js.
            await storage.check();
            const bytes = await storage.read(d.objectKey, MAX_UPLOAD_BYTES);
            if (bytes.length !== d.expectedBytes || documentHash(bytes) !== d.sha256)
                throw new UploadError('Document checksum verification failed', 409);
            const quote = createQuote(opts.value, d.pageCount);
            return { document: d, printerId: printerDeviceId, bytes, options: { ...opts.value, pageRange: quote.pageRange }, quote, submittedQuoteKey: String(form.get('quoteKey') ?? '') };
        },
        async attach(tx: Prisma.TransactionClient, d: StoredDocument, jobId: string) { const result = await tx.storedDocument.updateMany({ where: { id: d.id, shopId: d.shopId, printerId: d.printerId, status: 'READY', jobId: null, expiresAt: { gt: now() } }, data: { jobId } }); if (result.count !== 1)
            throw new UploadError('Document expired or already submitted', 409); },
        async markDelete(id: string, shopId: string) {
            const d = await db.storedDocument.findFirst({ where: { jobId: id, shopId } });
            if (!d)
                throw new UploadError('Cloud document not found', 404);
            await db.$transaction(async (tx) => {
                await tx.$queryRaw `SELECT id FROM "PrintJob" WHERE id=${id} FOR UPDATE`;
                const job = await tx.printJob.findUnique({ where: { id } });
                if (!job || job.shopId !== shopId || !terminalDocuments.includes(job.printStatus))
                    throw new UploadError('Only terminal job documents can be deleted; active and uncertain attempts are retained', 409);
                await tx.storedDocument.updateMany({ where: { id: d.id, shopId, status: { not: 'DELETED' } }, data: { status: 'DELETING' } });
            });
            if (d.status === 'DELETED')
                return { deleted: true };
            return { deleted: await purge({ ...d, status: 'DELETING' }) };
        },
        async retention(shopId: string, dryRun = true) {
            const days = Number(process.env.PRINTOS_DOCUMENT_RETENTION_DAYS ?? 7);
            if (!Number.isInteger(days) || days < 1 || days > 365)
                throw new UploadError('Invalid retention configuration', 503);
            const records = await db.storedDocument.findMany({ where: { shopId, ...retentionCandidates(now()) }, include: { job: { select: { printStatus: true } } }, orderBy: { createdAt: 'asc' }, take: 100 });
            let scheduled = 0, eligible = 0, deleted = 0, scanned = 0, quarantineCleaned = 0;
            const started = Date.now();
            for (const d of records) {
                if (Date.now() - started > 15000)
                    break;
                scanned++;
                const terminal = d.job && terminalDocuments.includes(d.job.printStatus);
                if (terminal && d.status === 'READY' && !d.retentionUntil) {
                    scheduled++;
                    if (!dryRun)
                        await db.storedDocument.updateMany({ where: { id: d.id, shopId, status: 'READY', retentionUntil: null }, data: { retentionUntil: new Date(now().getTime() + days * 86400000) } });
                }
                const expiredOrphan = !d.jobId && d.uploadGrantExpiresAt <= now();
                const retainedTerminal = terminal && d.retentionUntil && d.retentionUntil <= now();
                if (!expiredOrphan && !retainedTerminal && d.status !== 'DELETING') {
                    if (!d.quarantineDeletedAt && d.uploadGrantExpiresAt <= now()) {
                        quarantineCleaned++;
                        if (!dryRun) {
                            if (d.storageNamespace !== storage.namespace)
                                throw new UploadError('Document storage configuration changed', 503);
                            await storage.check();
                            await storage.remove([d.uploadKey]);
                            await db.storedDocument.updateMany({ where: { id: d.id, shopId, quarantineDeletedAt: null }, data: { quarantineDeletedAt: now() } });
                        }
                    }
                    continue;
                }
                eligible++;
                if (dryRun)
                    continue;
                const marked = await db.storedDocument.updateMany({ where: { id: d.id, shopId, status: { not: 'DELETED' }, ...(expiredOrphan ? { jobId: null } : {}) }, data: { status: 'DELETING' } });
                if (marked.count && await purge({ ...d, status: 'DELETING' }))
                    deleted++;
            }
            return { dryRun, scanned, scheduled, eligible, deleted, quarantineCleaned, limit: 100 };
        },
    };
}
