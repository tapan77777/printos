import type {NextRequest} from "next/server";
import {pairings,deviceBody,pairingLimit,deviceJson,deviceError} from "@/lib/deviceApi";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await pairingLimit(req,"poll");const body=await deviceBody(req);return deviceJson(await pairings().poll((await params).id,body.signature));}catch(e){return deviceError(e);}}
