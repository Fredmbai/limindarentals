import type { NextConfig } from "next";

const DJANGO_URL = process.env.DJANGO_URL ?? "http://127.0.0.1:8000";
const devOrigins = process.env.NGROK_HOST ? [process.env.NGROK_HOST] : [];

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone directory for Docker deployment.
  // The runner stage copies only that directory — no node_modules needed at runtime.
  output: "standalone",

  allowedDevOrigins: devOrigins,

  // Prevent Next.js from redirecting "/api/foo/" → "/api/foo".
  // Without this the trailing slash is stripped before rewrites run,
  // Django's APPEND_SLASH adds it back → infinite 301 loop.
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      // :path(.*) captures EVERYTHING after the prefix, including slashes.
      // This preserves the trailing slash that Django URL patterns expect.
      { source: "/api/:path(.*)",   destination: `${DJANGO_URL}/api/:path`   },
      { source: "/media/:path(.*)", destination: `${DJANGO_URL}/media/:path` },
    ];
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control",          value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
