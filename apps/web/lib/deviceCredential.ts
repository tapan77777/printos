import {createHash} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
export async function deviceCredential(db:PrismaClient,headers:Headers,allowUnconfirmed=false){
 const token=headers.get("authorization")?.match(/^Bearer (pda_[A-Za-z0-9_-]{43})$/)?.[1];const id=headers.get("x-printos-agent");
 if(!token||!id)return null;
 const credential=await db.deviceCredential.findUnique({where:{tokenHash:createHash("sha256").update(token).digest("hex")},include:{device:{include:{printer:true}}}});
 const now=new Date();const d=credential?.device;
 if(!credential||!d||d.id!==id||credential.revokedAt||credential.expiresAt<=now||d.revokedAt||!d.printer.shopId||d.shopId!==d.printer.shopId||d.printer.simulationOnly!==(d.mode==="mock")||(!allowUnconfirmed&&!d.confirmedAt))return null;
 // A lost enrollment response can never leave a usable unconfirmed credential.
 if(!d.confirmedAt&&d.createdAt.getTime()+5*60000<now.getTime())return null;
 return {credential,device:d};
}
