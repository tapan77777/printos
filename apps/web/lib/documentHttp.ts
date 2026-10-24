import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { prisma } from './prisma';
import { accountRequest } from './authBody';
import { cloudDocuments, privateStorage, StorageError } from './privateStorage';
import { documentService, documentHash } from './documents';
import { UploadError } from './uploadQuote';
export function documents() { if (!cloudDocuments())
    throw new UploadError('Cloud documents are not enabled', 503); return documentService(prisma, privateStorage()); }
export async function smallJson(req: NextRequest) { const bounded = await accountRequest(req); if (bounded instanceof Response)
    throw new UploadError('Small JSON request required', bounded.status); try {
    const body = await bounded.json();
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw Error();
    return body;
}
catch {
    throw new UploadError('Invalid JSON');
} }
export function documentJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } }); }
export function documentError(e: unknown) { return documentJson({ error: e instanceof UploadError || e instanceof StorageError ? e.message : 'Document service unavailable' }, e instanceof UploadError || e instanceof StorageError ? e.status : 503); }
export async function documentLimit(req: NextRequest) {
    const raw = process.env.PRINTOS_TRUST_PROXY === 'true' ? req.headers.get('x-real-ip') : null;
    const ip = raw && isIP(raw) ? raw : 'shared';
    const key = 'doc:' + documentHash(ip);
    const now = BigInt(Date.now()), cutoff = now - 3600000n;
    const rows = await prisma.$queryRaw<{
        count: number;
    }[]> `INSERT INTO "RateLimit" (id,key,count,"lastRequest") VALUES (${key},${key},1,${now}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."lastRequest" < ${cutoff} THEN 1 ELSE "RateLimit".count+1 END,"lastRequest"=CASE WHEN "RateLimit"."lastRequest" < ${cutoff} THEN ${now} ELSE "RateLimit"."lastRequest" END RETURNING count`;
    if (rows[0].count > 30)
        throw new UploadError('Upload limit reached. Try again later.', 429);
}
