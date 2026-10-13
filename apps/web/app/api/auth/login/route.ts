import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/password";
import { encodeSession, sessionCookieOptions } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? "";
  const stored = process.env.OWNER_PASSWORD_HASH;

  if (!stored) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const ok = password.length > 0 && verifyPassword(password, stored);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = encodeSession({ role: "owner" });
  const opts = sessionCookieOptions();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(opts.name, token, {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: opts.path,
    maxAge: opts.maxAge,
  });
  return res;
}
