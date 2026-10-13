import { NextResponse, type NextRequest } from "next/server";
import { decodeSessionEdge, SESSION_COOKIE_NAME } from "@/lib/session-edge";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await decodeSessionEdge(token);
  if (!session || session.role !== "owner") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
