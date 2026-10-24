import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({owner:vi.fn(),find:vi.fn(),update:vi.fn(),read:vi.fn(),printers:vi.fn()}));
vi.mock("@/lib/session",()=>({getOwnerFromRequest:m.owner}));
vi.mock("@/lib/prisma",()=>({prisma:{printJob:{findUnique:m.find,updateMany:m.update},printer:{findMany:m.printers}}}));
vi.mock("fs/promises",()=>({readFile:m.read}));
import {GET as file} from "../app/api/jobs/[id]/file/route";
import {POST as approve} from "../app/api/jobs/[id]/approve/route";
import {GET as printers,POST as createPrinter} from "../app/api/admin/printers/route";
import {POST as reconcile} from "../app/api/jobs/[id]/reconcile/route";
import {getAgentIdentity} from "../lib/agentAuth";
const request=(method="GET")=>new NextRequest("http://localhost/api/jobs/job/file?preview=1",{method,...(method==="POST"?{body:"{}",headers:{"Content-Type":"application/json"}}:{})});
beforeEach(()=>{vi.clearAllMocks();m.owner.mockResolvedValue({userId:"user",shopId:"a",role:"owner"});m.find.mockResolvedValue({id:"job",shopId:"b",printStatus:"QUEUED",fileId:"private.pdf"});m.update.mockResolvedValue({count:1});m.printers.mockResolvedValue([]);});
it("guessed cross-shop job IDs cannot authorize PDF reads or approval",async()=>{
 expect((await file(request(),{ params: Promise.resolve({ id: "job"}) })).status).toBe(404);expect(m.read).not.toHaveBeenCalled();
 expect((await approve(request("POST"),{ params: Promise.resolve({ id: "job"}) })).status).toBe(404);expect(m.update).not.toHaveBeenCalled();
});
it("legacy unassigned records are not adopted by authenticated tenants",async()=>{
 m.find.mockResolvedValue({id:"job",shopId:null,printStatus:"QUEUED",fileId:"legacy.pdf"});expect((await file(request(),{ params: Promise.resolve({ id: "job"}) })).status).toBe(404);
});
it("same-shop approval has tenant scope in both read and atomic mutation",async()=>{
 m.find.mockResolvedValue({id:"job",shopId:"a",printStatus:"QUEUED"});expect((await approve(request("POST"),{ params: Promise.resolve({ id: "job"}) })).status).toBe(200);
 expect(m.find).toHaveBeenCalledWith(expect.objectContaining({where:{id:"job",shopId:"a"}}));expect(m.update).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({shopId:"a"})}));
});
it("printer inventory is scoped; staff cannot create printers or reconcile physical outcomes",async()=>{
 await printers(request());expect(m.printers).toHaveBeenCalledWith(expect.objectContaining({where:{shopId:"a"}}));m.owner.mockResolvedValue({userId:"staff",shopId:"a",role:"staff"});expect((await createPrinter(request("POST"))).status).toBe(403);expect((await reconcile(request("POST"),{ params: Promise.resolve({ id: "job"}) })).status).toBe(403);
});
it("tenant mode refuses legacy global agent credentials",async()=>{
 vi.stubEnv("PRINTOS_AUTH_MODE","tenant");try{expect(await getAgentIdentity(request())).toBeNull();}finally{vi.unstubAllEnvs();}
});
