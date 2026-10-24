import {agentShop} from "./tenantAccess";
import type { AgentIdentity } from "./agentAuth";
import { UUID } from "./agentAuth";
import type { NextRequest } from "next/server";
export function attemptToken(req: NextRequest): string | null {
  const token = req.headers.get("x-printos-attempt") ?? "";
  return UUID.test(token) ? token : null;
}
export function ownsAttempt(agent: AgentIdentity, token: string | null, job: { shopId?:string|null; attemptId: string | null; claimedBy: string | null; printer: { deviceId: string }; simulation: boolean }): boolean {
  return agentShop(agent,job) && !!token && token === job.attemptId && job.claimedBy === agent.id && job.printer.deviceId === agent.printerDeviceId && job.simulation === (agent.mode === "mock");
}
