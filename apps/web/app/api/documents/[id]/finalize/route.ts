import type { NextRequest } from 'next/server';
import { documents, documentJson, documentError } from '@/lib/documentHttp';
export const maxDuration = 60;
export async function POST(req: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    return documentJson(await documents().finalize((await params).id, req.headers.get('x-printos-document-token') ?? ''));
}
catch (e) {
    return documentError(e);
} }
