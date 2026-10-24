import type {NextRequest} from "next/server";
import {getOwnerFromRequest} from "@/lib/session";
import {pairings,deviceBody,deviceJson,deviceError} from "@/lib/deviceApi";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const owner=await getOwnerFromRequest(req);if(!owner)return deviceJson({error:"Unauthorized"},401);const body=await deviceBody(req);return deviceJson(await pairings().approve((await params).id,owner,body.code,body.printerId));}catch(e){return deviceError(e);}}
