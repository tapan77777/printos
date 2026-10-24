import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudClient } from "../src/core/CloudClient";
const attemptId = "cba44b65-6c61-4cc3-a89a-8dd4e4181491";
test("bounded reconnection retries reuse the identical idempotent request", async () => {
  const bodies: string[] = []; let calls = 0;
  const client = new CloudClient("http://localhost:3000", "test-agent", "test-token", { sleep: async () => {}, fetch: async (_url, init) => { bodies.push(init!.body as string); if (++calls < 3) throw new Error("disconnected"); return Response.json({ jobs: [] }); } });
  assert.equal(await client.claim(attemptId), null); assert.equal(calls, 3); assert.equal(new Set(bodies).size, 1);
});
test("authorization errors are not automatically retried", async () => {
  let calls = 0; const client = new CloudClient("http://localhost:3000", "test", "token", { fetch: async () => { calls++; return new Response(null, { status: 403 }); } });
  await assert.rejects(client.claim(attemptId)); assert.equal(calls, 1);
});
test("network requests time out and stop after the configured budget", async () => {
  let calls = 0;
  const client = new CloudClient("http://localhost:3000", "test", "token", { timeoutMs: 5, attempts: 2, sleep: async () => {}, fetch: async (_url, init) => { calls++; return new Promise((_resolve, reject) => { const timer = setTimeout(() => reject(new Error("timeout")), 15); init!.signal!.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }); }); } });
  await assert.rejects(client.claim(attemptId)); assert.equal(calls, 2);
});
test("non-loopback plaintext URLs and credential-bearing URLs fail closed", () => {
  assert.throws(() => new CloudClient("http://example.com", "test", "token"), /HTTPS_REQUIRED/);
  assert.throws(() => new CloudClient("https://user:password@example.com", "test", "token"));
});
test("wrong or expired submission acknowledgements fail closed", async () => {
  const client = new CloudClient("http://localhost:3000", "test", "token", { fetch: async () => Response.json({ acknowledged: true, attemptId, eventId: attemptId, printStatus: "PRINTING", leaseExpiresAt: "2000-01-01T00:00:00Z" }) });
  await assert.rejects(client.event("job", attemptId, { eventId: attemptId, operation: "authorize", printStatus: "PRINTING" }), /EXPIRED/);
});
test("download validation does not leak the server error body", async () => {
  const client = new CloudClient("http://localhost:3000", "test", "token", { fetch: async () => new Response("private-path-and-token", { status: 404 }) });
  await assert.rejects(client.download("job", attemptId), err => err instanceof Error && !err.message.includes("private"));
});
test("malformed lease timestamps cannot authorize a submission", async () => {
  const client = new CloudClient("http://localhost:3000", "test", "token", { fetch: async () => Response.json({ acknowledged: true, attemptId, eventId: attemptId, printStatus: "PRINTING", leaseExpiresAt: "not-a-date" }) });
  await assert.rejects(client.event("job", attemptId, { eventId: attemptId, operation: "authorize", printStatus: "PRINTING" }), /EXPIRED/);
});
test('private storage manifest downloads verify the server hash without forwarding credentials',async()=>{
 const {createHash}=await import('node:crypto');const bytes=Buffer.from('%PDF-fixture');let calls=0;const url='https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/printos-documents/objects/'+'a'.repeat(64)+'/b3714b56-8541-4a1b-8ae5-cd8f3d53e9bd.pdf?token=fixture';
 const client=new CloudClient('http://localhost:3000','agent','secret',{fetch:async(input,init)=>{if(++calls===1){assert.equal((init!.headers as any)['x-printos-download'],'manifest-v1');return Response.json({url,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,expiresAt:new Date(Date.now()+60000).toISOString()});}assert.equal(input,url);assert.equal(init!.headers,undefined);assert.equal(init!.redirect,'error');return new Response(bytes,{headers:{'Content-Type':'application/pdf'}});}});
 assert.deepEqual(await client.download('job',attemptId),bytes);assert.equal(calls,2);
});
test('private downloads reject expired or off-provider grants before any storage request',async()=>{
 for(const extra of [{url:'https://attacker.invalid/file'},{expiresAt:'2000-01-01T00:00:00Z'}]){let calls=0;const client=new CloudClient('http://localhost:3000','agent','secret',{fetch:async()=>{calls++;return Response.json({url:'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/docs/objects/'+'a'.repeat(64)+'/b3714b56-8541-4a1b-8ae5-cd8f3d53e9bd.pdf?token=fixture',sha256:'b'.repeat(64),sizeBytes:10,expiresAt:new Date(Date.now()+60000).toISOString(),...extra});}});await assert.rejects(client.download('job',attemptId),/INVALID_DOCUMENT_MANIFEST/);assert.equal(calls,1);}
});
test('a modified storage object never reaches the durable download stage',async()=>{
 let calls=0;const bytes=Buffer.from('%PDF-modified');const client=new CloudClient('http://localhost:3000','agent','secret',{fetch:async()=>++calls===1?Response.json({url:'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/docs/objects/'+'a'.repeat(64)+'/b3714b56-8541-4a1b-8ae5-cd8f3d53e9bd.pdf?token=fixture',sha256:'a'.repeat(64),sizeBytes:bytes.length,expiresAt:new Date(Date.now()+60000).toISOString()}):new Response(bytes,{headers:{'Content-Type':'application/pdf'}})});await assert.rejects(client.download('job',attemptId),/CHECKSUM/);
});
