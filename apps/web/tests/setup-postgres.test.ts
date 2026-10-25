import {it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {NextRequest} from 'next/server';
import {readSetup,updateSetup} from '../lib/setupService';
import {assertOrderingEnabled} from '../lib/ordering';
import {setupSettings} from '../lib/shopSetupState';
const access=vi.hoisted(()=>({owner:null as any}));
vi.mock('@/lib/session',()=>({getOwnerFromRequest:async()=>access.owner}));
const target=process.env.PRINTOS_DISPOSABLE_DATABASE;
it.skipIf(!target)('native PostgreSQL setup preserves existing records, serializes QR creation and fails closed until owner enables ordering',async()=>{
 const url=new URL(target!);if(url.hostname!=='localhost'||!url.searchParams.get('host')?.includes('printos-tenant-pg-'))throw Error('Disposable fixture database required');
 const db=new PrismaClient({datasources:{db:{url:target!}}});
 try{
  await db.organization.createMany({data:[{id:'setup-existing',name:'Existing shop',slug:'setup-existing'},{id:'setup-other',name:'Other shop',slug:'setup-other'}]});
  const printer=await db.printer.create({data:{id:'setup-old-printer',deviceId:'setup-old-printer',name:'Existing printer',shopId:'setup-existing'}});
  const job=await db.printJob.create({data:{id:'setup-old-job',printerId:printer.id,shopId:'setup-existing',fileId:'fixture-only.pdf',customerSessionId:'fixture-only-session',price:1234,printStatus:'QUEUED'}});
  const before=await db.organization.findUniqueOrThrow({where:{id:'setup-existing'}});
  expect((await readSetup(db,'setup-existing')).orderingEnabled).toBe(false);
  expect(await db.organization.findUniqueOrThrow({where:{id:'setup-existing'}})).toEqual(before);
  await expect(assertOrderingEnabled(db,'setup-existing')).rejects.toMatchObject({status:409});
  await expect(updateSetup(db,'setup-existing','ordering',true)).rejects.toMatchObject({status:409});
  await db.shopRateCard.create({data:{id:'setup-rates',shopId:'setup-existing',minimumPaise:0,rules:[{paperSize:'A4',colorMode:'BW',duplex:false,basis:'PAGE',unitPaise:200}]}});
  await Promise.all([updateSetup(db,'setup-existing','qr',true),updateSetup(db,'setup-existing','qr',true)]);
  const state=await readSetup(db,'setup-existing');expect(state.intake).not.toBeNull();expect(state.orderingEnabled).toBe(false);
  expect(await db.printer.count({where:{shopId:'setup-existing'}})).toBe(2);
  expect(await db.desktopDevice.count({where:{shopId:'setup-existing'}})).toBe(0);
  await expect(assertOrderingEnabled(db,'setup-existing')).rejects.toMatchObject({status:409});
  const api=await import('../app/api/admin/setup/route');const poster=await import('../app/api/admin/setup/poster/route');
  access.owner={shopId:'setup-existing',role:'staff'};expect((await poster.GET(new NextRequest('http://localhost:3999/api/admin/setup/poster'))).status).toBe(403);
  access.owner={shopId:'setup-existing',role:'owner'};const pdf=await poster.GET(new NextRequest('http://localhost:3999/api/admin/setup/poster'));expect(pdf.status).toBe(200);expect(pdf.headers.get('Content-Type')).toBe('application/pdf');expect(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString()).toBe('%PDF-');
  expect(setupSettings((await db.organization.findUniqueOrThrow({where:{id:'setup-existing'}})).metadata).orderingEnabled).toBe(false);
  const enable=new NextRequest('http://localhost:3999/api/admin/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ordering',enabled:true,shopId:'setup-other'})});
  expect((await api.POST(enable)).status).toBe(200);await expect(assertOrderingEnabled(db,'setup-existing')).resolves.toBeUndefined();await expect(assertOrderingEnabled(db,'setup-other')).rejects.toMatchObject({status:409});
  await updateSetup(db,'setup-existing','ordering',false);await expect(assertOrderingEnabled(db,'setup-existing')).rejects.toMatchObject({status:409});
  expect(await db.printJob.findUniqueOrThrow({where:{id:job.id}})).toEqual(job);
  expect(await db.printer.findUniqueOrThrow({where:{id:printer.id}})).toEqual(printer);
  const after=await db.organization.findUniqueOrThrow({where:{id:before.id}});expect({name:after.name,slug:after.slug,createdAt:after.createdAt}).toEqual({name:before.name,slug:before.slug,createdAt:before.createdAt});
 }finally{await db.$disconnect();}
},30000);
