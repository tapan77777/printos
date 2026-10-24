import { NextRequest } from "next/server";
import { MAX_UPLOAD_BYTES, parseOptions } from "./validate";
import { countPdfPages } from "./pdf";
import { createQuote } from "./pricing";

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readUploadQuote(req: NextRequest) {
  const {cloudDocuments}=await import('./privateStorage');
  if(cloudDocuments()){
    const {smallJson,documents}=await import('./documentHttp');
    const body=await smallJson(req);const form=new FormData();
    for(const field of ['copies','colorMode','paperSize','duplex','pageRange','quoteKey'])if(body[field]!==undefined)form.set(field,String(body[field]));
    return documents().upload(String(body.documentId??''),req.headers.get('x-printos-document-token')??'',String(body.printerId??''),form);
  }
  if(process.env.VERCEL||process.env.NODE_ENV==='production')throw new UploadError('Private cloud storage must be configured before uploads are enabled',503);
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES * 1.1) throw new UploadError("File too large", 413);
  const form = await req.formData().catch(() => null);
  if (!form) throw new UploadError("Invalid form data");
  const file = form.get("file");
  const printerId = String(form.get("printerId") ?? "").trim();
  if (!(file instanceof File) || !printerId) throw new UploadError("Missing file or printerId");
  if (!file.size) throw new UploadError("Empty file");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("File too large", 413);
  const opts = parseOptions(form);
  if (!opts.ok) throw new UploadError(opts.error);
  const bytes = Buffer.from(await file.arrayBuffer());
  let pageCount: number;
  try { pageCount = await countPdfPages(bytes); }
  catch (err) { throw new UploadError((err as Error).message, 415); }
  try {
    const quote = createQuote(opts.value, pageCount);
    return { submittedQuoteKey: String(form.get("quoteKey") ?? ""), bytes, printerId, options: { ...opts.value, pageRange: quote.pageRange }, quote };
  } catch (err) { throw new UploadError((err as Error).message); }
}
