import { NextResponse, type NextRequest } from "next/server";

/**
 * Tells server components which page was requested, so a signed-out visitor who opens a deep
 * link (like a friend's QR code) is sent back there after signing in. Layouts can't read the
 * URL on their own. Header-only: no auth decisions happen here.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-dibs-path", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: API routes, uploads, media, sockets and static files skip it.
  matcher: [{ source: "/((?!api/|_next/|media/|ws/|.*\\.[a-z0-9]+$).*)", missing: [{ type: "header", key: "next-action" }] }],
};
