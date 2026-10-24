import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/tenantAccess";
import { effectiveHealth } from "@/lib/agentHealth";
import { getOwnerFromRequest } from "@/lib/session";

export async function GET(req: NextRequest) {
  const owner = await getOwnerFromRequest(req);
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const printers = await prisma.printer.findMany({ where: ownerScope(owner), orderBy: { createdAt: "asc" } });
  return NextResponse.json(printers.map(printer => ({ ...printer, status: effectiveHealth(printer.lastHeartbeat, printer.status === "ONLINE").printerAvailable === true ? "ONLINE" : "OFFLINE" })),{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req: NextRequest) {
  const owner = await getOwnerFromRequest(req);
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if(owner.role!=="owner")return NextResponse.json({error:"Owner role required"},{status:403});
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    deviceId?: string;
    location?: string;
    simulationOnly?: boolean;
  } | null;
  if (typeof body?.name!=="string" || !body.name.trim() || body.name.length>128 || typeof body.deviceId!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.deviceId) || (body.location!==undefined&&(typeof body.location!=="string"||body.location.length>256))) {
    return NextResponse.json({ error: "name and deviceId required" }, { status: 400 });
  }
  if (body.simulationOnly !== undefined && typeof body.simulationOnly !== "boolean") return NextResponse.json({ error: "simulationOnly must be boolean" }, { status: 400 });
  const existing = await prisma.printer.findUnique({ where: { deviceId: body.deviceId } });
  if (existing) return NextResponse.json({ error: "deviceId already registered" }, { status: 409 });

  const printer = await prisma.printer.create({
    data: {
      ...ownerScope(owner),
      simulationOnly: body.simulationOnly ?? false,
      name: body.name.slice(0, 128),
      deviceId: body.deviceId.slice(0, 128),
      location: body.location?.slice(0, 128),
    },
  });
  return NextResponse.json(printer);
}
