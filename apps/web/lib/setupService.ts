import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { setupMetadata, setupSettings } from './shopSetupState';
import { UploadError } from './uploadQuote';
export type SetupData = { shopName:string; orderingEnabled:boolean; card:{id:string;rules:unknown;minimumPaise:number}|null; intake:{deviceId:string}|null };
export async function readSetup(db:PrismaClient,shopId:string):Promise<SetupData>{
 const shop=await db.organization.findUnique({where:{id:shopId},select:{name:true,metadata:true,rateCards:{orderBy:[{createdAt:'desc'},{id:'desc'}],take:1,select:{id:true,rules:true,minimumPaise:true}},printers:{select:{id:true,deviceId:true}}}});
 if(!shop)throw new UploadError('Shop not found',404);
 const state=setupSettings(shop.metadata);const intake=shop.printers.find(p=>p.id===state.intakePrinterId);
 return {shopName:shop.name,orderingEnabled:state.orderingEnabled,card:shop.rateCards[0]??null,intake:intake?{deviceId:intake.deviceId}:null};
}
export async function updateSetup(db:PrismaClient,shopId:string,action:unknown,enabled:unknown){
 if(action!=='qr'&&action!=='ordering')throw new UploadError('Choose a setup action');
 if(action==='ordering'&&typeof enabled!=='boolean')throw new UploadError('Choose whether to accept orders');
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Shop" WHERE id=${shopId} FOR UPDATE`;
  const shop=await tx.organization.findUnique({where:{id:shopId},select:{name:true,metadata:true}});
  if(!shop)throw new UploadError('Shop not found',404);
  const settings=setupSettings(shop.metadata);
  if(action==='ordering'&&enabled===false){await tx.organization.update({where:{id:shopId},data:{metadata:setupMetadata(shop.metadata,{orderingEnabled:false})}});return;}
  const prices=await tx.shopRateCard.findFirst({where:{shopId},select:{id:true}});
  if(!prices)throw new UploadError('Save your prices before continuing',409);
  const intake=settings.intakePrinterId?await tx.printer.findFirst({where:{id:settings.intakePrinterId,shopId},select:{id:true}}):null;
  if(action==='ordering'){
   if(!intake)throw new UploadError('Generate your QR poster before accepting orders',409);
   await tx.organization.update({where:{id:shopId},data:{metadata:setupMetadata(shop.metadata,{orderingEnabled:true})}});
  }else if(!intake){
   // This is a cloud intake identity, not an installed or paired physical printer.
   const printer=await tx.printer.create({data:{shopId,name:`${shop.name.slice(0,110)} counter`,deviceId:`shop-${randomUUID()}`},select:{id:true}});
   await tx.organization.update({where:{id:shopId},data:{metadata:setupMetadata(shop.metadata,{intakePrinterId:printer.id})}});
  }
 });
 return readSetup(db,shopId);
}
