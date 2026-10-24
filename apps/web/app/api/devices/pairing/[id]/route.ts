import type {NextRequest} from "next/server";
import {getOwnerFromRequest} from "@/lib/session";
import {pairings,deviceJson,deviceError} from "@/lib/deviceApi";
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const owner=await getOwnerFromRequest(req);if(!owner)return deviceJson({error:"Unauthorized"},401);return deviceJson(await pairings().inspect((await params).id,owner));}catch(e){return deviceError(e);}}
