/**
 * Wallet-free docs-site constants. Every `process.env.NEXT_PUBLIC_*` read here is inlined at build
 * time (declared in turbo.json `build.env`), so the docs site stays fully static — no runtime env
 * access, no cookies, no headers.
 */

/**
 * Resolve a public URL env var, falling back when it is absent OR an empty string. A Docker
 * build-arg that's declared-but-unset bakes an EMPTY string into ENV — which `??` would NOT fall
 * back on — and an empty metadataBase makes `new URL("")` crash the build. Treat empty-after-trim as
 * absent. (`||` is banned by `prefer-nullish-coalescing`.)
 */
function envUrl(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

/** The canonical docs origin — used for `metadataBase`, canonical URLs, OG. */
export const DOCS_URL = envUrl(process.env.NEXT_PUBLIC_DOCS_URL, "https://docs.usematura.xyz");

/** The product app origin — linked cross-origin from the docs nav. */
export const APP_URL = envUrl(process.env.NEXT_PUBLIC_APP_URL, "https://app.usematura.xyz");

/** The marketing origin — linked cross-origin from the docs nav. */
export const LANDING_URL = envUrl(process.env.NEXT_PUBLIC_LANDING_URL, "https://usematura.xyz");

/** Public source repository. */
export const GITHUB_URL = "https://github.com/matura-finance/matura-finance";

/** BNB Smart Chain Testnet id — the only network Matura targets. */
export const CHAIN_ID = 97;
