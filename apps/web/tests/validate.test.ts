import { describe, it, expect } from "vitest";
import { isPdfBuffer, parseOptions } from "../lib/validate";

describe("isPdfBuffer", () => {
  it("accepts PDF header", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });
  it("rejects non-PDF", () => {
    expect(isPdfBuffer(Buffer.from("PK\x03\x04"))).toBe(false);
    expect(isPdfBuffer(Buffer.from(""))).toBe(false);
  });
});

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("parseOptions", () => {
  it("accepts valid options", () => {
    const r = parseOptions(form({ copies: "2", colorMode: "BW", paperSize: "A4", duplex: "true", pageRange: "1-5" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.copies).toBe(2);
      expect(r.value.duplex).toBe(true);
      expect(r.value.pageRange).toBe("1-5");
    }
  });
  it("rejects out-of-range copies", () => {
    const r = parseOptions(form({ copies: "0" }));
    expect(r.ok).toBe(false);
  });
  it("rejects unknown colorMode", () => {
    const r = parseOptions(form({ copies: "1", colorMode: "RAINBOW" }));
    expect(r.ok).toBe(false);
  });
  it("rejects unknown paperSize", () => {
    const r = parseOptions(form({ copies: "1", paperSize: "FOLIO" }));
    expect(r.ok).toBe(false);
  });
  it("rejects malformed pageRange", () => {
    const r = parseOptions(form({ copies: "1", pageRange: "1--" }));
    expect(r.ok).toBe(false);
  });
});
