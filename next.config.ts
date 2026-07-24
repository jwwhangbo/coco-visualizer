import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (.next/standalone) for the Docker runner stage.
  output: "standalone",
  // Keep the queue stack out of the bundler: bullmq pulls optional native deps
  // (msgpackr-extract) and ioredis is a plain Node client. Required at runtime
  // from node_modules instead.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
