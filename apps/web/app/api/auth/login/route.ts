import {NextResponse} from "next/server";
export async function POST(){return NextResponse.json({error:"Global owner login retired. Sign in with your verified PrintOS account."},{status:410});}
