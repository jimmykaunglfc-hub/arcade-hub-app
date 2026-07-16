import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const pathname = url.pathname;

  // 1. Manually bypass static files, Next.js internal assets, and API routes
  // This replaces the buggy config.matcher regex
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // Excludes files like favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  // 2. Safely grab the host header from Vercel
  const host = req.headers.get('host') || '';

  // 3. If the user is specifically on the admin subdomain
  if (host === 'joeyokeadmin.joeyoke.com' || host.includes('joeyokeadmin')) {
    
    // Prevent infinite loops if the path already includes the folder
    if (!pathname.startsWith('/joeyokeadmin')) {
      // Rewrite the URL under the hood to pull from the /joeyokeadmin folder
      url.pathname = `/joeyokeadmin${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // 4. Otherwise, let the normal arcade load
  return NextResponse.next();
}