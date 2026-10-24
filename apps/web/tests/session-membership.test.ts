import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({session:vi.fn(),member:vi.fn()}));
vi.mock("@/lib/auth",()=>({getAuth:()=>({api:{getSession:m.session}})}));
vi.mock("@/lib/prisma",()=>({prisma:{member:{findUnique:m.member}}}));
import {getOwnerFromRequest,resolveOwner,encodeSession} from "../lib/session";
beforeEach(()=>{vi.stubEnv("PRINTOS_AUTH_MODE","tenant");vi.stubEnv("BETTER_AUTH_URL","https://print.example");m.session.mockReset();m.member.mockReset();m.session.mockResolvedValue({user:{id:"user",emailVerified:true},session:{activeOrganizationId:"shop-a"}});m.member.mockResolvedValue({userId:"user",organizationId:"shop-a",role:"owner"});});
it("scope comes from a live session and current membership, never a supplied shop parameter",async()=>{
 const req=new NextRequest("https://print.example/api/admin/printers?shopId=shop-b",{headers:{"x-shop-id":"shop-b"}});expect(await getOwnerFromRequest(req)).toEqual({userId:"user",shopId:"shop-a",role:"owner"});expect(m.member).toHaveBeenCalledWith({where:{organizationId_userId:{organizationId:"shop-a",userId:"user"}}});
});
it("membership removal, expired/revoked sessions and unverified email fail closed",async()=>{
 m.member.mockResolvedValue(null);expect(await resolveOwner(new Headers())).toBeNull();m.session.mockResolvedValue(null);expect(await resolveOwner(new Headers())).toBeNull();m.session.mockResolvedValue({user:{id:"user",emailVerified:false},session:{activeOrganizationId:"shop-a"}});expect(await resolveOwner(new Headers())).toBeNull();
});
it("staff has only its actual membership role and legacy HMAC cookies grant no access",async()=>{
 m.member.mockResolvedValue({userId:"user",organizationId:"shop-a",role:"staff"});expect((await resolveOwner(new Headers()))?.role).toBe("staff");m.session.mockResolvedValue(null);vi.stubEnv("SESSION_SECRET","fixture-secret-".repeat(4));const legacy=encodeSession({role:"owner"});expect(await getOwnerFromRequest(new NextRequest("https://print.example/api/admin/printers",{headers:{cookie:`printos_session=${legacy}`}}))).toBeNull();
});
it("cookie-authenticated mutations require the configured same Origin",async()=>{
 for(const origin of [undefined,"https://evil.example"]){const req=new NextRequest("https://print.example/api/admin/printers",{method:"POST",headers:origin?{origin}:{}});expect(await getOwnerFromRequest(req)).toBeNull();}
 expect(await getOwnerFromRequest(new NextRequest("https://print.example/api/admin/printers",{method:"POST",headers:{origin:"https://print.example"}}))).not.toBeNull();
});
