// Browser-only transport. Receives only a scoped upload grant, never a storage key.
export async function uploadPrivateDocument(file: File, printerId: string, signal: AbortSignal) {
    async function json(url: string, init: RequestInit) { const r = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(url.endsWith("finalize") ? 65000 : 20000)]) }); const body = await r.json(); if (!r.ok)
        throw new Error(body.error ?? 'Document upload failed'); return body; }
    const grant = await json('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ printerId, sizeBytes: file.size }) });
    // The server checks the provider URL and exact object path before returning it.
    const u = new URL(grant.uploadUrl);
    if (u.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname) || !u.pathname.startsWith('/storage/v1/object/upload/sign/'))
        throw Error('Invalid private upload grant');
    const sent = await fetch(u.toString(), { method: 'PUT', redirect: 'error', credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]), headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: file });
    if (!sent.ok)
        throw Error('PDF upload did not complete. Select the file again to retry.');
    await json(`/api/documents/${grant.documentId}/finalize`, { method: 'POST', headers: { 'x-printos-document-token': grant.documentToken } });
    return { documentId: grant.documentId as string, documentToken: grant.documentToken as string };
}
