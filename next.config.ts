import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repository has an unrelated parent lockfile. Pin Turbopack to the
  // actual app root so builds do not scan the parent workspace.
  turbopack: {
    root: process.cwd(),
  },
  // If building for mobile (Capacitor), export statically. Otherwise, run as a Vercel Server.
  output: process.env.BUILD_TARGET === 'capacitor' ? 'export' : undefined,
  
  // Capacitor has no Next image-optimization server.
  images: {
    unoptimized: process.env.BUILD_TARGET === 'capacitor',
  },
};

export default nextConfig;
