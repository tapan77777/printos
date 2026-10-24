import {NextResponse,type NextRequest} from "next/server";
import {createHash} from "node:crypto";
import {isIP} from "node:net";
import {getAuth} from "./auth";
import {prisma} from "./prisma";
import {accountRequest} from "./authBody";
import {PairingError,pairingService} from "./pairing";
export function enrollmentReady(){if(process.env.PRINTOS_DEVICE_ENROLLMENT!=="enabled"||!getAuth())throw new PairingError(503,"Device enrollment requires the approved migration and configured verified accounts.");}
export const pairings=()=>{enrollmentReady();return pairingService(prisma);};
export async function deviceBody(req:NextRequest){const bounded=await accountRequest(req);if(bounded instanceof Response)throw new PairingError(bounded.status,"Small JSON request required");try{const body=await bounded.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();return body;}catch{throw new PairingError(400,"Invalid JSON");}}
export async function pairingLimit(req:NextRequest,operation:string){
 enrollmentReady();
 const candidate=process.env.PRINTOS_TRUST_PROXY==="true"?req.headers.get("x-real-ip"):null;const ip=candidate&&isIP(candidate)?candidate:"shared";const key="pair:"+createHash("sha256").update(operation+"|"+ip).digest("hex");
 // One atomic PostgreSQL statement: concurrent requests share the same limit.
 const rows=await prisma.$queryRaw<{count:number}[]>`INSERT INTO "RateLimit" (id,key,count,"lastRequest") VALUES (${key},${key},1,${BigInt(Date.now())}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."lastRequest" < ${BigInt(Date.now()-300000)} THEN 1 ELSE "RateLimit".count+1 END,"lastRequest"=CASE WHEN "RateLimit"."lastRequest" < ${BigInt(Date.now()-300000)} THEN ${BigInt(Date.now())} ELSE "RateLimit"."lastRequest" END RETURNING count`;
 if(rows[0].count>30)throw new PairingError(429,"Pairing rate limit reached. Try again later.");
}
export function deviceJson(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});}
export function deviceError(error:unknown){if(error instanceof PairingError)return deviceJson({error:error.message},error.status);if(error&&typeof error==="object"&&"code" in error&&error.code==="P2002")return deviceJson({error:"This printer already has a paired device. Review and revoke it before pairing another."},409);return deviceJson({error:"Device service unavailable. Verify the pending migration and configuration."},503);}
