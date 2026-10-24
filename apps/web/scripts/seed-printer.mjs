#!/usr/bin/env node
// Usage: node apps/web/scripts/seed-printer.mjs <deviceId> <name> [location]
import { PrismaClient } from "@prisma/client";

const [, , deviceId, name, location] = process.argv;
if (!deviceId || !name) {
  console.error("Usage: node apps/web/scripts/seed-printer.mjs <deviceId> <name> [location]");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.printer.findUnique({ where: { deviceId } });
  if (existing) {
    console.log(`Printer ${deviceId} already exists (id=${existing.id})`);
    process.exit(0);
  }
  const p = await prisma.printer.create({ data: { deviceId, name, location: location === "--simulation" ? null : location ?? null, simulationOnly: process.argv.includes("--simulation") } });
  console.log(`Created printer id=${p.id} deviceId=${p.deviceId} name=${p.name}`);
} finally {
  await prisma.$disconnect();
}
