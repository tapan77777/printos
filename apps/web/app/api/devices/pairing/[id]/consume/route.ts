import type {NextRequest} from "next/server";
import {pairings,deviceBody,pairingLimit,deviceJson,deviceError} from "@/lib/deviceApi";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await pairingLimit(req,"consume");const body=await deviceBody(req);return deviceJson(await pairings().consume((await params).id,body.signature));}catch(e){return deviceError(e);}}
