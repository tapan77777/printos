// Edge Runtime-safe verifier for the owner session cookie.
// Mirrors lib/session.ts: same cookie name, secret, and `base64url(body).base64url(sig)` format,
// using Web Crypto (crypto.subtle) so middleware can run on the Edge Runtime.

export const SESSION_COOKIE_NAME = "printos_session";

export type SessionPayload = { role: "owner"; iat: number; exp: number };

function b64urlToArrayBuffer(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToArrayBuffer(s));
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET missing or too short (need 32+ chars)");
  }
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuf = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey(
    "raw",
    secretBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function decodeSessionEdge(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let sigBuf: ArrayBuffer;
  try {
    sigBuf = b64urlToArrayBuffer(sig);
  } catch {
    return null;
  }

  const key = await getKey();
  const bodyBytes = new TextEncoder().encode(body);
  const bodyBuf = bodyBytes.buffer.slice(
    bodyBytes.byteOffset,
    bodyBytes.byteOffset + bodyBytes.byteLength,
  ) as ArrayBuffer;
  const ok = await crypto.subtle.verify("HMAC", key, sigBuf, bodyBuf);
  if (!ok) return null;

  try {
    const parsed = JSON.parse(b64urlToString(body)) as SessionPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
