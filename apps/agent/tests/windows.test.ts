import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { WindowsPrintDevice, type WindowsPrinter, type WindowsSpoolJob } from "../src/adapters/WindowsPrintDevice";
import { PowerShellSpooler } from "../src/adapters/WindowsSpooler";
const attempt = "cba44b65-6c61-4cc3-a89a-8dd4e4181491";
const job = { id:"job",copies:3,colorMode:"COLOUR" as const,duplex:true,paperSize:"A4",pageRange:"1,3-5" };
function fixture() {
  const printer: WindowsPrinter = {name:"Office & ' $(bad)", identifier:"a".repeat(64),isDefault:true,available:true,color:true,duplex:true,maxCopies:99,papers:[9]};
  let jobs: WindowsSpoolJob[] = []; let calls = 0; let args: string[] = []; let fail = false;
  const device = new WindowsPrintDevice({name:printer.name,identifier:printer.identifier}, {async printers(){return [printer];},async jobs(){return jobs;}},
    {file:"trusted.exe",sha256:"approved"}, async (_file, argv) => {calls++;args=argv;if(fail)throw new Error("timeout");jobs=[{id:42,document:`${attempt}.pdf`,status:8}];return "";},async()=>{});
  return {device,printer,file:path.resolve(`${attempt}.pdf`),calls:()=>calls,args:()=>args,setJobs(v:WindowsSpoolJob[]){jobs=v;},fail(){fail=true;}};
}
test("discovery retains exact names, identity, default and capabilities",async()=>{const f=fixture();assert.deepEqual(await f.device.listPrinters(),[f.printer]);});
test("Windows submission uses one argument-vector call with all explicit settings",async()=>{
 const f=fixture();assert.deepEqual(await f.device.submitJob(job,f.file,attempt),{spoolId:"WIN-42"});assert.equal(f.calls(),1);
 assert.ok(f.args().includes(f.printer.name));assert.ok(f.args().includes("ignore-pdf-print-settings,fit,3x,color,duplexlong,paperkind=9,1,3-5"));
});
for (const change of [{copies:100},{copies:0},{paperSize:"A3"},{pageRange:"1,2;evil"},{pageRange:"4-2"}]) test(`unsupported setting ${JSON.stringify(change)} never invokes renderer`,async()=>{
 const f=fixture();await assert.rejects(f.device.submitJob({...job,...change},f.file,attempt));assert.equal(f.calls(),0);
});
test("unsupported color and duplex fail preflight",async()=>{const f=fixture();f.printer.color=false;await assert.rejects(f.device.validateJob(job));f.printer.color=true;f.printer.duplex=false;await assert.rejects(f.device.validateJob(job));});
test("all-page BW simplex options are explicit",async()=>{const f=fixture();await f.device.submitJob({...job,pageRange:"all",duplex:false,colorMode:"BW"},f.file,attempt);assert.ok(f.args().includes("ignore-pdf-print-settings,fit,3x,monochrome,simplex,paperkind=9"));});
test("disconnected and renamed printers cannot submit",async()=>{const f=fixture();f.printer.available=false;await assert.rejects(f.device.submitJob(job,f.file,attempt));f.printer.name="Renamed";assert.equal((await f.device.getPrinterStatus()).available,null);assert.equal(f.calls(),0);});
test("existing attempt title prevents a second renderer invocation",async()=>{const f=fixture();f.setJobs([{id:2,document:`${attempt}.pdf`,status:8}]);await assert.rejects(f.device.submitJob(job,f.file,attempt),/DUPLICATE/);assert.equal(f.calls(),0);});
test("renderer timeout is propagated without retry",async()=>{const f=fixture();f.fail();await assert.rejects(f.device.submitJob(job,f.file,attempt));assert.equal(f.calls(),1);});
for(const status of [2,4,32,64,128,256,1024,4096]) test(`spool status ${status} cannot prove physical completion`,async()=>{const f=fixture();f.setJobs([{id:42,document:`${attempt}.pdf`,status}]);assert.equal((await f.device.getJobStatus("WIN-42",attempt)).state,"unknown");});
test("missing or reused spool ID stays unknown",async()=>{const f=fixture();assert.equal((await f.device.getJobStatus("WIN-42",attempt)).state,"unknown");f.setJobs([{id:42,document:"other.pdf",status:128}]);assert.equal((await f.device.getJobStatus("WIN-42",attempt)).state,"unknown");});
test("query network interruption is unknown, recovery observes without submission",async()=>{
 let offline=true;const p=fixture().printer;const device=new WindowsPrintDevice({name:p.name,identifier:p.identifier},{async printers(){return [p];},async jobs(){if(offline)throw Error();return [{id:42,document:`${attempt}.pdf`,status:8}];}});
 assert.equal((await device.getJobStatus("WIN-42",attempt)).state,"unknown");offline=false;assert.equal((await device.getJobStatus("WIN-42",attempt)).state,"pending");
});
test("PowerShell bridge rejects execution on macOS without invoking process",async()=>{let calls=0;await assert.rejects(new PowerShellSpooler(async()=>{calls++;return "[]";},"darwin").printers());assert.equal(calls,0);});
test("PowerShell bridge validates untrusted output and uses fixed arguments",async()=>{
 let args:string[]=[];const bridge=new PowerShellSpooler(async(_f,a)=>{args=a;return '[{"id":1,"document":"safe","status":8}]';},"win32");await bridge.jobs("Office & $(bad)");assert.ok(args.includes("Office & $(bad)"));assert.ok(!args.includes("-Command"));
 await assert.rejects(new PowerShellSpooler(async()=>'{"bad":true}',"win32").printers());
});
test("ambiguous or disappearing spool entries never authorize inferred success",async()=>{
 for(const entries of [[],[{id:1,document:`${attempt}.pdf`,status:8},{id:2,document:`${attempt}.pdf`,status:8}]]){
  let calls=0;let submitted=false;const p=fixture().printer;
  const device=new WindowsPrintDevice({name:p.name,identifier:p.identifier},{async printers(){return [p];},async jobs(){return submitted?entries:[];}},
   {file:"mock.exe",sha256:"test"},async()=>{calls++;submitted=true;return "";},async()=>{});
  await assert.rejects(device.submitJob(job,path.resolve(`${attempt}.pdf`),attempt),/UNCERTAIN/);assert.equal(calls,1);
 }
});
test("untrusted renderer integrity failure prevents invocation",async()=>{
 const p=fixture().printer;let calls=0;
 const device=new WindowsPrintDevice({name:p.name,identifier:p.identifier},{async printers(){return [p];},async jobs(){return [];}},
 {file:path.resolve("not-installed.exe"),sha256:"b".repeat(64)},async()=>{calls++;return "";});
 await assert.rejects(device.validateJob(job));assert.equal(calls,0);
});
test("failed renderer preserves a uniquely observed spool ID for reconciliation",async()=>{
 const p=fixture().printer;let submitted=false;
 const device=new WindowsPrintDevice({name:p.name,identifier:p.identifier},{async printers(){return [p];},async jobs(){return submitted?[{id:42,document:`${attempt}.pdf`,status:2}]:[];}},
 {file:"mock.exe",sha256:"test"},async()=>{submitted=true;throw Error("timeout");},async()=>{});
 await assert.rejects(device.submitJob(job,path.resolve(`${attempt}.pdf`),attempt),(e:unknown)=> typeof e==="object" && e!==null && "spoolId" in e && e.spoolId==="WIN-42");
});
