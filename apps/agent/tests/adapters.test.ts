import { test } from "node:test";
import assert from "node:assert/strict";
import { LaptopPrintDevice } from "../src/LaptopPrintDevice";
import { MockPrintDevice } from "../src/MockPrintDevice";
import { WindowsPrintDevice } from "../src/adapters/WindowsPrintDevice";
import { ippRequest, parseIpp } from "../src/adapters/ipp";
const attempt = "cba44b65-6c61-4cc3-a89a-8dd4e4181491";
const job = { id: "test", copies: 3, colorMode: "COLOUR" as const, duplex: true, pageRange: "1,3-5", paperSize: "A4" };
test("CUPS options retain copies, colour, duplex, media and selected pages; one lp call", async () => {
  const commands: { file: string; args: string[] }[] = [];
  const device = new LaptopPrintDevice("Printer", async (file, args) => { commands.push({ file, args }); return { stdout: "request id is Printer-123 (1 file(s))" }; });
  assert.deepEqual(await device.submitJob(job, "/fixture/never-printed.pdf", attempt), { spoolId: "Printer-123" });
  assert.equal(commands.length, 1); const args = commands[0].args;
  for (const value of ["3", "ColorModel=RGB", "sides=two-sided-long-edge", "media=A4", "page-ranges=1,3-5", `PrintOS-${attempt}`]) assert.ok(args.includes(value));
});
test("CUPS missing spool id and subprocess timeout are uncertain, not silently retried", async () => {
  let count = 0; const device = new LaptopPrintDevice("Printer", async () => { count++; throw new Error("timeout"); });
  await assert.rejects(device.submitJob(job, "/fixture/file.pdf", attempt)); assert.equal(count, 1);
  await assert.rejects(new LaptopPrintDevice("Printer", async () => ({ stdout: "ok" })).submitJob(job, "/fixture/file.pdf", attempt), /UNCERTAIN/);
});
for (const [state, result] of [[3,"pending"],[5,"pending"],[6,"pending"],[7,"failed"],[8,"failed"],[9,"completed"]] as const) {
  test(`IPP state ${state} is ${result}`, async () => {
    const device = new LaptopPrintDevice("Printer", undefined, async () => ({ "job-name": `PrintOS-${attempt}`, "job-state": state, "job-impressions-completed": 12 }));
    assert.equal((await device.getJobStatus("Printer-12", attempt)).state, result);
  });
}
test("CUPS query failure never implies completion or availability", async () => {
  const device = new LaptopPrintDevice("Printer", undefined, async () => { throw new Error("offline"); });
  assert.equal((await device.getJobStatus("Printer-1", attempt)).state, "unknown"); assert.equal((await device.getPrinterStatus()).available, null);
});
test("accepting jobs and non-stopped state are both required for availability", async () => {
  const device = new LaptopPrintDevice("Printer", undefined, async () => ({ "printer-state": 5, "printer-is-accepting-jobs": true }));
  assert.equal((await device.getPrinterStatus()).available, false);
});
test("IPP framing is bounded and validates response status and lengths", () => {
  assert.equal(ippRequest(9, "ipp://localhost/jobs/1", ["job-state"]).readUInt16BE(2), 9);
  const bytes = Buffer.from([2,0,0,0,0,0,0,1,2,0x23,0,9,...Buffer.from("job-state"),0,4,0,0,0,9,3]);
  assert.equal(parseIpp(bytes)["job-state"], 9);
  assert.throws(() => parseIpp(bytes.subarray(0, -2))); bytes[2] = 4; assert.throws(() => parseIpp(bytes));
});
test("mock results survive adapter restart and do not invent a printed page count", async () => {
  const device = new MockPrintDevice({ latencyMs: 50, now: () => 100, random: () => 1 });
  const result = await device.submitJob(job, "unused", attempt);
  assert.equal((await device.getJobStatus(result.spoolId)).state, "pending");
  const recovered = await new MockPrintDevice({ now: () => 200 }).getJobStatus(result.spoolId);
  assert.deepEqual(recovered, { state: "completed" });
});
test("mock failure mode remains available without touching CUPS", async () => {
  const device = new MockPrintDevice({ latencyMs: 0, failureRate: 1 });
  assert.equal((await device.getJobStatus((await device.submitJob(job, "unused", attempt)).spoolId)).state, "failed");
});
test("unconfigured Windows adapter fails closed", async () => {
  const device = new WindowsPrintDevice(); assert.equal((await device.getPrinterStatus()).available, null);
  await assert.rejects(device.submitJob(job, "unused", attempt), /CONFIGURATION_REQUIRED/);
});
test("completed-with-errors is not reported as successful output", async () => {
  const device = new LaptopPrintDevice("Printer", undefined, async () => ({ "job-name": `PrintOS-${attempt}`, "job-state": 9, "job-state-reasons": ["none", "job-completed-with-errors"] }));
  assert.equal((await device.getJobStatus("Printer-1", attempt)).state, "failed");
});
test("fresh spooler observations do not hide a known offline device reason", async () => {
  const device = new LaptopPrintDevice("Printer", undefined, async () => ({ "printer-state": 3, "printer-is-accepting-jobs": true, "printer-state-reasons": ["offline-report"] }));
  assert.equal((await device.getPrinterStatus()).available, false);
});
test("reused spool IDs cannot be mistaken for the journaled attempt", async () => {
  const device = new LaptopPrintDevice("Printer", undefined, async () => ({ "job-name": "Different-job", "job-state": 9 }));
  assert.equal((await device.getJobStatus("Printer-1", attempt)).state, "unknown");
});
