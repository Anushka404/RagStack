import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads files at load time and breaks when bundled; mammoth runs as plain Node too
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
