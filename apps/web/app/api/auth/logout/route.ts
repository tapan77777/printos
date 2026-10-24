import {getAuth} from "@/lib/auth";
import {NextResponse,type NextRequest} from "next/server";
export async function POST(req:NextRequest){const auth=getAuth();if(!auth)return NextResponse.json({error:"Account service unavailable"},{status:503});return auth.handler(new Request(new URL("/api/account-auth/sign-out",req.url),{method:"POST",headers:req.headers}));}
