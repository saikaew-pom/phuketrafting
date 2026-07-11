import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDevBypassIdentity, verifyAccessRequest } from "@/lib/access";

// Classic (edge-style) middleware only — the OpenNext Cloudflare adapter does
// not yet support Next.js's newer "Node Middleware" runtime option.
export async function middleware(request: NextRequest) {
  const bypass = getDevBypassIdentity(request.headers.get("host"));
  if (bypass) return NextResponse.next();

  try {
    await verifyAccessRequest(request);
    return NextResponse.next();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
