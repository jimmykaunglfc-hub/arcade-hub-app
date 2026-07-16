import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  
  // Safely grab the host header from Vercel
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';

  // If the user visits the admin subdomain
  if (host.includes('joeyokeadmin.joeyoke.com')) {
    // Prevent infinite loops if the path already starts with /joeyokeadmin
    if (!url.pathname.startsWith('/joeyokeadmin')) {
      // Map root "/" to "/joeyokeadmin", and "/login" to "/joeyokeadmin/login"
      const path = url.pathname === '/' ? '' : url.pathname;
      url.pathname = `/joeyokeadmin${path}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|assets|joeyoke-logo.png).*)'],
};