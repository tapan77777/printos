import { MAX_UPLOAD_BYTES } from './validate';
export class StorageError extends Error {
    constructor(public status = 503, message = 'Private document storage is unavailable') { super(message); }
}
export function cloudDocuments() { return process.env.PRINTOS_DOCUMENT_STORAGE === 'supabase'; }
export function localDocumentsAllowed() { return !process.env.VERCEL && (process.env.NODE_ENV !== 'production' || process.env.PRINTOS_LEGACY_LOCAL_READ === 'enabled'); }
export interface PrivateStorage {
    readonly namespace: string;
    check(): Promise<void>;
    uploadGrant(key: string): Promise<string>;
    read(key: string, maxBytes: number): Promise<Buffer>;
    put(key: string, bytes: Buffer): Promise<void>;
    sign(key: string, download: boolean): Promise<string>;
    remove(keys: string[]): Promise<void>;
}
export async function boundedBytes(res: Response, max: number) {
    if (Number(res.headers.get('content-length')) > max) {
        await res.body?.cancel();
        throw new StorageError(413, 'Document exceeds the upload limit');
    }
    const reader = res.body?.getReader();
    if (!reader)
        throw new StorageError();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > max)
                throw new StorageError(413, 'Document exceeds the upload limit');
            parts.push(value);
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    return Buffer.concat(parts);
}
export function privateStorage(): PrivateStorage {
    const origin = process.env.SUPABASE_STORAGE_URL, secret = process.env.SUPABASE_STORAGE_SECRET_KEY, bucket = process.env.PRINTOS_DOCUMENT_BUCKET;
    if (!Number.isSafeInteger(MAX_UPLOAD_BYTES) || MAX_UPLOAD_BYTES < 1 || MAX_UPLOAD_BYTES > 25 * 1024 * 1024)
        throw new StorageError();
    if (!cloudDocuments() || !origin || !secret || !bucket || !/^[a-z0-9-]{3,63}$/.test(bucket))
        throw new StorageError();
    let u: URL;
    try {
        u = new URL(origin);
    }
    catch {
        throw new StorageError();
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' || !/^([a-z0-9]{20})\.supabase\.co$/.test(u.hostname))
        throw new StorageError();
    // Prevent accidentally using a different project's privileged storage credential.
    const db = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
    const ref = u.hostname.split('.')[0];
    const databaseRef = db.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? decodeURIComponent(db.username).match(/\.([a-z0-9]{20})$/)?.[1];
    if (databaseRef !== ref)
        throw new StorageError();
    const base = u.origin + '/storage/v1';
    function keyPath(key: string) { if (!/^(uploads|objects)\/[a-f0-9]{64}\/[a-f0-9-]{36}\.pdf$/.test(key))
        throw new StorageError(400, 'Invalid document key'); return bucket + '/' + key; }
    async function call(route: string, init: RequestInit = {}, max = 32768) {
        let res: Response;
        try {
            res = await fetch(base + route, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(max > 32768 || init.body instanceof Uint8Array ? 20000 : 5000), headers: { apikey: secret!, Authorization: `Bearer ${secret}`, ...init.headers } });
        }
        catch {
            throw new StorageError();
        }
        if (!res.ok) {
            await res.body?.cancel();
            throw new StorageError(res.status === 404 ? 404 : 503);
        }
        return boundedBytes(res, max);
    }
    async function json(route: string, init: RequestInit = {}) { try {
        return JSON.parse((await call(route, init)).toString());
    }
    catch (e) {
        if (e instanceof StorageError)
            throw e;
        throw new StorageError();
    } }
    const post = (value: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    function grantUrl(raw: unknown, key: string, kind: 'upload' | 'read') {
        if (typeof raw !== 'string')
            throw new StorageError();
        const result = new URL(raw, base + '/');
        const expected = '/storage/v1/object/' + (kind === 'upload' ? 'upload/sign/' : 'sign/') + keyPath(key);
        if (result.origin !== u.origin || result.pathname !== expected || !result.searchParams.get('token') || result.username || result.password || result.hash)
            throw new StorageError();
        return result.toString();
    }
    return {
        namespace: base + "/" + bucket,
        async check() { const config = await json('/bucket/' + bucket); if (config.public !== false || !Number.isInteger(Number(config.file_size_limit)) || Number(config.file_size_limit) < 1 || Number(config.file_size_limit) > MAX_UPLOAD_BYTES || !Array.isArray(config.allowed_mime_types) || config.allowed_mime_types.length !== 1 || config.allowed_mime_types[0] !== 'application/pdf')
            throw new StorageError(503, 'Private PDF bucket configuration must be reviewed'); },
        async uploadGrant(key) { const data = await json('/object/upload/sign/' + keyPath(key), post({})); return grantUrl(base + data.url, key, 'upload'); },
        async read(key, max) { return call('/object/authenticated/' + keyPath(key), {}, max); },
        async put(key, bytes) { await call('/object/' + keyPath(key), { ...post(bytes), headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false', 'cache-control': 'private, no-store' }, body: new Uint8Array(bytes) }); },
        async sign(key, download) { const data = await json('/object/sign/' + keyPath(key), post({ expiresIn: 60 })); const url = new URL(grantUrl(base + data.signedURL, key, 'read')); if (download)
            url.searchParams.set('download', 'document.pdf'); return url.toString(); },
        async remove(keys) { for (const k of keys)
            keyPath(k); await call('/object/' + bucket, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: keys }) }); },
    };
}
