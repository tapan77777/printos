import { measureStage } from "./requestPerformance";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient() {
  const client = new PrismaClient();
  client.$use(async (_params, next) => measureStage("db", () => next(_params)));
  return client;
}
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
