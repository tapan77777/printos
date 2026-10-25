import {afterEach,expect,it,vi} from "vitest";
import {accountFailureDiagnostic,logAccountFailure} from "../lib/authDiagnostic";
import {sendAccountEmail} from "../lib/auth";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("records database codes without messages, metadata, URLs, users or credentials",()=>{
 const error=Object.assign(new Error("postgresql://user:private-password@host/db fixture@example.test"),{code:"P1001",meta:{secret:"private-secret"}});
 expect(accountFailureDiagnostic("handler",error)).toEqual({event:"account_failure",stage:"handler",category:"database",code:"P1001",subtype:"database_unreachable"});
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});logAccountFailure("better-auth",[error]);
 expect(log).toHaveBeenCalledWith(JSON.stringify({event:"account_failure",stage:"better-auth",category:"database",code:"P1001",subtype:"database_unreachable"}));
});
it("does not echo arbitrary codes or private error fields",()=>{
 expect(accountFailureDiagnostic("handler",{code:"private-token",name:"private-email",message:"private-value",stack:"private-stack"})).toEqual({event:"account_failure",stage:"handler",category:"unexpected"});
});
it("retains the email provider HTTP status without its response body or recipient",async()=>{
 vi.stubEnv("RESEND_API_KEY","fixture-only-key");vi.stubEnv("AUTH_EMAIL_FROM","fixture@example.test");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response('{"message":"private-provider-detail"}',{status:403})));
 try{await sendAccountEmail("recipient@example.test","Fixture","https://example.test/private-token");throw Error("Expected failure");}
 catch(error){expect(accountFailureDiagnostic("handler",error)).toEqual({event:"account_failure",stage:"handler",category:"email",code:"ACCOUNT_EMAIL_DELIVERY_FAILED",providerStatus:403});}
});
it("handles cyclic causes safely",()=>{
 const error:{cause?:unknown}={};error.cause=error;expect(accountFailureDiagnostic("handler",error).category).toBe("unexpected");
});
it.each([
 ["PrismaClientInitializationError",undefined,"Prisma Client could not locate the Query Engine for runtime private-runtime","query_engine_missing"],
 ["PrismaClientInitializationError",undefined,"Environment variable not found: PRIVATE_URL","database_url_missing"],
 ["PrismaClientInitializationError",undefined,"Error validating datasource `private`: the URL must start with postgresql://private","database_url_invalid"],
 ["PrismaClientInitializationError",undefined,"private diagnostic detail","initialization_error"],
 ["PrismaClientValidationError",undefined,"Argument `privateField` is missing.","argument_missing"],
 ["PrismaClientValidationError",undefined,"Unknown argument `privateField`.","argument_unknown"],
 ["PrismaClientValidationError",undefined,"Invalid value for argument `privateField`: private value","argument_type_mismatch"],
 ["PrismaClientValidationError",undefined,"private diagnostic detail","validation_error"],
 ["PrismaClientKnownRequestError","P2021","private table and SQL","table_missing"],
 ["PrismaClientUnknownRequestError",undefined,"private diagnostic detail","unknown_request_error"],
 ["PrismaClientRustPanicError",undefined,"private diagnostic detail","query_engine_panic"],
] as const)("retains allowlisted class %s and subtype without message fragments",(name,code,message,subtype)=>{
 const result=accountFailureDiagnostic("handler",{name,code,message,stack:"private-stack",meta:{query:"private-sql"}});
 expect(result).toEqual({event:"account_failure",stage:"handler",category:"database",exceptionClass:name,subtype,...(code?{code}:{})});
 expect(JSON.stringify(result)).not.toContain("private");
});
it.each([
 ["P1000","database_authentication_failed"],["P1001","database_unreachable"],["P1011","tls_connection_failed"],["P1013","database_url_invalid"],["P2022","column_missing"],["P2024","connection_pool_timeout"],
])("classifies safe Prisma code %s",(code,subtype)=>{
 expect(accountFailureDiagnostic("handler",{name:"PrismaClientInitializationError",errorCode:code,message:"postgresql://private:password@host/db"})).toMatchObject({exceptionClass:"PrismaClientInitializationError",code,subtype});
});
it("retains class and subtype from wrapped errors without printing nested context",()=>{
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});
 logAccountFailure("handler",{cause:Object.assign(new Error("Unknown argument `email` with fixture@example.test and private-password"),{name:"PrismaClientValidationError"}),request:{password:"private-password"}});
 expect(log).toHaveBeenCalledWith(JSON.stringify({event:"account_failure",stage:"handler",category:"database",exceptionClass:"PrismaClientValidationError",subtype:"argument_unknown"}));
});
