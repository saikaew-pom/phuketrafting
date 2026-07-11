import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    // Phase 2 replaces this with a custom loader against Cloudflare Images
    // once the account-level Images product + named variants are set up.
    unoptimized: true,
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
