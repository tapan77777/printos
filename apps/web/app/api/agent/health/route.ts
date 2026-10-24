import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/tenantAccess";
import { getOwnerFromRequest } from "@/lib/session";
import { effectiveHealth } from "@/lib/agentHealth";
export async function GET(req: NextRequest) {
  const owner = await getOwnerFromRequest(req);
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const health = await prisma.agentHealth.findMany({ where:{printer:ownerScope(owner)}, orderBy: { agentId: "asc" } });
  return NextResponse.json(health.map(row => ({ ...row, ...effectiveHealth(row.lastHeartbeat, row.printerAvailable) })), { headers: { "Cache-Control": "no-store" } });
}
