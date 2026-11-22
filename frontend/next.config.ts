// Location: frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // We don't run ESLint in this project (fewer moving parts for a hackathon).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
