import { MAX_COPIES, type UploadOptions } from "./validate";

export const PRICE_PAISE = {
  BW_PER_PAGE: 200,
  COLOUR_PER_PAGE: 500,
  DUPLEX_DISCOUNT_PER_PAGE: 50,
};

// Ranges are a set of document pages, not an instruction to repeat overlaps.
export function resolvePageRange(range: string, pageCount: number) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error("Invalid PDF page count");
  const value = range.trim();
  if (value === "all") return { pageRange: "all", selectedPages: pageCount };
  if (value.length > 64 || !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(value)) {
    throw new Error('Pages must be "all" or a range like "1,3-5"');
  }
  const intervals = value.split(",").map((part) => {
    const [start, end = start] = part.split("-").map(Number);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > pageCount) {
      throw new Error(`Pages must be between 1 and ${pageCount}, with ranges in ascending order`);
    }
    return [start, end];
  }).sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [];
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return {
    pageRange: merged.map(([a, b]) => a === b ? String(a) : `${a}-${b}`).join(","),
    selectedPages: merged.reduce((sum, [a, b]) => sum + b - a + 1, 0),
  };
}

export function createQuote(opts: UploadOptions, pageCount: number) {
  if (!Number.isInteger(opts.copies) || opts.copies < 1 || opts.copies > MAX_COPIES) throw new Error("Invalid copies");
  if (opts.colorMode !== "BW" && opts.colorMode !== "COLOUR") throw new Error("Invalid colour mode");
  const selection = resolvePageRange(opts.pageRange, pageCount);
  const base = opts.colorMode === "COLOUR" ? PRICE_PAISE.COLOUR_PER_PAGE : PRICE_PAISE.BW_PER_PAGE;
  const perPagePaise = base - (opts.duplex ? PRICE_PAISE.DUPLEX_DISCOUNT_PER_PAGE : 0);
  const price = perPagePaise * selection.selectedPages * opts.copies;
  if (!Number.isSafeInteger(price) || price > 2147483647) throw new Error("Quote exceeds supported amount");
  return { pageCount, ...selection, copies: opts.copies, perPagePaise, price };
}

export function computePricePaise(opts: UploadOptions, pageCount: number | null): number {
  if (pageCount === null) throw new Error("PDF page count is required for pricing");
  return createQuote(opts, pageCount).price;
}

export function formatPrice(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
