// Location: frontend/next.config.ts
import type { NextConfig } from "next";

// On Vercel, refuse to build without the backend address. NEXT_PUBLIC_ values
// are baked into the JavaScript at BUILD time, so a missing one would silently
// ship a site that calls http://localhost:4000 on every visitor's phone.
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("Set NEXT_PUBLIC_API_URL in Vercel → Project → Settings → Environment Variables, then redeploy.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // We don't run ESLint in this project (fewer moving parts for a hackathon).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
