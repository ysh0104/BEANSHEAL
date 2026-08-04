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
        source: "/admin",
        destination: "/admin.html",
      },
      {
        source: "/homepage",
        destination: "/homepage.html",
      },
    ];
  },
};

export default nextConfig;
