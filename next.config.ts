import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // If building for mobile (Capacitor), export statically. Otherwise, run as a Vercel Server.
  output: process.env.BUILD_TARGET === 'capacitor' ? 'export' : undefined,
  
  // Capacitor has no Next image-optimization server.
  images: {
    unoptimized: process.env.BUILD_TARGET === 'capacitor',
  },
};

export default nextConfig;