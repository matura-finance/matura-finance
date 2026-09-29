/**
 * Wallet-free site constants. Every `process.env.NEXT_PUBLIC_*` read here is
 * inlined at build time (declared in turbo.json `build.env`), so the landing
 * site stays fully static — no runtime env access, no cookies, no headers.
 */

/**
 * Resolve a public URL env var, falling back when it is absent OR an empty string. A Docker
 * build-arg that's declared-but-unset bakes an EMPTY string into ENV — which `??` would NOT fall
 * back on — and an empty `SITE_URL` makes `new URL("")` (metadataBase/sitemap/robots) crash the
 * build. Treat empty-after-trim as absent. (`||` is banned by `prefer-nullish-coalescing`.)
 */
function envUrl(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

/** The product app origin. Linked via a plain `<a>` (cross-origin). */
export const APP_URL = envUrl(process.env.NEXT_PUBLIC_APP_URL, "https://app.usematura.xyz");

/**
 * Public, read-only orchestration API origin. Only ever used for wallet-free
 * public read endpoints (e.g. `GET /api/v1/vaults`). No secrets, no wallet.
 */
export const API_URL = envUrl(process.env.NEXT_PUBLIC_API_URL, "https://api.usematura.xyz");

/** The canonical marketing origin — used for `metadataBase`, sitemap, robots. */
export const SITE_URL = envUrl(process.env.NEXT_PUBLIC_LANDING_URL, "https://usematura.xyz");

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

/** BNB Smart Chain Testnet id — the only network Matura targets. */
export const CHAIN_ID = 97;

/**
 * First block the deployment was indexed from — the "live since" figure in the
 * diagnostics panel. Mirrors `deploymentBlock` in the committed manifest.
 */
export const DEPLOYMENT_BLOCK = "133632667";

/**
 * Display-only mirror of the deployed BSC-Testnet addresses in
 * `packages/chain/src/deployments/97.json`. The landing bundle stays wallet-free
 * and cannot import `@matura/chain`, so these are surfaced here purely to render
 * BscScan proof links in the diagnostics section. Update on every redeploy.
 */
export const TESTNET_CONTRACTS = [
  {
    key: "router",
    label: "MaturaRouter",
    note: "Best-execution + on-chain leg re-validation",
    address: "0xaA685233Cf2334d53523fFaA368B36528f0cD955",
  },
  {
    key: "settlementManager",
    label: "SettlementManager",
    note: "Atomic, conservation-checked settlement",
    address: "0x74c25a326542D55434527fB3E43DF3D4a9397783",
  },
  {
    key: "claimRegistry",
    label: "ClaimRegistry",
    note: "Issuer-authorized claim state",
    address: "0x4208B8336024649492D2E57493a551fC96Ed5aA4",
  },
  {
    key: "vaultRegistry",
    label: "VaultRegistry",
    note: "Liquidity vaults + reservations",
    address: "0xF4d63f3d62c5d4D6122b6cb6C768f8d8D8daFC0e",
  },
  {
    key: "issuerRegistry",
    label: "IssuerRegistry",
    note: "Approved attestation signers",
    address: "0xe28bF3D985f883605F4B384b5aea54006890b97B",
  },
  {
    key: "mockUsdt",
    label: "MockUSDT",
    note: "6-decimal test settlement asset",
    address: "0x160d49be56a24e637d4084867133650ED31c9377",
  },
] as const;

/** Named liquidity vaults surfaced in the diagnostics panel. */
export const TESTNET_VAULTS = [
  {
    key: "stableVault",
    label: "Stable Vault",
    address: "0x897fa1b8651f21caCd5d4D50d740aF5CA6a137c5",
  },
  { key: "flexVault", label: "Flex Vault", address: "0x1853E27c413621Cf73A3B4aa69521dEaA48d276F" },
] as const;

/** BscScan deep-link for a testnet address. */
export function bscScanAddress(address: string): string {
  return `${BSCSCAN_TESTNET_URL}/address/${address}`;
}

/** GitHub doc deep-links surfaced in the nav/footer and terminal CTA. */
export const GITHUB_DOCS = {
  readme: `${GITHUB_URL}/blob/main/README.md`,
  architecture: `${GITHUB_URL}/blob/main/docs/architecture.md`,
  routing: `${GITHUB_URL}/blob/main/docs/routing.md`,
  threatModel: `${GITHUB_URL}/blob/main/docs/threat-model.md`,
} as const;

/**
 * Primary navigation for the single-page site. Every entry is an in-page
 * anchor (`#…`) to a section on `/`.
 */
export const NAV_LINKS = [
  { href: "#why", label: "Why Matura" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#protocol", label: "Protocol" },
  { href: "#issuers", label: "For issuers" },
] as const;
