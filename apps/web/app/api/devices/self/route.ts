import type {NextRequest} from "next/server";
import {prisma} from "@/lib/prisma";
import {deviceCredential} from "@/lib/deviceCredential";
import {deviceJson,deviceError,enrollmentReady} from "@/lib/deviceApi";
export async function GET(req:NextRequest){try{enrollmentReady();const found=await deviceCredential(prisma,req.headers);if(!found)return deviceJson({error:"Device revoked, expired or unconfirmed"},401);return deviceJson({deviceId:found.device.id,shopId:found.device.shopId,printerDeviceId:found.device.printer.deviceId,mode:found.device.mode,localPrinterIdentifier:found.device.localPrinterIdentifier,rendererSha256:found.device.rendererSha256,processingEnabled:found.device.processingEnabled});}catch(e){return deviceError(e);}}
