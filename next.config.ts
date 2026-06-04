import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent @react-pdf/renderer from being bundled for SSR —
  // it uses browser-only APIs (canvas, Path2D) that break server rendering.
  serverExternalPackages: ['@react-pdf/renderer', 'imapflow', 'mailparser'],
  // Ship the slip fonts inside the email serverless function so PDF
  // generation never needs a network fetch (deployment URLs are
  // auth-protected on Vercel, which made font fetches fail with 401).
  outputFileTracingIncludes: {
    '/api/payroll/slips/email': ['./public/fonts/**'],
  },
};

export default nextConfig;
