import type {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {deviceCredential} from "@/lib/deviceCredential";
import {deviceJson,deviceError,enrollmentReady} from "@/lib/deviceApi";
export async function POST(req:NextRequest){try{enrollmentReady();
 const found=await deviceCredential(prisma,req.headers,true);if(!found)return deviceJson({error:"Device credential unavailable"},401);
 const saved=await prisma.desktopDevice.updateMany({where:{id:found.device.id,revokedAt:null,credentials:{some:{id:found.credential.id,revokedAt:null,expiresAt:{gt:new Date()}}}},data:{confirmedAt:found.device.confirmedAt??new Date()}});if(saved.count!==1)return deviceJson({error:"Device revoked"},401);
 return deviceJson({confirmed:true,deviceId:found.device.id,shopId:found.device.shopId,printerDeviceId:found.device.printer.deviceId,processingEnabled:false});
}catch(e){return deviceError(e);}}
