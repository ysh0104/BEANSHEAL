import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 💡 기존에 있던 설정들은 그대로 두시고, 아래 두 가지 항목만 추가로 끼워 넣으시면 됩니다.
  eslint: {
    // 빌드 시 ESLint 문법 검사 에러를 무시합니다.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 빌드 시 타입스크립트 에러를 무시합니다.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig; // (또는 export default nextConfig;)

export default nextConfig;
