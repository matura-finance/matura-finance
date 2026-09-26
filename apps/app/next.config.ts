import type { NextConfig } from "next";

/** Resolve the origin of a URL env var, or null if unset/invalid. */
function originOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? "").origin;
  } catch {
    return null;
  }
}

// connect-src is the load-bearing control: even if an injected script runs (script-src allows
// Next's inline hydration), it cannot exfiltrate the sessionStorage bearer token to an
// arbitrary host — outbound XHR/fetch/WebSocket is limited to our own API + the chain RPC.
const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:3000";
const rpcOrigin =
  originOf(process.env.NEXT_PUBLIC_RPC_URL) ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next App Router bootstraps with inline scripts
  "style-src 'self' 'unsafe-inline'", // Tailwind/Next inject inline styles
  "img-src 'self' data:", // wallet/connector icons arrive as data: URIs
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${rpcOrigin}`,
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

const nextConfig: NextConfig = {
  // @matura/chain ships raw TypeScript (transpile REQUIRED); @matura/ui is a JIT
  // Tailwind package; @matura/shared is built but transpiling is harmless.
  transpilePackages: ["@matura/ui", "@matura/chain", "@matura/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
