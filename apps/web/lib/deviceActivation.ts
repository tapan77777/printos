import type {PrismaClient} from '@prisma/client';
import type {OwnerAccess} from './tenantAccess';
import {PairingError} from './pairing';
import {cloudDocuments,privateStorage} from './privateStorage';
export const activeDeviceJobs=['DOWNLOADING','PRINTING','RECONCILIATION_REQUIRED'] as const;
export function deviceActivation(db:PrismaClient){return {
 async configure(deviceId:string,input:{printerIdentifier?:unknown;rendererSha256?:unknown},credentialId:string){
  if(typeof input.printerIdentifier!=='string'||!/^[a-f0-9]{64}$/.test(input.printerIdentifier))throw new PairingError(400,'Select a discovered printer first');
  const identifier=input.printerIdentifier;
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "DesktopDevice" WHERE id=${deviceId} FOR UPDATE`;
   const d=await tx.desktopDevice.findUnique({where:{id:deviceId},include:{printer:true,credentials:{where:{id:credentialId,revokedAt:null,expiresAt:{gt:new Date()}}}}});if(!d||d.revokedAt||!d.confirmedAt||!d.credentials.length)throw new PairingError(401,'Device unavailable');
   const renderer=d.mode==='mock'?null:input.rendererSha256;if(d.mode!=='mock'&&(typeof renderer!=='string'||!/^[a-f0-9]{64}$/.test(renderer)))throw new PairingError(400,'Qualified renderer checksum required');
   const changed=d.localPrinterIdentifier!==input.printerIdentifier||d.rendererSha256!==renderer;
   if(changed&&(d.processingEnabled||await tx.printJob.count({where:{claimedBy:d.id,printStatus:{in:[...activeDeviceJobs]}}})))throw new PairingError(409,'Stop processing and reconcile active attempts before changing the printer');
   await tx.desktopDevice.update({where:{id:d.id},data:{localPrinterIdentifier:identifier,rendererSha256:renderer as string|null,configurationConfirmedAt:new Date()}});return {configured:true,deviceId:d.id};
  });
 },
 async set(deviceId:string,owner:OwnerAccess,enabled:boolean){
  if(owner.role!=='owner'||!owner.shopId)throw new PairingError(403,'Shop owner required');
  const shopId=owner.shopId;
  if(enabled){if(process.env.PRINTOS_LIVE_AGENT!=='enabled')throw new PairingError(503,'Live processing is not enabled for this cloud deployment');if(!cloudDocuments())throw new PairingError(503,'Private cloud storage required');await privateStorage().check();}
  return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "DesktopDevice" WHERE id=${deviceId} FOR UPDATE`;
   const d=await tx.desktopDevice.findFirst({where:{id:deviceId,shopId},include:{credentials:{where:{revokedAt:null,expiresAt:{gt:new Date()}}},printer:true}});if(!d||d.revokedAt||!d.confirmedAt||!d.credentials.length)throw new PairingError(404,'Confirmed device not found');
   if(enabled){if(!['windows','mock'].includes(d.mode)||!d.localPrinterIdentifier||!d.configurationConfirmedAt||d.configurationConfirmedAt.getTime()<Date.now()-5*60000)throw new PairingError(409,'Prepare this computer in desktop setup first');if(!await tx.shopRateCard.findFirst({where:{shopId}}))throw new PairingError(409,'Publish shop prices first');}
   await tx.desktopDevice.update({where:{id:d.id},data:{processingEnabled:enabled}});
   if(!enabled)await tx.printJob.updateMany({where:{shopId,claimedBy:d.id,printStatus:{in:['DOWNLOADING','PRINTING']}},data:{printStatus:'RECONCILIATION_REQUIRED',agentError:'Processing disabled by owner. Inspect existing output; do not reprint automatically.'}});
   return {processingEnabled:enabled};
  });
 }
};}
