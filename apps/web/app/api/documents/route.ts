import type { NextRequest } from 'next/server';
import { documents, smallJson, documentLimit, documentJson, documentError } from '@/lib/documentHttp';
export const maxDuration = 60;
export async function POST(req: NextRequest) { try {
    const service = documents();
    await documentLimit(req);
    const body = await smallJson(req);
    return documentJson(await service.begin(String(body.printerId ?? ''), body.sizeBytes));
}
catch (e) {
    return documentError(e);
} }
