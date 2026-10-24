import {createHash} from "node:crypto";
import path from "node:path";
import { WindowsPrintDevice } from "./adapters/WindowsPrintDevice";
import { PowerShellSpooler } from "./adapters/WindowsSpooler";
import { homedir } from "node:os";
import { LaptopPrintDevice } from "./LaptopPrintDevice";
import { MockPrintDevice } from "./MockPrintDevice";
import type { PrintDevice } from "./PrintDevice";
import { CloudClient, CloudError } from "./core/CloudClient";
import { Journal } from "./core/Journal";
import { Engine } from "./core/Engine";

export async function main() {
  const mode = (process.env.PRINT_DEVICE_MODE ?? "cups").toLowerCase();
  if (!["cups", "mock", "windows"].includes(mode)) throw new Error("ADAPTER_NOT_READY");
  if (mode === "cups" && process.platform === "win32") throw new Error("WINDOWS_ADAPTER_NOT_READY");
  if (mode === "windows" && process.platform !== "win32") throw new Error("WINDOWS_REQUIRED");
  const agentId = process.env.AGENT_ID ?? ""; const deviceId = process.env.DEVICE_ID ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(agentId) || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId) || !process.env.AGENT_TOKEN) throw new Error("AGENT_CONFIGURATION_REQUIRED");
  const cloudUrl = process.env.PRINTOS_CLOUD_URL ?? "http://localhost:3000";
  const interval = Number(process.env.POLL_INTERVAL_MS ?? 5000);
  const activeInterval = Number(process.env.CUPS_POLL_INTERVAL_MS ?? 2000);
  const leaseMs = Number(process.env.CLAIM_LEASE_MS ?? 120000);
  const completion = Number(process.env.CUPS_COMPLETION_TIMEOUT_SEC ?? 300) * 1000;
  if (!Number.isInteger(leaseMs) || leaseMs < 30000 || leaseMs > 300000 || !Number.isFinite(activeInterval) || activeInterval < 1000 || activeInterval > 30000) throw new Error("INVALID_AGENT_TIMING");
  if (!Number.isFinite(interval) || interval < 1000 || interval > 30000 || !Number.isFinite(completion) || completion < 1000 || completion > 3600000) throw new Error("INVALID_AGENT_TIMING");
  const cloud = new CloudClient(cloudUrl, agentId, process.env.AGENT_TOKEN, { version: "0.2.0", leaseMs, printerDeviceId: deviceId, printerIdentifier: mode==="mock"?createHash("sha256").update("mock:"+deviceId).digest("hex"):process.env.WINDOWS_PRINTER_IDENTIFIER });
  const selection = { name: process.env.WINDOWS_PRINTER_NAME ?? "", identifier: process.env.WINDOWS_PRINTER_IDENTIFIER ?? "" };
  const device: PrintDevice = mode === "mock" ? new MockPrintDevice() : mode === "windows"
    ? new WindowsPrintDevice(selection, new PowerShellSpooler(), { file: process.env.WINDOWS_SUMATRA_PATH ?? "", sha256: process.env.WINDOWS_SUMATRA_SHA256 ?? "" })
    : new LaptopPrintDevice(process.env.CUPS_PRINTER_NAME ?? "");
  if (mode === "windows") {
    if (!selection.name || !/^[a-f0-9]{64}$/.test(selection.identifier)) throw new Error("WINDOWS_SELECTION_REQUIRED");
    await device.discoverPrinters();
  }
  const journal = new Journal(process.env.AGENT_STATE_DIR ?? path.join(homedir(), ".printos-agent", agentId), `${cloudUrl}|${agentId}|${deviceId}|${mode}${mode === "windows" ? `|${selection.identifier}` : ""}`);
  await journal.lock();
  const engine = new Engine(cloud, device, journal, { completionTimeoutMs: completion, skipMockDownload: mode === "mock" && process.env.MOCK_SKIP_DOWNLOAD === "true" });
  const stop = () => { engine.stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  let healthTask: Promise<void> | null = null;
  const health = () => { if (!healthTask) healthTask = engine.heartbeat().catch(() => { console.warn("[agent] HEALTH_REPORT_PENDING"); }).finally(() => { healthTask = null; }); };
  const timer = setInterval(health, 10000); health();
  console.log(`[agent] STARTED version=0.2.0 mode=${mode}`);
  try {
    while (!engine.stopping) {
      try { await engine.tick(); }
      catch (err) {
        if (err instanceof CloudError) {
          console.warn("[agent] CLOUD_OPERATION_PENDING");
          if (err.status === 401 || err.status === 403) engine.stopping = true;
        } else { console.error("[agent] LOCAL_STATE_REQUIRES_INSPECTION"); engine.stopping = true; }
      }
      if (!engine.stopping) await new Promise(resolve => setTimeout(resolve, engine.processingState === "IDLE" || engine.processingState === "CLAIMING" ? interval : activeInterval));
    }
  } finally {
    clearInterval(timer); if (healthTask) await healthTask;
    await journal.unlock(); process.off("SIGTERM", stop); process.off("SIGINT", stop);
    console.log("[agent] STOPPED");
  }
}
// Importing the shared core/adapters in tests never starts the service.
if (require.main === module) main().catch(() => { console.error("[agent] STARTUP_FAILED_CHECK_CONFIGURATION_AND_JOURNAL"); process.exitCode = 1; });
