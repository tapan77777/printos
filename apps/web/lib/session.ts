import { logAccountFailure } from "./authDiagnostic";
import { cache } from "react";
import { measureStage } from "./requestPerformance";
import { createHmac, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import type { OwnerAccess } from "./tenantAccess";
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

// Legacy HMAC helpers remain only for historical compatibility tests. They no
// longer authorize application requests: accounts must use revocable DB sessions.
export async function accountSession(requestHeaders: Headers) {
  if (process.env.PRINTOS_AUTH_MODE !== "tenant") return null;
  const {getAuth} = await import("./auth");
  const auth=getAuth();
  if(!auth)return null;
  return auth.api.getSession({headers:requestHeaders});
}

export async function resolveOwner(requestHeaders: Headers): Promise<OwnerAccess|null> {
  const session=await accountSession(requestHeaders);
  if(!session?.user.emailVerified || !session.session.activeOrganizationId)return null;
  const {prisma}=await import("./prisma");
  const membership=await prisma.member.findUnique({where:{organizationId_userId:{organizationId:session.session.activeOrganizationId,userId:session.user.id}}});
  if(!membership || !["owner","staff"].includes(membership.role))return null;
  return {userId:session.user.id,shopId:membership.organizationId,role:membership.role as "owner"|"staff"};
}

// React cache is limited to one server render; later requests recheck DB sessions.
const cacheServerRender: typeof cache = typeof cache === "function" ? cache : (fn => fn);
export const getOwnerFromCookies = cacheServerRender(async (): Promise<OwnerAccess|null> => {
  return measureStage("auth", () => resolveOwnerFromHeaders());
});
async function resolveOwnerFromHeaders() {
  // Read Next request headers outside error sanitization: its render-control
  // exceptions must propagate so private pages are never prerendered or cached.
  const requestHeaders=new Headers(await headers());
  try{return await resolveOwner(requestHeaders);}catch(error){logAccountFailure("handler",error);throw Error("Shop access is temporarily unavailable");}
}
export async function getOwnerFromRequest(req: NextRequest): Promise<OwnerAccess|null> {
  if(!["GET","HEAD"].includes(req.method)){
    const expected=process.env.BETTER_AUTH_URL;
    if(!expected || req.headers.get("origin")!==new URL(expected).origin)return null;
  }
  return measureStage("auth", () => resolveOwner(req.headers));
}
