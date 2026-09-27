// Fails if the landing production build leaks wallet/chain code or any server secret
// into its client bundle. Run after `pnpm --filter @matura/landing build`.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_SECRETS, resolveStaticDir, scanBundle } from "./lib/scan-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "landing", ".next", "static");

// Wallet/chain identifiers that must never appear in the marketing bundle, plus the shared
// server-secret names (SERVER_SECRETS) forbidden in every client bundle.
const FORBIDDEN = [
  /\bwagmi\b/,
  /walletconnect/i,
  /@matura\/chain/,
  /createSiweMessage/,
  /writeContract/,
  ...SERVER_SECRETS,
];

const dir = resolveStaticDir(staticDir);
if (dir === null) {
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/landing build`);
  process.exit(1);
}

const { nameHits } = scanBundle(dir, { namePatterns: FORBIDDEN });

if (nameHits.length > 0) {
  console.error("Landing bundle leak detected:");
  for (const h of nameHits) console.error(`  ${h.pattern}  →  ${h.file}`);
  process.exit(1);
}

console.log("Landing bundle is clean: no wallet/chain code or secrets in client chunks.");
