/** Account endpoints accept small JSON messages only, with bounded body consumption. */
export async function accountRequest(request:Request):Promise<Request|Response>{
 if(["GET","HEAD","OPTIONS"].includes(request.method))return request;
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return new Response("JSON required",{status:415});
 const reader=request.body?.getReader();if(!reader)return request;
 const chunks:Uint8Array[]=[];let size=0;let timer:ReturnType<typeof setTimeout>|undefined;
 const tooLarge=new Error("SIZE");const timeout=new Error("TIMEOUT");
 try{
  await Promise.race([(async()=>{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>16384)throw tooLarge;chunks.push(item.value);}})(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(timeout),10000);})]);
  // Next.js wraps incoming Requests. Passing that wrapper to the native Request
  // constructor can fail its private-field checks; copy explicit fields instead.
  return new Request(request.url,{method:request.method,headers:new Headers(request.headers),body:Buffer.concat(chunks),signal:request.signal});
 }catch(error){
  if(error===tooLarge)return new Response("Account request too large",{status:413});
  if(error===timeout)return new Response("Account request timed out",{status:408});
  return new Response("Account service unavailable. Please try again later.",{status:500});
 }
 finally{if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
