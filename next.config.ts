import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  outputFileTracingExcludes: {
    "/*": [
      "src-tauri/target/**/*",
      "src-tauri/next-server/**/*",
      "src-tauri/bin/**/*",
      "desktop-dist/**/*",
    ],
  },
  serverExternalPackages: [
    "@mastra/fastembed",
    "fastembed",
    "onnxruntime-node",
    "@anush008/tokenizers",
    "@anush008/tokenizers-darwin-universal",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "supabase.co",
        pathname: "**",
      },
    ],
  },
};

export default nextConfig;
