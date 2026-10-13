import { LaptopPrintDevice } from "./LaptopPrintDevice";

const CLOUD_URL = (process.env.PRINTOS_CLOUD_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CUPS_PRINTER = process.env.CUPS_PRINTER_NAME ?? "";
const DEVICE_ID = process.env.DEVICE_ID ?? "";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const CLAIM_LEASE_MS = Number(process.env.CLAIM_LEASE_MS ?? 5 * 60 * 1000);

if (!CUPS_PRINTER) throw new Error("CUPS_PRINTER_NAME is required");
if (!DEVICE_ID) throw new Error("DEVICE_ID is required");
if (!AGENT_TOKEN) throw new Error("AGENT_TOKEN is required");

type ClaimedJob = {
  id: string;
  copies: number;
  colorMode: "BW" | "COLOUR";
  paperSize: string;
  duplex: boolean;
  pageRange: string;
  printer: { name: string; deviceId: string };
};

const inFlight = new Set<string>();

async function claimJobs(): Promise<ClaimedJob[]> {
  const res = await fetch(`${CLOUD_URL}/api/jobs/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGENT_TOKEN}` },
    body: JSON.stringify({
      agentId: DEVICE_ID,
      printerDeviceId: DEVICE_ID,
      leaseMs: CLAIM_LEASE_MS,
      max: 1,
    }),
  });
  if (!res.ok) {
    console.error(`[claim] HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs: ClaimedJob[] };
  return data.jobs ?? [];
}

async function main() {
  const device = new LaptopPrintDevice(CUPS_PRINTER, CLOUD_URL, AGENT_TOKEN);
  console.log(`PrintOS Agent starting — device=${DEVICE_ID} cups=${CUPS_PRINTER} cloud=${CLOUD_URL}`);
  await device.connect();

  while (true) {
    try {
      await device.heartbeat();
      const jobs = await claimJobs();
      for (const job of jobs) {
        if (inFlight.has(job.id)) continue;
        inFlight.add(job.id);
        console.log(`[agent] picking up ${job.id}`);
        device
          .submitJob({
            jobId: job.id,
            fileUrl: `${CLOUD_URL}/api/jobs/${job.id}/file`,
            copies: job.copies,
            colorMode: job.colorMode,
            paperSize: job.paperSize,
            duplex: job.duplex,
            pageRange: job.pageRange,
          })
          .catch((err) => console.error(`[agent] submitJob(${job.id}) unhandled:`, err))
          .finally(() => inFlight.delete(job.id));
      }
    } catch (err) {
      console.error("[agent] loop error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("Agent crashed:", err);
  process.exit(1);
});
