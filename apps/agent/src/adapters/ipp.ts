import http from "node:http";
/** Minimal read-only IPP Get-Job/Printer-Attributes. No Print-Job operation exists here. */
function attribute(tag: number, name: string, value: string) {
  const key = Buffer.from(name); const data = Buffer.from(value); const header = Buffer.alloc(3);
  header[0] = tag; header.writeUInt16BE(key.length, 1); const length = Buffer.alloc(2); length.writeUInt16BE(data.length);
  return Buffer.concat([header, key, length, data]);
}
export function ippRequest(operation: number, uri: string, requested: string[]): Buffer {
  const header = Buffer.from([2, 0, 0, operation, 0, 0, 0, 1, 1]);
  return Buffer.concat([header, attribute(0x47, "attributes-charset", "utf-8"), attribute(0x48, "attributes-natural-language", "en"), attribute(0x45, operation === 9 ? "job-uri" : "printer-uri", uri), ...requested.map((name, i) => attribute(0x44, i === 0 ? "requested-attributes" : "", name)), Buffer.from([3])]);
}
export function parseIpp(bytes: Buffer): Record<string, number | boolean | string | string[]> {
  if (bytes.length < 9 || bytes.readUInt16BE(2) > 0xff || bytes.readUInt32BE(4) !== 1) throw new Error("IPP_QUERY_FAILED");
  const values: Record<string, number | boolean | string | string[]> = Object.create(null);
  let offset = 8; let name = ""; let group = 0; let ended = false;
  while (offset < bytes.length) {
    const tag = bytes[offset++];
    if (tag === 3) { ended = true; break; }
    if (tag < 0x10) { group = tag; continue; }
    if (offset + 2 > bytes.length) throw new Error("IPP_QUERY_FAILED");
    const nameLength = bytes.readUInt16BE(offset); offset += 2;
    if (offset + nameLength + 2 > bytes.length) throw new Error("IPP_QUERY_FAILED");
    if (nameLength) name = bytes.subarray(offset, offset + nameLength).toString(); offset += nameLength;
    const length = bytes.readUInt16BE(offset); offset += 2;
    if (offset + length > bytes.length) throw new Error("IPP_QUERY_FAILED");
    const value = bytes.subarray(offset, offset + length); offset += length;
    if (![2, 4].includes(group)) continue;
    if ((tag === 0x21 || tag === 0x23) && length === 4) values[name] = value.readInt32BE();
    else if (tag === 0x22 && length === 1) values[name] = value[0] === 1;
    else if (tag >= 0x40) {
      const text = value.toString(); const previous = values[name];
      values[name] = nameLength || previous === undefined ? text : [...(Array.isArray(previous) ? previous : [String(previous)]), text];
    }
  }
  if (!ended) throw new Error("IPP_QUERY_FAILED");
  return values;
}
export async function queryIpp(resource: string, operation: number, requested: string[]) {
  const body = ippRequest(operation, `ipp://localhost${resource}`, requested);
  return new Promise<Record<string, number | boolean | string | string[]>>((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port: 631, path: resource, method: "POST", headers: { "Content-Type": "application/ipp", "Content-Length": body.length } }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 128 * 1024) request.destroy(new Error("IPP_QUERY_FAILED")); else chunks.push(chunk); });
      response.on("error", () => reject(new Error("IPP_QUERY_FAILED")));
      response.on("end", () => { try { if (response.statusCode !== 200) throw new Error(); resolve(parseIpp(Buffer.concat(chunks))); } catch { reject(new Error("IPP_QUERY_FAILED")); } });
    });
    const deadline = setTimeout(() => request.destroy(new Error("IPP_QUERY_TIMEOUT")), 5000);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", () => reject(new Error("IPP_QUERY_FAILED"))); request.end(body);
  });
}
