import { describe, it, expect } from "vitest";
import { computePricePaise, PRICE_PAISE } from "../lib/pricing";

const base = { copies: 1, colorMode: "BW" as const, paperSize: "A4" as const, duplex: false, pageRange: "all" };

describe("computePricePaise", () => {
  it("prices a single BW page at the configured rate", () => {
    expect(computePricePaise(base, 1)).toBe(PRICE_PAISE.BW_PER_PAGE);
  });
  it("multiplies pages × copies", () => {
    expect(computePricePaise({ ...base, copies: 3 }, 4)).toBe(PRICE_PAISE.BW_PER_PAGE * 12);
  });
  it("colour costs more than BW", () => {
    const bw = computePricePaise(base, 5);
    const col = computePricePaise({ ...base, colorMode: "COLOUR" }, 5);
    expect(col).toBeGreaterThan(bw);
  });
  it("duplex applies a discount", () => {
    const simplex = computePricePaise(base, 10);
    const dup = computePricePaise({ ...base, duplex: true }, 10);
    expect(dup).toBeLessThan(simplex);
  });
  it("defaults to 1 page when pageCount is null", () => {
    expect(computePricePaise(base, null)).toBe(PRICE_PAISE.BW_PER_PAGE);
  });
});
