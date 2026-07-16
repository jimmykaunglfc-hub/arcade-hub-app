import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // If building for mobile (Capacitor), export statically. Otherwise, run as a Vercel Server.
  output: process.env.BUILD_TARGET === 'capacitor' ? 'export' : undefined,
  
  // Keep any other config settings you already had here
};

export default nextConfig;