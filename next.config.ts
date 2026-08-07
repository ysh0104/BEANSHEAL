import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    '/api/**/*': ['./public/templates/**/*', './src/templates/**/*', './templates/**/*'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: "/admin.html",
        destination: "/admin/cms",
      },
      {
        source: "/admin",
        destination: "/admin/cms",
      },
    ];
  },
};

export default nextConfig;
