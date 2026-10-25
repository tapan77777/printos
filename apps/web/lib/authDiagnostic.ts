const prismaClasses=["PrismaClientInitializationError","PrismaClientValidationError","PrismaClientKnownRequestError","PrismaClientUnknownRequestError","PrismaClientRustPanicError"] as const;
const codeSubtypes:Record<string,string>={P1000:"database_authentication_failed",P1001:"database_unreachable",P1002:"database_connection_timeout",P1003:"database_missing",P1010:"database_access_denied",P1011:"tls_connection_failed",P1012:"schema_configuration_invalid",P1013:"database_url_invalid",P1017:"database_connection_closed",P2002:"unique_constraint_failed",P2003:"foreign_key_failed",P2021:"table_missing",P2022:"column_missing",P2024:"connection_pool_timeout"};
function prismaSubtype(exceptionClass:string|undefined,code:string|undefined,message:unknown){
 if(code&&codeSubtypes[code])return codeSubtypes[code];
 // Inspect text privately, but return only constant labels. No extracted text is emitted.
 const text=typeof message==="string"?message.slice(0,16384):"";
 if(exceptionClass==="PrismaClientInitializationError"){
  if(/could not locate the Query Engine|Query engine.*(?:not found|could not be found)|Unable to require.*query_engine/i.test(text))return "query_engine_missing";
  if(/Environment variable not found/i.test(text))return "database_url_missing";
  if(/(?:invalid|error validating) (?:the )?(?:datasource|database|connection).*url|URL must start|invalid port number in database URL/i.test(text))return "database_url_invalid";
  return "initialization_error";
 }
 if(exceptionClass==="PrismaClientValidationError"){
  if(/Argument [^\n]* is missing/i.test(text))return "argument_missing";
  if(/Unknown argument/i.test(text))return "argument_unknown";
  if(/Invalid value (?:provided )?for argument|Invalid argument type|Expected [^\n]*, provided/i.test(text))return "argument_type_mismatch";
  return "validation_error";
 }
 if(exceptionClass==="PrismaClientRustPanicError")return "query_engine_panic";
 if(exceptionClass==="PrismaClientUnknownRequestError")return "unknown_request_error";
 return "known_request_error";
}
/** Only fixed categories/codes are logged. Never log raw messages, stacks or request data. */
export function accountFailureDiagnostic(stage:"handler"|"better-auth",error:unknown){
 const result:{event:string;stage:string;category:string;code?:string;providerStatus?:number;exceptionClass?:string;subtype?:string}={event:"account_failure",stage,category:"unexpected"};
 const seen=new Set<unknown>();
 function inspect(value:unknown,depth=0){
  if(!value||typeof value!=="object"||depth>4||seen.has(value))return;
  seen.add(value);
  if(Array.isArray(value)){for(const item of value.slice(0,10))inspect(item,depth+1);return;}
  const item=value as {code?:unknown;errorCode?:unknown;name?:unknown;message?:unknown;providerStatus?:unknown;cause?:unknown};
  const code=item.code??item.errorCode;
  const exceptionClass=prismaClasses.find(name=>name===item.name);
  const prismaCode=typeof code==="string"&&/^P\d{4}$/.test(code)?code:undefined;
  if(prismaCode||exceptionClass){
   result.category="database";
   if(prismaCode)result.code=prismaCode;
   if(exceptionClass)result.exceptionClass=exceptionClass;
   result.subtype=prismaSubtype(exceptionClass,prismaCode,item.message);
  }
  if(item.message==="ACCOUNT_EMAIL_NOT_CONFIGURED"||item.message==="ACCOUNT_EMAIL_DELIVERY_FAILED"){
   result.category="email";result.code=item.message;
   if(typeof item.providerStatus==="number"&&Number.isInteger(item.providerStatus)&&item.providerStatus>=400&&item.providerStatus<=599)result.providerStatus=item.providerStatus;
  }
  inspect(item.cause,depth+1);
 }
 inspect(error);return result;
}
export function logAccountFailure(stage:"handler"|"better-auth",error:unknown){console.error(JSON.stringify(accountFailureDiagnostic(stage,error)));}
