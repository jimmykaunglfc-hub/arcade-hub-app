import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  
  // Get the hostname (e.g., 'app.joeyoke.com' or 'joeyokeadmin.joeyoke.com')
  const hostname = req.headers.get('host') || '';

  // If the user visits the admin subdomain
  if (hostname.includes('joeyokeadmin.joeyoke.com')) {
    // Invisibly route them to the /joeyokeadmin folder
    // E.g., joeyokeadmin.joeyoke.com/users -> loads app/joeyokeadmin/users/page.tsx
    url.pathname = `/joeyokeadmin${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // Otherwise, serve the standard arcade app normally
  return NextResponse.next();
}

// Only run middleware on actual pages, ignoring static files and images
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|assets|joeyoke-logo.png).*)',
  ],
};