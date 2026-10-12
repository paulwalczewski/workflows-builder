import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // HeroUI ships ESM only and the workflow packages ship TypeScript source;
  // listing them here lets Next and next/jest transform them.
  transpilePackages: [
    "@heroui/react",
    "@heroui/styles",
    "@wb/workflow-engine",
    "@wb/workflow-builder",
  ],
  partialPrefetching: true,
  reactCompiler: true,
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
