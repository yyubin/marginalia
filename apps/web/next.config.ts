import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["react-pdf-highlighter"],
  async rewrites() {
    const apiOrigin = process.env.API_PROXY_ORIGIN ?? "https://marginalia-9u57.onrender.com";
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
