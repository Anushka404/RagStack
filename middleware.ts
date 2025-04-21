import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const hasKey = req.cookies.get("access_key")?.value;
  const validKey = process.env.ACCESS_KEY;

  // Skip public files and Next.js internals
  if (
    PUBLIC_FILE.test(req.nextUrl.pathname) ||
    req.nextUrl.pathname.startsWith('/api') ||
    req.nextUrl.pathname.startsWith('/_next')
  ) {
    return NextResponse.next();
  }

  // If already has cookie, allow
  if (hasKey === validKey) return NextResponse.next();

  // If ?key=xxx in URL matches, set cookie and allow
  if (key === validKey) {
    const res = NextResponse.next();
    res.cookies.set("access_key", key, { path: "/", maxAge: 60 * 60 * 24 });
    return res;
  }

  // Otherwise, redirect to lock screen
  return NextResponse.redirect(new URL("/locked", req.url));
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
