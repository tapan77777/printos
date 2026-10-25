import {withRequestPerformance} from "@/lib/requestPerformance";
import {logAccountFailure} from "@/lib/authDiagnostic";
import {getAuth} from "@/lib/auth";
import {NextResponse} from "next/server";
export const runtime="nodejs";
async function accountHandler(request:Request){
 const auth=getAuth();
 if(!auth)return NextResponse.json({error:"Account setup is unavailable until the reviewed migration, authentication configuration and email delivery are ready."},{status:503});
 try{return await auth.handler(request);}catch(error){logAccountFailure("handler",error);return NextResponse.json({error:"Account service unavailable. Please try again later."},{status:500});}
}
const handler=(request:Request)=>withRequestPerformance("account",()=>accountHandler(request));
export {handler as GET,handler as POST};
