import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || req.nextUrl.hostname;

  if (hostname.includes('joeyokeadmin')) {
    const url = req.nextUrl.clone();
    // Only rewrite if it hasn't been rewritten yet
    if (!url.pathname.startsWith('/joeyokeadmin')) {
      const path = url.pathname === '/' ? '' : url.pathname;
      // Force an absolute URL rewrite to guarantee Vercel catches it
      return NextResponse.rewrite(new URL(`/joeyokeadmin${path}`, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|assets|joeyoke-logo.png).*)'],
};