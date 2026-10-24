/** Only fixed categories/codes are logged. Never log raw messages, stacks or request data. */
export function accountFailureDiagnostic(stage:"handler"|"better-auth",error:unknown){
 const result:{event:string;stage:string;category:string;code?:string;providerStatus?:number}={event:"account_failure",stage,category:"unexpected"};
 const seen=new Set<unknown>();
 function inspect(value:unknown,depth=0){
  if(!value||typeof value!=="object"||depth>4||seen.has(value))return;
  seen.add(value);
  if(Array.isArray(value)){for(const item of value.slice(0,10))inspect(item,depth+1);return;}
  const item=value as {code?:unknown;errorCode?:unknown;name?:unknown;message?:unknown;providerStatus?:unknown;cause?:unknown};
  const code=item.code??item.errorCode;
  if(typeof code==="string"&&/^P\d{4}$/.test(code)){result.category="database";result.code=code;}
  else if(typeof item.name==="string"&&["PrismaClientInitializationError","PrismaClientValidationError","PrismaClientKnownRequestError","PrismaClientUnknownRequestError"].includes(item.name)){result.category="database";}
  if(item.message==="ACCOUNT_EMAIL_NOT_CONFIGURED"||item.message==="ACCOUNT_EMAIL_DELIVERY_FAILED"){
   result.category="email";result.code=item.message;
   if(typeof item.providerStatus==="number"&&Number.isInteger(item.providerStatus)&&item.providerStatus>=400&&item.providerStatus<=599)result.providerStatus=item.providerStatus;
  }
  inspect(item.cause,depth+1);
 }
 inspect(error);return result;
}
export function logAccountFailure(stage:"handler"|"better-auth",error:unknown){console.error(JSON.stringify(accountFailureDiagnostic(stage,error)));}
