import path from "node:path";

import type { NextConfig } from "next";

// The marketing site is static and wallet-free: it makes no API/chain calls, so connect-src
// stays 'self'. script-src allows Next's inline hydration + the static JSON-LD block.
//
// Dev-only: Next's Fast Refresh / HMR runtime evaluates code via `eval`, which a strict
// script-src blocks — breaking client-side hydration (dead onClick, etc.). We relax with
// 'unsafe-eval' ONLY in development; production keeps the strict policy.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  // Emit a self-contained server (`.next/standalone`) so the Docker runner ships only the
  // traced files + a minimal node_modules — no pnpm install at runtime. `outputFileTracingRoot`
  // pins tracing to the monorepo root so workspace deps (@matura/ui) are followed correctly.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@matura/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
