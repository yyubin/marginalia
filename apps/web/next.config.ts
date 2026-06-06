import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["react-pdf-highlighter"],
};

export default nextConfig;
