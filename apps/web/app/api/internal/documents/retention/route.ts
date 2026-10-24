import type { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { documents, documentJson, documentError } from '@/lib/documentHttp';
import { retentionCandidates } from '@/lib/documents';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (process.env.PRINTOS_DOCUMENT_CLEANUP !== 'enabled' || !secret || secret.length < 32)
        return documentJson({ error: 'Scheduled document cleanup is disabled' }, 503);
    const actual = req.headers.get('authorization') ?? '';
    const hash = (s: string) => createHash('sha256').update(s).digest();
    if (!timingSafeEqual(hash(actual), hash('Bearer ' + secret)))
        return documentJson({ error: 'Unauthorized' }, 401);
    try {
        const service = documents();
        const shops = await prisma.storedDocument.findMany({ where: retentionCandidates(new Date()), select: { shopId: true }, distinct: ['shopId'], orderBy: { createdAt: 'asc' }, take: 5 });
        const results = [];
        const start = Date.now();
        for (const shop of shops) {
            if (Date.now() - start > 15000)
                break;
            results.push(await service.retention(shop.shopId, false));
        }
        return documentJson({ shops: results.length, deleted: results.reduce((n, r) => n + r.deleted, 0) });
    }
    catch (e) {
        return documentError(e);
    }
}
