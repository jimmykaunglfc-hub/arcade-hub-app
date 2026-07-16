import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  
  // Extract the hostname safely (e.g., 'joeyokeadmin.joeyoke.com')
  const hostname = req.nextUrl.hostname;

  // If the user visits the admin subdomain
  if (hostname === 'joeyokeadmin.joeyoke.com') {
    // Prevent infinite rewrite loops if the path already starts with /joeyokeadmin
    if (!url.pathname.startsWith('/joeyokeadmin')) {
      // Map root "/" to "/joeyokeadmin", and "/login" to "/joeyokeadmin/login"
      const path = url.pathname === '/' ? '' : url.pathname;
      url.pathname = `/joeyokeadmin${path}`;
      return NextResponse.rewrite(url);
    }
  }

  // Otherwise, serve the standard arcade app normally
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Matches all routes except static files, images, and internal Next.js APIs
    '/((?!api|_next/static|_next/image|favicon.ico|assets|joeyoke-logo.png).*)',
  ],
};