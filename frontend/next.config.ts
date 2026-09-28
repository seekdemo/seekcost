import type { NextConfig } from "next";

const apiBaseUrl = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/notes/new", destination: "/research/new", permanent: false },
      { source: "/notes/series", destination: "/research/topics", permanent: false },
      { source: "/notes", destination: "/research", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
  // 抑制水合错误在开发中的干扰
  reactStrictMode: true,
};

export default nextConfig;
