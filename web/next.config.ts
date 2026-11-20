import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/sw.js", "/portal-sw.js", "/manifest.webmanifest"].map(
      (source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      }),
    );
  },
};

export default nextConfig;
