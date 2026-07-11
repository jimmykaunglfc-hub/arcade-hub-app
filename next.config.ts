import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // This tells Next.js to create the 'out' folder!
  images: {
    unoptimized: true, // Required for static mobile apps
  },
};

export default nextConfig;