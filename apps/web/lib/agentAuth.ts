import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export type AgentIdentity = { shopId?: string | null; processingEnabled?:boolean; id: string; printerDeviceId: string; mode: "cups" | "mock" | "windows" };
type Credential = AgentIdentity & { tokenSha256: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function getAgentIdentity(req: NextRequest): Promise<AgentIdentity | null> {
  // Tenant shops accept only confirmed, revocable device enrollment credentials.
  if(process.env.PRINTOS_AUTH_MODE === "tenant") {
    if(process.env.PRINTOS_DEVICE_ENROLLMENT!=="enabled")return null;
    if(!/^Bearer pda_[A-Za-z0-9_-]{43}$/.test(req.headers.get("authorization")??""))return null;
    const {prisma}=await import("./prisma");const {deviceCredential}=await import("./deviceCredential");
    const found=await deviceCredential(prisma,req.headers);if(!found)return null;
    const d=found.device;if(d.localPrinterIdentifier && req.headers.get("x-printos-printer-identity")!==d.localPrinterIdentifier)return null;return {id:d.id,shopId:d.shopId,printerDeviceId:d.printer.deviceId,mode:d.mode as AgentIdentity["mode"],processingEnabled:d.processingEnabled && process.env.PRINTOS_LIVE_AGENT==="enabled"};
  }
  const id = req.headers.get("x-printos-agent") ?? "";
  const bearer = req.headers.get("authorization") ?? "";
  if (!id || !bearer.toLowerCase().startsWith("bearer ")) return null;
  const token = bearer.slice(7).trim();
  if (!token || token.length > 512) return null;
  let credentials: Credential[];
  try {
    credentials = JSON.parse(process.env.AGENT_CREDENTIALS_JSON ?? "[]");
    if (!Array.isArray(credentials)) return null;
  } catch { return null; }
  // Explicit, printer-bound compatibility configuration. Unscoped legacy tokens fail closed.
  if (!credentials.length && process.env.AGENT_ID && process.env.AGENT_DEVICE_ID && process.env.AGENT_TOKEN) {
    credentials = [{ id: process.env.AGENT_ID, printerDeviceId: process.env.AGENT_DEVICE_ID, mode: "cups", tokenSha256: createHash("sha256").update(process.env.AGENT_TOKEN).digest("hex") }];
  }
  const matching = credentials.filter(c => c && c.id === id);
  if (matching.length !== 1) return null;
  const credential = matching[0];
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(credential.id) || typeof credential.printerDeviceId !== "string" || !credential.printerDeviceId || !["cups", "mock", "windows"].includes(credential.mode) || !/^[a-f0-9]{64}$/i.test(credential.tokenSha256)) return null;
  const presented = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(presented, Buffer.from(credential.tokenSha256, "hex"))) return null;
  return { id: credential.id, printerDeviceId: credential.printerDeviceId, mode: credential.mode };
}
export async function verifyAgentToken(req: NextRequest):Promise<boolean> { return (await getAgentIdentity(req)) !== null; }
