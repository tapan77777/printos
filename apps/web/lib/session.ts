import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "printos_session";
const SESSION_TTL_SEC = 60 * 60 * 12;

export type SessionPayload = { role: "owner"; iat: number; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET missing or too short (need 32+ chars)");
  }
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function b64urlEncode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function encodeSession(payload: Omit<SessionPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + SESSION_TTL_SEC };
  const body = b64urlEncode(full);
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export function getOwnerFromCookies(): SessionPayload | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  return decodeSession(token);
}

export function getOwnerFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return decodeSession(token);
}
