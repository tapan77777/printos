import {contextBridge,ipcRenderer} from "electron";
// Only the bundled local page receives this preload. The remote dashboard has none.
const actions=new Set(["state","origin","navigate","setup","cloud-printers","discover","select","qr","save-qr","diagnostic-start","diagnostic-stop","pair-begin","pair-check","pair-review","pair-forget","renderer-select","agent-prepare","agent-start","agent-stop","onboarding-check"]);
contextBridge.exposeInMainWorld("printos",Object.freeze({
 request:(action:string,payload?:unknown)=>{
  if(!actions.has(action))return Promise.resolve({ok:false,error:"Unavailable desktop action."});
  return ipcRenderer.invoke("desktop:request",action,payload);
 },
 onNotice:(callback:(message:string)=>void)=>{
  const handler=(_event:unknown,message:unknown)=>{if(typeof message==="string")callback(message);};
  ipcRenderer.on("desktop:notice",handler);return ()=>ipcRenderer.removeListener("desktop:notice",handler);
 }
}));
