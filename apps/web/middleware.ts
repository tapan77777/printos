import {NextResponse,type NextRequest} from "next/server";
export function middleware(req:NextRequest){
 const present=req.cookies.has("printos-account.session_token")||req.cookies.has("__Secure-printos-account.session_token");
 if(!present){const url=new URL("/login",req.url);return NextResponse.redirect(url);}
 return NextResponse.next();
}
export const config={matcher:["/dashboard/:path*"]};
