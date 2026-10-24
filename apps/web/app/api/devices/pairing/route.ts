import type {NextRequest} from "next/server";
import {pairings,deviceBody,pairingLimit,deviceJson,deviceError} from "@/lib/deviceApi";
export async function POST(req:NextRequest){try{await pairingLimit(req,"begin");return deviceJson(await pairings().begin(await deviceBody(req)),201);}catch(e){return deviceError(e);}}
