import path from "node:path";

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

// Reown AppKit / WalletConnect needs to reach its relay (WebSocket) plus the wallet-explorer
// and verify APIs, and loads remote wallet icons. These widen the otherwise-locked-down CSP
// strictly to WalletConnect/Reown hosts — the connect-src allowlist is still the load-bearing
// control: the sessionStorage bearer token can only be exfiltrated to our API, the chain RPC,
// or these named hosts, never to an arbitrary origin.
const walletConnect = {
  // `imagedelivery.net` is here too (not only img-src): AppKit fetches wallet-icon bytes and
  // renders them as blob: URLs, so the fetch itself must be allowed by connect-src.
  connect:
    "https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://*.reown.com wss://*.reown.com https://api.web3modal.org https://imagedelivery.net",
  // `blob:` — AppKit renders fetched wallet icons/QR as blob: object URLs.
  img: "blob: https://*.walletconnect.com https://api.web3modal.org https://imagedelivery.net",
  // AppKit loads its KHTeka web font from fonts.reown.com.
  font: "https://fonts.reown.com",
  frame: "https://verify.walletconnect.com https://verify.walletconnect.org",
};

// Next's dev-only React Fast Refresh runtime evaluates code with `eval`, which a strict
// `script-src` blocks — the EvalError aborts the client runtime and nothing hydrates (every
// button goes dead). Allow `'unsafe-eval'` in development ONLY; production stays strict.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;

const csp = [
  "default-src 'self'",
  scriptSrc, // Next App Router bootstraps with inline scripts; dev HMR also needs 'unsafe-eval'
  "style-src 'self' 'unsafe-inline'", // Tailwind/Next inject inline styles
  `img-src 'self' data: ${walletConnect.img}`, // injected-connector icons are data: URIs; WalletConnect icons are remote/blob
  `font-src 'self' data: ${walletConnect.font}`, // AppKit KHTeka web font
  `connect-src 'self' ${apiOrigin} ${rpcOrigin} ${walletConnect.connect}`,
  `frame-src 'self' ${walletConnect.frame}`, // WalletConnect verify iframe
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
  // Emit a self-contained server (`.next/standalone`) so the Docker runner ships only the
  // traced files + a minimal node_modules — no pnpm install at runtime. `outputFileTracingRoot`
  // pins tracing to the monorepo root so workspace deps (@matura/*) are followed correctly.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // @matura/chain ships raw TypeScript (transpile REQUIRED); @matura/ui is a JIT
  // Tailwind package; @matura/shared is built but transpiling is harmless.
  transpilePackages: ["@matura/ui", "@matura/chain", "@matura/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Account + Activity merged into /portfolio; Get Liquidity is now a modal on /portfolio.
  async redirects() {
    return [
      { source: "/account", destination: "/portfolio", permanent: false },
      { source: "/activity", destination: "/portfolio", permanent: false },
      { source: "/request", destination: "/portfolio?request=1", permanent: false },
    ];
  },
  webpack(config, { webpack }) {
    // Reown's wagmi adapter imports the full `@wagmi/connectors` barrel, which re-exports the
    // Coinbase baseAccount connector → `@base-org/account` → `@coinbase/cdp-sdk` → `@x402/*`.
    // That `@x402` chain is an optional dependency we never use (we don't ship the baseAccount
    // connector) and it isn't installed, so webpack can't resolve `@x402/evm/upto/client` and the
    // build 500s. Ignore the whole `@x402` namespace — the only code path that imports it
    // (`signX402Payment`) is unreachable in this app, so the ignored modules are never executed.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    // Optional deps the WalletConnect/MetaMask web stack `require()`s only in other runtimes:
    // `@react-native-async-storage/async-storage` (React Native only) and `pino-pretty` (a dev
    // logger pino loads lazily). Neither is installed nor needed in the browser build; ignore
    // them so the build output stays clean instead of emitting unresolved-module warnings.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@react-native-async-storage\/async-storage|pino-pretty)$/,
      }),
    );
    return config;
  },
};

export default nextConfig;
