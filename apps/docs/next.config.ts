import path from "node:path";

import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

// The docs site is static and wallet-free: it makes no cross-origin API/chain calls (contract
// addresses are generated from the manifest at build time, not fetched), so connect-src stays
// 'self' — matching the landing site's strict posture. Local Orama search hits /api/search, which
// is same-origin and therefore allowed by connect-src 'self'.
//
// Dev-only: Next's Fast Refresh / HMR + the fumadocs-mdx dev runtime evaluate code via `eval`, which
// a strict script-src blocks. We relax with 'unsafe-eval' ONLY in development; production keeps the
// strict policy (Mermaid is pre-rendered to static SVG at build time, so no runtime eval is needed).
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
  // Emit a self-contained server (`.next/standalone`) so the Docker runner ships only the traced
  // files + a minimal node_modules. `outputFileTracingRoot` pins tracing to the monorepo root so
  // workspace deps (@matura/ui) are followed correctly.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@matura/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withMDX = createMDX();

export default withMDX(config);
