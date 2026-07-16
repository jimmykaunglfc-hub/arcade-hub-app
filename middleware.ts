import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Grab the hostname from Vercel's edge headers safely
  const hostname = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';

  // Aggressive check: If the domain contains 'joeyokeadmin' at all
  if (hostname.includes('joeyokeadmin')) {
    const url = req.nextUrl.clone();
    
    // Make sure we don't cause an infinite rewrite loop
    if (!url.pathname.startsWith('/joeyokeadmin')) {
      // Map the root '/' to '/joeyokeadmin' 
      const path = url.pathname === '/' ? '' : url.pathname;
      url.pathname = `/joeyokeadmin${path}`;
      
      // Rewrite the URL invisibly under the hood
      return NextResponse.rewrite(url);
    }
  }

  // If not the admin domain, let the arcade load normally
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Catch every single route except background Next.js files and images
    '/((?!_next/static|_next/image|favicon.ico|assets|joeyoke-logo.png).*)',
  ],
};