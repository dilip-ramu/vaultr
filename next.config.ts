import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent @react-pdf/renderer from being bundled for SSR —
  // it uses browser-only APIs (canvas, Path2D) that break server rendering.
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
