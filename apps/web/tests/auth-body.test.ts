import {afterEach,describe,expect,it,vi} from "vitest";
import {accountRequest} from "../lib/authBody";
function streamed(body:ReadableStream<Uint8Array>){return new Request("https://example.test/api/account-auth/sign-up/email",{method:"POST",headers:{"Content-Type":"application/json"},body,duplex:"half"} as RequestInit);}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("account request errors",()=>{
 it("reserves 408 for the body-read deadline",async()=>{
  vi.useFakeTimers();const result=accountRequest(streamed(new ReadableStream({pull(){return new Promise(()=>{});}})));
  await vi.advanceTimersByTimeAsync(10000);expect((await result as Response).status).toBe(408);
 });
 it("returns generic 500 for stream failures, even errors named TIMEOUT or SIZE",async()=>{
  for(const message of ["TIMEOUT","SIZE","private diagnostic detail"]){
   const response=await accountRequest(streamed(new ReadableStream({start(controller){controller.error(new Error(message));}}))) as Response;
   expect(response.status).toBe(500);expect(await response.text()).toBe("Account service unavailable. Please try again later.");
  }
 });
 it("returns generic 500 if request reconstruction fails",async()=>{
  const request=new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
  vi.stubGlobal("Request",class {constructor(){throw new Error("private construction detail");}});
  const response=await accountRequest(request) as Response;
  expect(response.status).toBe(500);expect(await response.text()).toBe("Account service unavailable. Please try again later.");
 });
 it("retains the upload limit",async()=>{
  const response=await accountRequest(new Request("https://example.test",{method:"POST",headers:{"Content-Type":"application/json"},body:"x".repeat(16385)})) as Response;
  expect(response.status).toBe(413);
 });
});
