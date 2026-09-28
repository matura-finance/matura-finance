/**
 * Wallet-free site constants. Every `process.env.NEXT_PUBLIC_*` read here is
 * inlined at build time (declared in turbo.json `build.env`), so the landing
 * site stays fully static — no runtime env access, no cookies, no headers.
 */

/** The product app origin. Linked via a plain `<a>` (cross-origin). */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.usematura.xyz";

/** The canonical marketing origin — used for `metadataBase`, sitemap, robots. */
export const SITE_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "https://usematura.xyz";

/** Public source repository (docs live here too). */
export const GITHUB_URL = "https://github.com/matura-finance/matura-finance";

/** Honest contact target for issuer / team enquiries. */
export const CONTACT_EMAIL = "team@usematura.xyz";

/**
 * Deployment status arrives as a build-time constant (landing cannot import
 * `@matura/chain`). Defaults to `false` → "Contracts deploying soon".
 */
export const CONTRACTS_DEPLOYED = process.env.NEXT_PUBLIC_CONTRACTS_DEPLOYED === "true";

/** BscScan testnet explorer base, shown only once contracts are deployed. */
export const BSCSCAN_TESTNET_URL = "https://testnet.bscscan.com";

/** GitHub doc deep-links surfaced on `/docs`. */
export const GITHUB_DOCS = {
  readme: `${GITHUB_URL}/blob/main/README.md`,
  architecture: `${GITHUB_URL}/blob/main/docs/architecture.md`,
  routing: `${GITHUB_URL}/blob/main/docs/routing.md`,
  threatModel: `${GITHUB_URL}/blob/main/docs/threat-model.md`,
} as const;

/** Primary section navigation, shared by the header and footer. */
export const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/protocol", label: "Protocol" },
  { href: "/for-issuers", label: "For issuers" },
  { href: "/docs", label: "Docs" },
] as const;
