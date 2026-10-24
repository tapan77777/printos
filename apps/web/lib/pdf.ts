import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { isPdfBuffer, MAX_UPLOAD_BYTES } from "./validate";

export const MAX_PDF_PAGES = 10_000;

export async function countPdfPages(bytes: Buffer): Promise<number> {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES || !isPdfBuffer(bytes)) {
    throw new Error("Choose a non-empty PDF within the upload size limit");
  }
  if (!/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))) {
    throw new Error("PDF is incomplete or invalid. Export it again and retry.");
  }
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false,
    });
    // Count real leaves rather than trusting /Count. Bound traversal and reject
    // cycles/shared nodes so malformed page trees cannot recurse indefinitely.
    const seen = new Set<PDFDict>();
    let pages = 0;
    function visit(node: PDFDict, depth: number) {
      if (depth > 100 || seen.has(node) || seen.size >= 20_000) throw new Error("Invalid page tree");
      seen.add(node);
      const type = node.lookup(PDFName.of("Type"), PDFName).asString();
      if (type === "/Page") {
        if (++pages > MAX_PDF_PAGES) throw new Error("Too many pages");
      } else if (type === "/Pages") {
        const kids = node.lookup(PDFName.of("Kids"), PDFArray);
        for (let i = 0; i < kids.size(); i++) visit(kids.lookup(i, PDFDict), depth + 1);
      } else throw new Error("Invalid page type");
    }
    visit(pdf.catalog.Pages(), 0);
    if (!pages) throw new Error("Empty document");
    return pages;
  } catch {
    throw new Error(`PDF cannot be read. Use an unencrypted, valid PDF with 1–${MAX_PDF_PAGES} pages.`);
  }
}
