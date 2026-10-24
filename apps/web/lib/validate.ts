export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024);
export const ALLOWED_COLOR_MODES = ["BW", "COLOUR"] as const;
export const ALLOWED_PAPER_SIZES = ["A4", "A5", "LETTER", "LEGAL"] as const;
export const MAX_COPIES = 50;

export type UploadOptions = {
  copies: number;
  colorMode: (typeof ALLOWED_COLOR_MODES)[number];
  paperSize: (typeof ALLOWED_PAPER_SIZES)[number];
  duplex: boolean;
  pageRange: string;
};

export function isPdfBuffer(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  // PDFs start with "%PDF-" (optionally preceded by a UTF-8 BOM).
  const start = buf.subarray(0, 8).toString("latin1");
  return start.startsWith("%PDF-") || start.startsWith("\uFEFF%PDF-");
}

export function parseOptions(form: FormData): { ok: true; value: UploadOptions } | { ok: false; error: string } {
  const copies = Number(form.get("copies"));
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) {
    return { ok: false, error: `copies must be an integer 1..${MAX_COPIES}` };
  }

  const colorMode = String(form.get("colorMode") ?? "BW").toUpperCase();
  if (!ALLOWED_COLOR_MODES.includes(colorMode as (typeof ALLOWED_COLOR_MODES)[number])) {
    return { ok: false, error: `colorMode must be one of ${ALLOWED_COLOR_MODES.join(", ")}` };
  }

  const paperSize = String(form.get("paperSize") ?? "A4").toUpperCase();
  if (!ALLOWED_PAPER_SIZES.includes(paperSize as (typeof ALLOWED_PAPER_SIZES)[number])) {
    return { ok: false, error: `paperSize must be one of ${ALLOWED_PAPER_SIZES.join(", ")}` };
  }

  const duplexRaw = String(form.get("duplex") ?? "false").toLowerCase();
  if (!["true", "false", "1", "0"].includes(duplexRaw)) return { ok: false, error: "duplex must be true or false" };
  const duplex = duplexRaw === "true" || duplexRaw === "1";

  const pageRange = String(form.get("pageRange") ?? "all").trim();
  if (pageRange.length > 64 || !/^(all|\d+(-\d+)?(,\d+(-\d+)?)*)$/.test(pageRange)) {
    return { ok: false, error: `pageRange must be "all" or like "1,3-5"` };
  }

  return {
    ok: true,
    value: {
      copies,
      colorMode: colorMode as UploadOptions["colorMode"],
      paperSize: paperSize as UploadOptions["paperSize"],
      duplex,
      pageRange,
    },
  };
}
