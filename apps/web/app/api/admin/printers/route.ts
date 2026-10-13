import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerFromRequest } from "@/lib/session";

export async function GET(req: NextRequest) {
  if (!getOwnerFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const printers = await prisma.printer.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(printers);
}

export async function POST(req: NextRequest) {
  if (!getOwnerFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    deviceId?: string;
    location?: string;
  } | null;
  if (!body?.name || !body?.deviceId) {
    return NextResponse.json({ error: "name and deviceId required" }, { status: 400 });
  }
  const existing = await prisma.printer.findUnique({ where: { deviceId: body.deviceId } });
  if (existing) return NextResponse.json({ error: "deviceId already registered" }, { status: 409 });

  const printer = await prisma.printer.create({
    data: {
      name: body.name.slice(0, 128),
      deviceId: body.deviceId.slice(0, 128),
      location: body.location?.slice(0, 128),
    },
  });
  return NextResponse.json(printer);
}
