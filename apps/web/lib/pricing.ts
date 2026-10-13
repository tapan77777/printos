import type { UploadOptions } from "./validate";

export const PRICE_PAISE = {
  BW_PER_PAGE: 200,
  COLOUR_PER_PAGE: 500,
  DUPLEX_DISCOUNT_PER_PAGE: 50,
};

export function computePricePaise(opts: UploadOptions, pageCount: number | null): number {
  const effectivePages = Math.max(1, pageCount ?? 1);
  const base = opts.colorMode === "COLOUR" ? PRICE_PAISE.COLOUR_PER_PAGE : PRICE_PAISE.BW_PER_PAGE;
  const perPage = opts.duplex ? Math.max(0, base - PRICE_PAISE.DUPLEX_DISCOUNT_PER_PAGE) : base;
  return perPage * effectivePages * opts.copies;
}
