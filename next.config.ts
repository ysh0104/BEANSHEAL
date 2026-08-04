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
        destination: "/page.html",
      },
      {
        source: "/admin.html",
        destination: "/page.html",
      },
      {
        source: "/admin",
        destination: "/page.html",
      },
    ];
  },
};

export default nextConfig;
