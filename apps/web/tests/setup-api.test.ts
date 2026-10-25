import {it,expect,vi,beforeEach} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({owner:null as any,update:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/session',()=>({getOwnerFromRequest:async()=>m.owner}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/setupService',()=>({readSetup:m.read,updateSetup:m.update}));
import {GET,POST} from '../app/api/admin/setup/route';
beforeEach(()=>{vi.clearAllMocks();m.owner=null;vi.stubEnv('BETTER_AUTH_URL','https://example.test');});
it('rejects signed-out and staff access without reading or changing setup',async()=>{
 const request=new NextRequest('https://example.test/api/admin/setup');expect((await GET(request)).status).toBe(401);m.owner={shopId:'a',role:'staff'};expect((await GET(request)).status).toBe(403);expect(m.read).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
});
it('always scopes mutations to the authenticated shop, ignoring a supplied shop identifier',async()=>{
 m.owner={shopId:'a',role:'owner'};m.update.mockResolvedValue({shopName:'Fixture',card:null,intake:null,orderingEnabled:false});
 const response=await POST(new NextRequest('https://example.test/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ordering',enabled:false,shopId:'other'})}));
 expect(response.status).toBe(200);expect(m.update).toHaveBeenCalledWith({},'a','ordering',false);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Server-Timing')).toContain('app;dur=');
});
