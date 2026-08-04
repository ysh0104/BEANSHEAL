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
        source: "/",
        destination: "/homepage.html",
      },
      {
        source: "/admin",
        destination: "/admin.html",
      },
    ];
  },
};

export default nextConfig;
