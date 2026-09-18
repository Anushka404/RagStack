import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads files at load time and breaks when bundled
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
