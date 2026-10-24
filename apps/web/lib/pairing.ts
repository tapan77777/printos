import {createHash,randomBytes,randomUUID,timingSafeEqual,createPublicKey,verify} from "node:crypto";
import type {PrismaClient,DevicePairing} from "@prisma/client";
import type {OwnerAccess} from "./tenantAccess";
export class PairingError extends Error{constructor(public status:number,message:string){super(message);}}
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const proofMessage=(id:string,nonce:string,operation:"poll"|"consume")=>`PrintOS-pair-v1\n${id}\n${nonce}\n${operation}`;
function key(value:unknown){if(typeof value!=="string"||value.length>128||!/^[A-Za-z0-9+/]+=*$/.test(value))throw new PairingError(400,"Invalid device key");try{const k=createPublicKey({key:Buffer.from(value,"base64"),format:"der",type:"spki"});if(k.asymmetricKeyType!=="ed25519")throw Error();return k;}catch{throw new PairingError(400,"Invalid device key");}}
function prove(pair:DevicePairing,signature:unknown,operation:"poll"|"consume"){
 if(typeof signature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(signature)||!verify(null,Buffer.from(proofMessage(pair.id,pair.nonce,operation)),key(pair.publicKey),Buffer.from(signature,"base64")))throw new PairingError(401,"Device proof required");
}
export function pairingService(db:PrismaClient,now:()=>Date=()=>new Date()){
 return {
  async begin(input:{label?:unknown;publicKey?:unknown;mode?:unknown}){
   if(typeof input.label!=="string"||!input.label.trim()||input.label.length>80||/[\x00-\x1f/\\]/.test(input.label)||!["cups","mock","windows"].includes(String(input.mode)))throw new PairingError(400,"Valid computer name and adapter mode required");key(input.publicKey);
   const code=randomBytes(5).toString("hex").toUpperCase();const id=randomUUID();const nonce=randomBytes(32).toString("base64url");const expiresAt=new Date(now().getTime()+10*60000);
   await db.devicePairing.create({data:{id,label:input.label.trim(),publicKey:input.publicKey as string,nonce,mode:input.mode as string,codeHash:digest(code),expiresAt}});
   return {id,nonce,code,expiresAt:expiresAt.toISOString()};
  },
  async inspect(id:string,owner:OwnerAccess){
   if(owner.role!=="owner"||!owner.shopId)throw new PairingError(403,"Shop owner required");
   const pair=await db.devicePairing.findUnique({where:{id}});if(!pair||pair.expiresAt<=now()||pair.consumedAt||(pair.shopId&&pair.shopId!==owner.shopId))throw new PairingError(404,"Pairing unavailable");
   return {id:pair.id,label:pair.label,mode:pair.mode,keyFingerprint:digest(pair.publicKey).slice(0,16),expiresAt:pair.expiresAt.toISOString(),approved:!!pair.approvedAt};
  },
  async approve(id:string,owner:OwnerAccess,code:unknown,printerId:unknown){
   if(owner.role!=="owner"||!owner.userId||!owner.shopId)throw new PairingError(403,"Shop owner required");
   if(typeof code!=="string"||! /^[A-Fa-f0-9]{10}$/.test(code)||typeof printerId!=="string")throw new PairingError(400,"Enter the code shown on this computer and select a printer");
   const pair=await db.devicePairing.findUnique({where:{id}});if(!pair||pair.shopId&&pair.shopId!==owner.shopId)throw new PairingError(404,"Pairing unavailable");
   const attempt=await db.devicePairing.updateMany({where:{id,approvedAt:null,consumedAt:null,expiresAt:{gt:now()},approvalAttempts:{lt:5}},data:{approvalAttempts:{increment:1}}});if(attempt.count!==1)throw new PairingError(409,"Pairing expired, approved or locked");
   if(!timingSafeEqual(Buffer.from(digest(code.toUpperCase())),Buffer.from(pair.codeHash)))throw new PairingError(400,"Pairing code does not match");
   const printer=await db.printer.findFirst({where:{id:printerId,shopId:owner.shopId,simulationOnly:pair.mode==="mock"}});if(!printer)throw new PairingError(404,"Printer unavailable for this shop and adapter");
   const saved=await db.devicePairing.updateMany({where:{id,approvedAt:null,consumedAt:null,expiresAt:{gt:now()},approvalAttempts:{lte:5}},data:{shopId:owner.shopId,printerId:printer.id,approvedAt:now(),approvedBy:owner.userId}});if(saved.count!==1)throw new PairingError(409,"Pairing changed; start again");return {approved:true};
  },
  async poll(id:string,signature:unknown){
   const pair=await db.devicePairing.findUnique({where:{id}});if(!pair)throw new PairingError(404,"Pairing unavailable");prove(pair,signature,"poll");if(pair.expiresAt<=now())throw new PairingError(410,"Pairing expired");if(pair.consumedAt)throw new PairingError(409,"Pairing already consumed; inspect saved credentials or revoke and pair again");return {approved:!!pair.approvedAt,expiresAt:pair.expiresAt.toISOString()};
  },
  async consume(id:string,signature:unknown){
   return db.$transaction(async tx=>{
    const pair=await tx.devicePairing.findUnique({where:{id}});if(!pair)throw new PairingError(404,"Pairing unavailable");prove(pair,signature,"consume");
    if(pair.expiresAt<=now()||pair.consumedAt||!pair.approvedAt||!pair.shopId||!pair.printerId)throw new PairingError(409,"Pairing not approved, expired or consumed");
    // Membership must still be valid when the computer redeems approval.
    const owner=await tx.member.findUnique({where:{organizationId_userId:{organizationId:pair.shopId,userId:pair.approvedBy!}}});if(owner?.role!=="owner")throw new PairingError(403,"Approving owner access was removed");
    const changed=await tx.devicePairing.updateMany({where:{id,consumedAt:null,expiresAt:{gt:now()},approvedAt:{not:null}},data:{consumedAt:now()}});if(changed.count!==1)throw new PairingError(409,"Pairing already consumed");
    const deviceId=randomUUID();const token="pda_"+randomBytes(32).toString("base64url");const expiresAt=new Date(now().getTime()+30*24*3600000);
    await tx.desktopDevice.create({data:{id:deviceId,shopId:pair.shopId,printerId:pair.printerId,label:pair.label,publicKey:pair.publicKey,mode:pair.mode}});
    await tx.deviceCredential.create({data:{id:randomUUID(),deviceId,tokenHash:digest(token),expiresAt}});await tx.devicePairing.update({where:{id},data:{deviceId}});
    const printer=await tx.printer.findUniqueOrThrow({where:{id:pair.printerId}});
    return {deviceId,token,shopId:pair.shopId,printerDeviceId:printer.deviceId,mode:pair.mode,expiresAt:expiresAt.toISOString(),confirmed:false};
   });
  },
  async revoke(id:string,owner:OwnerAccess){
   if(owner.role!=="owner"||!owner.shopId)throw new PairingError(403,"Shop owner required");
   const shopId=owner.shopId;
   return db.$transaction(async tx=>{
    const device=await tx.desktopDevice.findFirst({where:{id,shopId}});if(!device)throw new PairingError(404,"Device unavailable");
    await tx.desktopDevice.updateMany({where:{id,shopId,revokedAt:null},data:{revokedAt:now(),processingEnabled:false}});
    await tx.deviceCredential.updateMany({where:{deviceId:id,revokedAt:null},data:{revokedAt:now()}});
    // Preserve attempt IDs, submission latches, spool IDs and prices. Never requeue.
    await tx.printJob.updateMany({where:{shopId:owner.shopId,claimedBy:id,printStatus:{in:["DOWNLOADING","PRINTING"]}},data:{printStatus:"RECONCILIATION_REQUIRED",agentError:"Device access revoked. Inspect the queue and output before resolving this attempt."}});return {revoked:true};
   });
  }
 };
}
