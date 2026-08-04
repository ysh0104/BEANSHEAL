import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/index.html",
        destination: "/admin.html",
      },
      {
        source: "/admin",
        destination: "/admin.html",
      },
    ];
  },
};

export default nextConfig;
