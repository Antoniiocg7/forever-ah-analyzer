import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Iconos oficiales de Blizzard; se sirven tal cual, sin pasar por el optimizador.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "render.worldofwarcraft.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
