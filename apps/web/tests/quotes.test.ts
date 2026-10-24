import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { countPdfPages } from "../lib/pdf";
import { createQuote, formatPrice, resolvePageRange } from "../lib/pricing";
import { parseOptions } from "../lib/validate";

const opts = { copies: 1, colorMode: "BW" as const, paperSize: "A4" as const, duplex: false, pageRange: "all" };
export async function fixture(pages: number, objectStreams = true) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage().drawText(`Page ${i + 1}`);
  return Buffer.from(await pdf.save({ useObjectStreams: objectStreams, addDefaultPage: false }));
}

describe("PDF inspection", () => {
  it.each([true, false])("counts multipage PDFs (object streams %s)", async (compressed) => {
    expect(await countPdfPages(await fixture(7, compressed))).toBe(7);
  });
  it("counts actual leaves instead of trusting Count metadata", async () => {
    const pdf = await PDFDocument.load(await fixture(3));
    pdf.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(900));
    expect(await countPdfPages(Buffer.from(await pdf.save()))).toBe(3);
  });
  it("rejects encrypted documents", async () => {
    const pdf = await PDFDocument.load(await fixture(1));
    pdf.context.trailerInfo.Encrypt = pdf.context.register(pdf.context.obj({ Filter: "Standard" }));
    await expect(countPdfPages(Buffer.from(await pdf.save()))).rejects.toThrow("unencrypted");
  });
  it("rejects cycles in page trees", async () => {
    const pdf = await PDFDocument.load(await fixture(1));
    pdf.catalog.Pages().Kids().push(pdf.catalog.get(PDFName.of("Pages"))!);
    await expect(countPdfPages(Buffer.from(await pdf.save({ addDefaultPage: false })))).rejects.toThrow("cannot be read");
  });
  it("rejects empty documents", async () => {
    await expect(countPdfPages(await fixture(0))).rejects.toThrow("cannot be read");
  });
  it.each([Buffer.alloc(0), Buffer.from("hello"), Buffer.from("%PDF-1.7\nnot a document\n%%EOF")])("rejects invalid PDFs", async (bytes) => {
    await expect(countPdfPages(bytes)).rejects.toThrow();
  });
  it("rejects truncated PDFs", async () => {
    const bytes = await fixture(2);
    await expect(countPdfPages(bytes.subarray(0, bytes.length - 20))).rejects.toThrow();
  });
});

describe("ranges and exact pricing", () => {
  it("sorts and merges overlaps and duplicates", () => {
    expect(resolvePageRange("5,1-3,2-4,5", 6)).toEqual({ pageRange: "1-5", selectedPages: 5 });
  });
  it.each(["0", "3-1", "1-8", "all,1", "-1", "1,,2", "1.5", "9007199254740993", "1,".repeat(40)])("rejects invalid range %s", (range) => {
    expect(() => resolvePageRange(range, 7)).toThrow();
  });
  it("does not silently truncate long ranges", () => {
    const form = new FormData(); form.set("copies", "1"); form.set("pageRange", "1,".repeat(40) + "1");
    expect(parseOptions(form).ok).toBe(false);
  });
  it.each([
    ["BW", false, "all", 3, 4200],
    ["BW", true, "all", 3, 3150],
    ["COLOUR", true, "1,3-5", 2, 3600],
    ["COLOUR", false, "2-4", 2, 3000],
    ["BW", true, "1", 1, 150],
  ] as const)("prices %s duplex=%s pages=%s copies=%s", (colorMode, duplex, pageRange, copies, price) => {
    const quote = createQuote({ ...opts, colorMode, duplex, pageRange, copies }, 7);
    expect(quote.price).toBe(price);
    expect(Number.isInteger(quote.price)).toBe(true);
    expect(formatPrice(quote.price)).toBe(`₹${(price / 100).toFixed(2)}`);
  });
  it("rejects missing/invalid counts and copies", () => {
    for (const pages of [0, -1, 1.5, NaN]) expect(() => createQuote(opts, pages)).toThrow();
    expect(() => createQuote({ ...opts, copies: 51 }, 1)).toThrow();
  });
});
