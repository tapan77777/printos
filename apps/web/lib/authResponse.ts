/** Browser clients authenticate by HttpOnly cookie, never a bearer-token response. */
export async function accountResponse(response:Response):Promise<Response>{
 if(!response.body || (response.status>=300&&response.status<400))return response;
 if(!response.headers.get("content-type")?.includes("application/json"))return response;
 const payload:unknown=await response.json();
 function publicFields(value:unknown):unknown{
  if(Array.isArray(value))return value.map(publicFields);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key])=>!["token","accessToken","refreshToken","idToken","password","secret"].includes(key)).map(([key,v])=>[key,publicFields(v)]));
  return value;
 }
 const headers=new Headers(response.headers);headers.delete("content-length");headers.set("Cache-Control","private, no-store");
 return new Response(JSON.stringify(publicFields(payload)),{status:response.status,headers});
}
