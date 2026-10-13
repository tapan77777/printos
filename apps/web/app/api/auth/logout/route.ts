import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/session";

export async function POST() {
  const opts = sessionCookieOptions();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(opts.name, "", {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: opts.path,
    maxAge: 0,
  });
  return res;
}
