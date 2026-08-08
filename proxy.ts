import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOSTS = new Set([
  "joeyokeadmin.joeyoke.com",
  "stagingadmin.joeyoke.com",
]);

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "")
    .split(":", 1)[0]
    .toLowerCase();

  if (!ADMIN_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Avoid rewriting the internal route when a direct admin URL is used.
  if (pathname === "/joeyokeadmin" || pathname.startsWith("/joeyokeadmin/")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/joeyokeadmin" : `/joeyokeadmin${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|assets|favicon.ico|robots.txt|sitemap.xml|joeyoke-logo.png).*)",
  ],
};
