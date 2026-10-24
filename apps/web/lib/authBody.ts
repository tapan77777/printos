/** Account endpoints accept small JSON messages only, with bounded body consumption. */
export async function accountRequest(request:Request):Promise<Request|Response>{
 if(["GET","HEAD","OPTIONS"].includes(request.method))return request;
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return new Response("JSON required",{status:415});
 const reader=request.body?.getReader();if(!reader)return request;
 const chunks:Uint8Array[]=[];let size=0;let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await Promise.race([(async()=>{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>16384)throw Error("SIZE");chunks.push(item.value);}})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error("TIMEOUT")),10000);})]);
  return new Request(request,{body:Buffer.concat(chunks)});
 }catch(error){return new Response(error instanceof Error&&error.message==="SIZE"?"Account request too large":"Account request timed out",{status:error instanceof Error&&error.message==="SIZE"?413:408});}
 finally{if(timer)clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
