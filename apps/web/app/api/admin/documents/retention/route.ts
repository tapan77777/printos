import type { NextRequest } from 'next/server';
import { getOwnerFromRequest } from '@/lib/session';
import { documents, smallJson, documentJson, documentError } from '@/lib/documentHttp';
export const maxDuration = 60;
export async function POST(req: NextRequest) { const owner = await getOwnerFromRequest(req); if (!owner?.shopId)
    return documentJson({ error: 'Shop membership required' }, 401); if (owner.role !== 'owner')
    return documentJson({ error: 'Owner role required' }, 403); try {
    const body = await smallJson(req);
    return documentJson(await documents().retention(owner.shopId, body.dryRun !== false));
}
catch (e) {
    return documentError(e);
} }
