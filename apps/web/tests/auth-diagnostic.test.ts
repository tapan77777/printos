import {afterEach,expect,it,vi} from "vitest";
import {accountFailureDiagnostic,logAccountFailure} from "../lib/authDiagnostic";
import {sendAccountEmail} from "../lib/auth";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("records database codes without messages, metadata, URLs, users or credentials",()=>{
 const error=Object.assign(new Error("postgresql://user:private-password@host/db fixture@example.test"),{code:"P1001",meta:{secret:"private-secret"}});
 expect(accountFailureDiagnostic("handler",error)).toEqual({event:"account_failure",stage:"handler",category:"database",code:"P1001"});
 const log=vi.spyOn(console,"error").mockImplementation(()=>{});logAccountFailure("better-auth",[error]);
 expect(log).toHaveBeenCalledWith(JSON.stringify({event:"account_failure",stage:"better-auth",category:"database",code:"P1001"}));
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
