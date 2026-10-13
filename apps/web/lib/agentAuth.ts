import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function verifyAgentToken(req: NextRequest): boolean {
  const configured = process.env.AGENT_TOKEN;
  if (!configured) return false;

  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const presented = header.slice(7).trim();
  if (!presented) return false;

  const a = sha256(presented);
  const b = sha256(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}
