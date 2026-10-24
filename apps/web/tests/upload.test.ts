import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
const mocks = vi.hoisted(() => ({ printer: vi.fn(), create: vi.fn(), mkdir: vi.fn(), write: vi.fn(), unlink: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { printer: { findUnique: mocks.printer }, printJob: { create: mocks.create }, $queryRaw:vi.fn(),shopRateCard:{findFirst:async()=>({id:"rate-a",shopId:"shop-a",rules:[{paperSize:"A4",colorMode:"COLOUR",duplex:true,basis:"PAGE",unitPaise:450}],minimumPaise:0})},$transaction:async(fn:any)=>fn((await import("@/lib/prisma")).prisma) } }));
vi.mock("fs/promises", () => ({ mkdir: mocks.mkdir, writeFile: mocks.write, unlink: mocks.unlink }));
import { POST as quote } from "../app/api/quotes/route";
import { POST as upload } from "../app/api/jobs/route";

async function request(range = "all", invalid = false,quoteKey="") {
  const pdf = await PDFDocument.create(); pdf.setCreationDate(new Date(0));pdf.setModificationDate(new Date(0)); for (let i = 0; i < 8; i++) pdf.addPage();
  const form = new FormData();
  form.set("quoteKey",quoteKey);
  form.set("file", new File([invalid ? new Uint8Array([1, 2]) : new Uint8Array(await pdf.save())], "test.pdf"));
  for (const [key, value] of Object.entries({ printerId: "SHOP-001", copies: "3", colorMode: "COLOUR", duplex: "true", pageRange: range, price: "1", pageCount: "1", shopId:"shop-b" })) form.set(key, value);
  return new NextRequest("http://localhost/api/jobs", { method: "POST", body: form });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.unlink.mockResolvedValue(undefined); mocks.printer.mockResolvedValue({ id: "printer", shopId:"shop-a" });
  mocks.create.mockImplementation(async ({ data }) => data);
});
describe("quotes and upload contract (all writes mocked)", () => {
  it("quotes without storing files or jobs, then persists the same authoritative price", async () => {
    const response = await quote(await request("5,1-3,2"));
    const quoted = await response.json();
    expect(response.status).toBe(200);
    expect(quoted).toMatchObject({ pageCount: 8, selectedPages: 4, pageRange: "1-3,5", price: 5400 });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
    const saved = await (await upload(await request("5,1-3,2",false,quoted.quoteKey))).json();
    expect(saved.price).toBe(quoted.price); expect(saved.quote).toEqual(quoted);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ shopId:"shop-a", pageCount: 8, pageRange: "1-3,5", price: 5400, printStatus: "QUEUED" });
    expect(saved.jobId).toBeTruthy(); expect(saved.customerSessionId).toBeTruthy();
  });
  it.each([quote, upload])("rejects invalid PDFs before writes", async (handler) => {
    expect((await handler(await request("all", true))).status).toBe(415);
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects ranges beyond document length", async () => {
    expect((await upload(await request("1-9"))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("cleans the file if database creation fails", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    const q=await(await quote(await request())).json();
    await expect(upload(await request("all",false,q.quoteKey))).rejects.toThrow("database unavailable");
    expect(mocks.unlink).toHaveBeenCalledOnce();
  });
});
it('rejects missing or stale quote consent without creating a tenant job and cleans the file',async()=>{
 expect((await upload(await request())).status).toBe(409);expect(mocks.create).not.toHaveBeenCalled();expect(mocks.unlink).toHaveBeenCalledOnce();
});
it('binds quote consent to the PDF and options rather than trusting supplied price',async()=>{
 const q=await(await quote(await request('1-2'))).json();expect((await upload(await request('1-3',false,q.quoteKey))).status).toBe(409);expect(mocks.create).not.toHaveBeenCalled();
});
