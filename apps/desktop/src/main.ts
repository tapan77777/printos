import { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, Tray, nativeImage, utilityProcess, dialog, safeStorage } from "electron";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {CredentialVault,type StoredCredential} from "./credentialVault";
import {DesktopPairing,PairingFailure} from "./pairingClient";
import {createHash} from "node:crypto";
import {verifyRenderer,type Renderer} from "./liveSetup";
import type {LiveBootstrap} from "./liveWorker";
import QRCode from "qrcode";
import { cloudOrigin, allowNavigation, privateDocumentGrant, privatePreviewRequest, validateConfig, validLocalSender, type LocalConfig } from "./policy";
import { Supervisor, type Worker } from "./supervisor";

let win: BrowserWindow; let remote: WebContentsView | undefined; let tray: Tray | undefined;
let config: LocalConfig={version:1}; let quitting=false; let readyToQuit=false;
let cloudState="Not connected"; let fetching=false;
let cloudPrinters: {name:string;deviceId:string;status:string;simulationOnly:boolean;shopId?:string}[]=[];
const localUrl=pathToFileURL(path.join(__dirname,"../ui/index.html")).href;
const agentRoot=()=>app.isPackaged?path.join(process.resourcesPath,"agent"):path.resolve(__dirname,"../resources/agent");
const configFile=()=>path.join(app.getPath("userData"),"desktop-config.json");
const cloudSession=()=>session.fromPartition("persist:printos-cloud-v1");
let supervisor: Supervisor;
let pairing: DesktopPairing;
let liveBootstrap:LiveBootstrap|undefined;let renderer:Renderer|undefined;
const safeMessage=(message:string)=>{if(win&&!win.isDestroyed())win.webContents.send("desktop:notice",message);};
function state(){return {config,platform:process.platform,packaged:app.isPackaged,cloudState,cloudPrinters,agent:supervisor.health,pairing:{state:"unpaired"},printingEnabled:supervisor.health.state==="live",rendererConfigured:!!renderer};}
async function save(next:LocalConfig){
 const checked=validateConfig(next,app.isPackaged);
 await mkdir(app.getPath("userData"),{recursive:true,mode:0o700});
 const temp=`${configFile()}.tmp`;await writeFile(temp,JSON.stringify(checked),{mode:0o600});await rename(temp,configFile());config=checked;
}
function showSetup(){if(remote){win.contentView.removeChildView(remote);remote.webContents.close();remote=undefined;}win.show();win.focus();}
function remoteSecurity(contents: Electron.WebContents){
 contents.setWindowOpenHandler(({url})=>{
  if(config.origin && allowNavigation(url,config.origin) && /^\/api\/jobs\/[^/]+\/file$/.test(new URL(url).pathname)) preview(url);
  return {action:"deny"};
 });
 contents.on("will-navigate",(event,url)=>{if(!config.origin||!allowNavigation(url,config.origin))event.preventDefault();});
 contents.on("will-redirect",(event,url)=>{if(!config.origin||!allowNavigation(url,config.origin))event.preventDefault();});
 contents.on("will-attach-webview",event=>event.preventDefault());
}
async function preview(url:string){
 try{
  if(!config.origin||!allowNavigation(url,config.origin))throw Error();
  const response=await cloudSession().fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{'x-printos-download':'manifest-v1'}});
  if(!response.ok){await response.body?.cancel();throw Error();}
  let destination=url;let grant=false;
  if(response.headers.get('content-type')?.includes('application/json')){
   const reader=response.body?.getReader();if(!reader)throw Error();const chunks:Uint8Array[]=[];let length=0;
   try{for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>32768)throw Error();chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   destination=privateDocumentGrant(JSON.parse(Buffer.concat(chunks).toString()));grant=true;
  }else{await response.body?.cancel();}
  // Private grants use an ephemeral session without cloud cookies or preload.
  const ss=grant?session.fromPartition('printos-preview-'+Date.now()+'-'+Math.random()):cloudSession();
  if(grant){ss.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ss.setPermissionCheckHandler(()=>false);ss.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!privatePreviewRequest(details.url,details.method,destination)}));ss.on('will-download',event=>event.preventDefault());}
  const w=new BrowserWindow({width:900,height:800,title:'PrintOS · Document preview',parent:win,webPreferences:{session:ss,nodeIntegration:false,contextIsolation:true,sandbox:true,plugins:true,webSecurity:true}});
  if(grant){w.webContents.on('will-navigate',(event,next)=>{if(next!==destination)event.preventDefault();});w.webContents.on('will-redirect',(event,next)=>{if(next!==destination)event.preventDefault();});w.webContents.on('will-attach-webview',event=>event.preventDefault());w.on('closed',()=>{void ss.clearStorageData();});}else remoteSecurity(w.webContents);
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));await w.loadURL(destination);
 }catch{safeMessage('The document preview could not be loaded. Check your session and document retention status.');}
}
function bounds(){if(remote){const [width,height]=win.getContentSize();remote.setBounds({x:0,y:132,width,height:Math.max(0,height-132)});}}
async function openCloud(route:string){
 const requested=config.origin?new URL(route,config.origin):null;
 if(!config.origin || !requested || requested.origin!==config.origin || !["/login","/register","/recover","/reset-password","/shops","/dashboard","/dashboard/jobs","/dashboard/reports","/dashboard/devices", "/dashboard/pricing"].includes(requested.pathname))throw Error("Connect a PrintOS cloud backend first.");
 if(!remote){
  remote=new WebContentsView({webPreferences:{session:cloudSession(),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,plugins:true}});
  remoteSecurity(remote.webContents);win.contentView.addChildView(remote);bounds();
  remote.webContents.on("render-process-gone",()=>{showSetup();safeMessage("The dashboard view stopped unexpectedly. Reopen it to reconnect; diagnostics remain separate.");});
  remote.webContents.on("did-fail-load",(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){cloudState="Cloud unavailable";showSetup();safeMessage("Couldn’t reach the cloud dashboard. Check your connection, then try again.");}});
 }
 const contents=remote.webContents;
 let timer:ReturnType<typeof setTimeout> | undefined;
 try {
  await Promise.race([contents.loadURL(config.origin+route),new Promise<never>((_resolve,reject)=>{
   timer=setTimeout(()=>{if(!contents.isDestroyed())contents.stop();reject(Error("Couldn’t reach the cloud dashboard within 15 seconds. Try again when connected."));},15000);
  })]);
  win.show();
 }catch{
  cloudState="Cloud unavailable";showSetup();throw Error("Couldn’t load the cloud dashboard. Check your connection and try again.");
 }finally{if(timer)clearTimeout(timer);}
}
async function printersFromCloud(){
 if(!config.origin)throw Error("Configure your cloud address first.");
 if(fetching)throw Error("A connection check is already running.");fetching=true;
 try{
  const response=await cloudSession().fetch(config.origin+"/api/admin/printers",{method:"GET",redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!response.ok){await response.body?.cancel();cloudPrinters=[];cloudState=response.status===401?"Sign in required":"Cloud unavailable";throw Error("Sign in through the PrintOS window, then check the connection again.");}
  const reader=response.body?.getReader();if(!reader)throw Error();
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const item=await reader.read();if(item.done)break;length+=item.value.length;if(length>256*1024)throw Error();chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const rows=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!Array.isArray(rows)||rows.length>1000)throw Error();
  cloudPrinters=rows.map((r:Record<string,unknown>)=>{
   if(typeof r.name!=="string"||r.name.length>128||typeof r.deviceId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(r.deviceId)||typeof r.simulationOnly!=="boolean")throw Error();
   return {shopId:typeof r.shopId==='string'?r.shopId:undefined,name:r.name,deviceId:r.deviceId,status:r.status==="ONLINE"?"ONLINE":"OFFLINE",simulationOnly:r.simulationOnly};
  });cloudState="Owner access verified at last check · single workspace";return cloudPrinters;
 }catch(error){if(!(error instanceof Error && error.message.startsWith("Sign in through"))){cloudState="Cloud check failed";cloudPrinters=[];throw Error("Couldn’t verify owner access. Check the cloud connection and sign in again.");}throw error;}
 finally{fetching=false;}
}
async function discover(){
 if(process.platform!=="win32")throw Error("Windows discovery will be available on a Windows computer. No printers are simulated here.");
 const {PowerShellSpooler}=require(path.join(agentRoot(),"dist/adapters/WindowsSpooler.js"));return new PowerShellSpooler().printers();
}
async function deviceRequest(route:string,body?:unknown,credential?:StoredCredential){
 if(!config.origin||!/^\/api\/devices(?:\/|$)/.test(route))throw new PairingFailure("Device endpoint unavailable.");
 const response=await cloudSession().fetch(config.origin+route,{method:body?"POST":"GET",redirect:"error",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/json",...(credential?{Authorization:`Bearer ${credential.token}`,"x-printos-agent":credential.deviceId}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const reader=response.body?.getReader();if(!reader)throw new PairingFailure("Empty device response.");const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const data=await reader.read();if(data.done)break;size+=data.value.length;if(size>32768)throw Error();chunks.push(data.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!response.ok)throw new PairingFailure(response.status===401?"Device access was denied or revoked. Sign in and review your paired devices.":response.status===409?(route.includes("/pairing/")?"Pairing was already consumed or the printer is paired. Inspect and revoke any unconfirmed device before starting again.":"Device setup conflicts with current configuration or active attempts. Stop processing and inspect jobs before changing it."):response.status===503?"Device enrollment is unavailable until configuration and the new migration are approved.":"Device request failed. Review the pairing in the cloud and try again.",response.status);
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new PairingFailure("Invalid device response.");}
}
function registerIpc(){
 ipcMain.handle("desktop:request",async(event,action:unknown,payload:unknown)=>{
  if(!validLocalSender(event.sender.id,win.webContents.id,event.senderFrame?.url??"",localUrl,event.senderFrame===win.webContents.mainFrame))throw Error("Untrusted desktop sender");
  try{
   switch(action){
    case "state":return {ok:true,data:{...state(),pairing:await pairing.summary()}};
    case "pair-begin":{const input=payload as {label?:unknown;mode?:unknown}|null;if(!input)throw new PairingFailure("Pairing details required.");if(input.mode==="windows"&&process.platform!=="win32")throw new PairingFailure("Windows pairing requires a Windows computer. Use explicit simulation mode on macOS.");return {ok:true,data:await pairing.begin(input.label,input.mode)};}
    case "pair-forget":await supervisor.stop();liveBootstrap=undefined;return {ok:true,data:await pairing.forgetRevoked()};
    case "pair-check":return {ok:true,data:await pairing.check()};
    case "pair-review":{const summary=await pairing.summary();if(!summary.challengeId)throw new PairingFailure("Start pairing first.");await openCloud("/dashboard/devices?pair="+encodeURIComponent(summary.challengeId));return {ok:true};}
    case "origin":{
     if(["live","starting","stopping"].includes(supervisor.health.state))throw Error("Stop processing before changing the cloud");
     const origin=cloudOrigin(payload,app.isPackaged);
     if(config.origin && origin!==config.origin){const current=await pairing.summary();if(current.state!=="unpaired"&&current.state!=="secure-storage-unavailable")throw new PairingFailure("This profile has a pairing bound to its cloud origin. Review/revoke it before using a separate development profile for another cloud.");showSetup();await cloudSession().clearStorageData();cloudPrinters=[];cloudState="Not connected";}
     await save({...config,origin});return {ok:true,data:state()};
    }
    case "navigate":await openCloud(String(payload));return {ok:true};
    case "setup":showSetup();return {ok:true};
    case "cloud-printers":return {ok:true,data:await printersFromCloud()};
    case "discover":return {ok:true,data:await discover()};
    case "select":{
     if(["live","starting","stopping"].includes(supervisor.health.state))throw Error("Stop processing before changing the printer");
     if(typeof payload!=="string")throw Error("Choose a discovered Windows printer.");
     const candidates=(await discover()).filter((p:{identifier:string})=>p.identifier===payload);
     if(candidates.length!==1)throw Error("That printer is no longer uniquely available. Discover printers again.");
     await save({...config,printer:{name:candidates[0].name,identifier:candidates[0].identifier}});return {ok:true,data:state()};
    }
    case "qr":{
     // Recheck authenticated registry; no arbitrary URL encoder or unauthenticated local device binding.
     const rows=await printersFromCloud();const printer=rows.find(p=>p.deviceId===payload&&!p.simulationOnly);
     if(!printer)throw Error("Choose an existing non-simulation cloud printer.");
     const url=config.origin+"/p/"+encodeURIComponent(printer.deviceId);
     return {ok:true,data:{url,dataUrl:await QRCode.toDataURL(url,{width:320,margin:3,errorCorrectionLevel:"M"})}};
    }
    case "save-qr":{
     const rows=await printersFromCloud();const printer=rows.find(p=>p.deviceId===payload&&!p.simulationOnly);if(!printer)throw Error("Choose a verified cloud printer.");
     const png=await QRCode.toBuffer(config.origin+"/p/"+encodeURIComponent(printer.deviceId),{width:960,margin:4,errorCorrectionLevel:"M"});
     const result=await dialog.showSaveDialog(win,{title:"Save customer QR code",defaultPath:"PrintOS-customer-QR.png",filters:[{name:"PNG image",extensions:["png"]}]});
     if(!result.canceled&&result.filePath)await writeFile(result.filePath,png);return {ok:true,data:{saved:!result.canceled}};
    }
    case "renderer-select":{
     if(process.platform!=='win32')throw Error('Renderer configuration requires Windows');if(typeof payload!=='string'||!/^[a-f0-9]{64}$/.test(payload))throw Error('Enter the independently verified renderer SHA-256');
     if(['live','starting','stopping'].includes(supervisor.health.state))throw Error('Stop the worker before configuring the renderer');const result=await dialog.showOpenDialog(win,{title:'Select your trusted SumatraPDF executable',properties:['openFile'],filters:[{name:'Windows executable',extensions:['exe']}]});if(result.canceled)return {ok:true,data:{configured:false}};
     const {rendererVersion}=require(path.join(agentRoot(),'dist/adapters/WindowsVersion.js'));renderer=await verifyRenderer(result.filePaths[0],payload,rendererVersion);await writeFile(path.join(app.getPath('userData'),'renderer.json'),JSON.stringify(renderer),{mode:0o600});return {ok:true,data:{configured:true}};
    }
    case "agent-prepare":{
     if(['live','starting','diagnostic','stopping'].includes(supervisor.health.state))throw Error('Stop the current worker first');const {credential}=await pairing.credentials();let identifier:string;
     if(credential.mode==='mock')identifier=createHash('sha256').update('mock:'+credential.printerDeviceId).digest('hex');else{if(process.platform!=='win32'||!config.printer||!renderer)throw Error('Select a Windows queue and configure a qualified renderer');const {WindowsPrintDevice}=require(path.join(agentRoot(),'dist/adapters/WindowsPrintDevice.js'));const {PowerShellSpooler}=require(path.join(agentRoot(),'dist/adapters/WindowsSpooler.js'));const {rendererVersion}=require(path.join(agentRoot(),'dist/adapters/WindowsVersion.js'));renderer=await verifyRenderer(renderer.file,renderer.sha256,rendererVersion);const device=new WindowsPrintDevice(config.printer,new PowerShellSpooler(),renderer);if((await device.getPrinterStatus()).available!==true)throw Error('The selected printer is not currently available');identifier=config.printer.identifier;}
     await pairing.configure({printerIdentifier:identifier,rendererSha256:credential.mode==='mock'?null:renderer!.sha256});return {ok:true,data:{prepared:true}};
    }
    case "agent-start":{
     if(['live','starting','diagnostic','stopping','blocked'].includes(supervisor.health.state))throw Error('Stop diagnostics or review blocked recovery state first');const identity=await pairing.credentials();if(process.env.PRINTOS_DESKTOP_REVIEW==='1'&&identity.credential.mode!=='mock')throw Error('Physical mode is forbidden in review');const status=await pairing.deviceStatus();if(status.processingEnabled!==true)throw Error('Owner must explicitly enable this device in Devices & printers');const id=identity.credential.mode==='mock'?createHash('sha256').update('mock:'+identity.credential.printerDeviceId).digest('hex'):config.printer?.identifier;if(status.localPrinterIdentifier!==id)throw Error('Prepare the selected printer again before starting');
     if(identity.credential.mode==='windows'){if(process.platform!=='win32'||!renderer||status.rendererSha256!==renderer.sha256)throw Error('Qualified Windows renderer required');const {rendererVersion}=require(path.join(agentRoot(),'dist/adapters/WindowsVersion.js'));await verifyRenderer(renderer.file,renderer.sha256,rendererVersion);}
     liveBootstrap={...identity,printer:config.printer,renderer,stateDirectory:path.join(app.getPath('userData'),'agent',identity.credential.deviceId)};supervisor.startLive();return {ok:true};
    }
    case "agent-stop":await supervisor.stop();liveBootstrap=undefined;return {ok:true};
    case "onboarding-check":{await printersFromCloud();if(!config.origin)throw Error();const response=await cloudSession().fetch(config.origin+'/api/admin/pricing',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok){await response.body?.cancel();throw Error('Select a shop and check pricing in the dashboard');}const bytes=await response.text();if(bytes.length>16384)throw Error('Pricing response too large');const result=JSON.parse(bytes);const pair=await pairing.summary();if(pair.deviceId&&(!cloudPrinters.some(p=>p.deviceId===pair.printerDeviceId&&(!p.shopId||p.shopId===pair.shopId))||(result.card&&result.card.shopId!==pair.shopId)))throw Error('Select the shop matching this paired device');return {ok:true,data:{pricesConfigured:!!result.card,paired:(await pairing.summary()).state==='credential-stored'}};}
    case "diagnostic-start":supervisor.startDiagnostic();return {ok:true,data:state()};
    case "diagnostic-stop":await supervisor.stop();return {ok:true,data:state()};
    default:throw Error("This desktop action is unavailable.");
   }
  }catch(error){return {ok:false,error:error instanceof PairingFailure?error.message:error instanceof Error&&/^(Enter |Use |HTTPS |Packaged |Connect |Configure |A connection |Sign in |Couldn’t |Windows discovery |Choose |That printer |This desktop|Select |Stop |Owner |Qualified |Prepare |Publish |The selected |Renderer |Physical |Confirmed)/.test(error.message)?error.message:"Desktop setup could not complete. Review your connection and try again."};}
 });
}
async function boot(){
 if(!app.isPackaged && process.env.PRINTOS_DESKTOP_REVIEW==="1" && process.env.PRINTOS_DESKTOP_REVIEW_DIR){
  const dir=path.resolve(process.env.PRINTOS_DESKTOP_REVIEW_DIR);
  if(!dir.startsWith(path.resolve(app.getPath("temp"))+path.sep))throw Error("REVIEW_DIRECTORY_MUST_BE_TEMPORARY");
  await mkdir(dir,{recursive:true,mode:0o700});app.setPath("userData",dir);
 }
 if(!app.requestSingleInstanceLock()){app.quit();return;}
 app.on("second-instance",()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 await app.whenReady();
 try{config=validateConfig(JSON.parse(await readFile(configFile(),"utf8")),app.isPackaged);}catch{/* Start safely with unconfigured local state. */}
 pairing=new DesktopPairing(new CredentialVault(path.join(app.getPath("userData"),"device-identity.enc"),{
  available:async()=>{if(process.platform==="linux"&&safeStorage.getSelectedStorageBackend()==="basic_text")return false;return safeStorage.isAsyncEncryptionAvailable();},
  encrypt:text=>safeStorage.encryptStringAsync(text),decrypt:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result
 }),()=>config.origin,deviceRequest);
 try{const stored=JSON.parse(await readFile(path.join(app.getPath('userData'),'renderer.json'),'utf8'));if(typeof stored.file==='string'&&/^[a-f0-9]{64}$/.test(stored.sha256))renderer=stored;}catch{/* configured explicitly on Windows */}
 const ss=cloudSession();ss.setPermissionRequestHandler((_w,_p,callback)=>callback(false));ss.setPermissionCheckHandler(()=>false);
 ss.on("will-download",event=>event.preventDefault());
 ss.webRequest.onBeforeRequest((details,callback)=>{
  const u=new URL(details.url);const allowed=config.origin && u.origin===config.origin;
  if(u.origin===config.origin && u.pathname==='/api/account-auth/sign-out' && details.method==='POST'){void supervisor.stop();liveBootstrap=undefined;}
  const safeReview=process.env.PRINTOS_DESKTOP_REVIEW!=="1"||details.method==="GET";
  callback({cancel:!allowed||!safeReview});
 });
 supervisor=new Supervisor((mode)=>{const child=utilityProcess.fork(path.join(__dirname,"worker.js"),[],{
  serviceName:mode==='live'?"PrintOS print agent":"PrintOS isolated diagnostics",stdio:"ignore",env:{SystemRoot:process.env.SystemRoot??"",TEMP:app.getPath("temp"),TMP:app.getPath("temp"),
   PRINTOS_DESKTOP_WORKER:mode??"diagnostic",PRINTOS_AGENT_ROOT:agentRoot(),PRINTOS_DIAGNOSTIC_STATE:path.join(app.getPath("userData"),"diagnostics-journal")}
 }) as unknown as Worker;if(mode==='live'){if(!liveBootstrap)throw Error('Live bootstrap missing');child.postMessage({type:'bootstrap',input:liveBootstrap});}return child;});
 win=new BrowserWindow({width:1280,height:900,minWidth:820,minHeight:640,title:"PrintOS",backgroundColor:"#F8FAFC",show:false,icon:path.join(__dirname,"../ui/icon.png"),
  webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:"deny"}));win.webContents.on("will-navigate",event=>event.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 win.on("resize",bounds);win.on("close",event=>{if(!quitting){event.preventDefault();win.hide();}});
 win.once("ready-to-show",()=>win.show());
 registerIpc();await win.loadURL(localUrl);
 const image=nativeImage.createFromPath(path.join(__dirname,"../ui/icon.png")).resize({width:20,height:20});
 tray=new Tray(image);tray.setToolTip("PrintOS · Printing disabled");
 tray.setContextMenu(Menu.buildFromTemplate([{label:"Open PrintOS",click:()=>win.show()},{label:"Printer setup & diagnostics",click:showSetup},{type:"separator"},{label:"Processing stopped until explicit Start",enabled:false},{label:"Exit PrintOS safely",click:()=>app.quit()}]));
 let previousTrayState='';const trayTimer=setInterval(()=>{if(!tray||tray.isDestroyed()||previousTrayState===supervisor.health.state)return;previousTrayState=supervisor.health.state;const live=previousTrayState==='live';tray.setToolTip(live?'PrintOS · Approved jobs may print':'PrintOS · '+previousTrayState);tray.setContextMenu(Menu.buildFromTemplate([{label:'Open PrintOS',click:()=>win.show()},{label:live?'Processing running':'Processing '+previousTrayState,enabled:false},{label:'Stop safely',click:()=>{void supervisor.stop();liveBootstrap=undefined;}},{label:'Exit PrintOS safely',click:()=>app.quit()}]));},2000);
 tray.on("double-click",()=>win.show());
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:"PrintOS",submenu:[{label:"Open dashboard",click:()=>void openCloud("/dashboard/jobs").catch(()=>showSetup())},{label:"Printer setup",click:showSetup},{type:"separator"},{label:"Exit safely",click:()=>app.quit()}]},{label:"Edit",submenu:[{role:"undo"},{role:"redo"},{type:"separator"},{role:"cut"},{role:"copy"},{role:"paste"},{role:"selectAll"}]},{label:"Window",submenu:[{role:"minimize"},{role:"zoom"}]}]));
 app.on("activate",()=>win.show());
 app.on("before-quit",event=>{
  if(readyToQuit)return;event.preventDefault();if(quitting)return;quitting=true;
  safeMessage("Closing the diagnostic journal safely…");
  void supervisor.stop().then(()=>{readyToQuit=true;clearInterval(trayTimer);tray?.destroy();app.quit();});
 });
 app.on("window-all-closed",()=>{/* Tray process deliberately remains active until explicit safe exit. */});
}
boot().catch(()=>{console.error("PRINTOS_DESKTOP_STARTUP_FAILED");app.exit(1);});
