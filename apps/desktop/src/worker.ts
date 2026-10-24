import path from "node:path";
// The compiled shared core is staged outside ASAR; no production .env or credentials.
const root=process.env.PRINTOS_AGENT_ROOT;
const state=process.env.PRINTOS_DIAGNOSTIC_STATE;
if(!root || !state || !["diagnostic","live"].includes(process.env.PRINTOS_DESKTOP_WORKER??""))throw Error("DIAGNOSTIC_CONFIGURATION_REQUIRED");
const {Engine}=require(path.join(root,"dist/core/Engine.js"));
const {Journal}=require(path.join(root,"dist/core/Journal.js"));
const {MockPrintDevice}=require(path.join(root,"dist/MockPrintDevice.js"));
const port=process.parentPort;
if(!port)throw Error("SUPERVISOR_REQUIRED");
async function run(){
 const journal=new Journal(state,"desktop-diagnostic-no-cloud-v1");await journal.lock();
 const cloud={async recovery(){return [];},async claim(){return null;},async heartbeat(){},async event(){throw Error("DIAGNOSTIC_NO_JOBS");},async download(){throw Error("DIAGNOSTIC_NO_DOCUMENTS");}};
 const engine=new Engine(cloud,new MockPrintDevice(),journal);
 let stop=false;let wake:undefined|(()=>void);
 port!.on("message",({data}: {data:unknown})=>{if(data && typeof data==="object" && "type" in data && data.type==="stop"){stop=true;engine.stopping=true;wake?.();}});
 try{
  port!.postMessage({type:"ready"});
  while(!stop){await engine.tick();await new Promise<void>(resolve=>{const timer=setTimeout(resolve,1000);wake=()=>{clearTimeout(timer);resolve();};});}
 }finally{await journal.unlock();}
 process.exit(0);
}
if(process.env.PRINTOS_DESKTOP_WORKER==='live'){
 const control:{stop:boolean;engine?:{stopping:boolean}}={stop:false};let started=false;const {runLiveAgent}=require('./liveWorker');
 port.on('message',({data}:{data:any})=>{if(data?.type==='stop'){control.stop=true;if(control.engine)control.engine.stopping=true;return;}if(data?.type==='bootstrap'&&!started){started=true;void runLiveAgent(data.input,root,port,control).then(()=>process.exit(0)).catch(()=>{port.postMessage({type:'blocked'});process.exit(1);});}});
}else run().catch(()=>{port.postMessage({type:"error",code:"DIAGNOSTIC_JOURNAL_REQUIRES_INSPECTION"});process.exit(1);});
