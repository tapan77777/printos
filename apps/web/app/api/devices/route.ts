import type {NextRequest} from "next/server";
import {getOwnerFromRequest} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {deviceJson,deviceError,enrollmentReady} from "@/lib/deviceApi";
export async function GET(req:NextRequest){try{enrollmentReady();const owner=await getOwnerFromRequest(req);if(!owner)return deviceJson({error:"Unauthorized"},401);if(owner.role!=="owner"||!owner.shopId)return deviceJson({error:"Owner required"},403);return deviceJson(await prisma.desktopDevice.findMany({where:{shopId:owner.shopId},orderBy:{createdAt:"desc"},select:{id:true,label:true,mode:true,confirmedAt:true,processingEnabled:true,localPrinterIdentifier:true,configurationConfirmedAt:true,revokedAt:true,createdAt:true,printer:{select:{name:true,deviceId:true}}}}));}catch(e){return deviceError(e);}}
