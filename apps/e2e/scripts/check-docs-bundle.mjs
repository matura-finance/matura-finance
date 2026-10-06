// Fails if the docs production build leaks wallet/chain code or any server secret into its client
// bundle. The documentation site is static and wallet-free (like landing): contract addresses are
// generated from the manifest at build time via Node `fs` — never imported into the bundle.
// Run after `pnpm --filter @matura/docs build`.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SECRET_VALUE_PATTERNS,
  SERVER_SECRETS,
  resolveStaticDir,
  scanBundle,
} from "./lib/scan-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "docs", ".next", "static");

// Same FORBIDDEN set as the landing guard: wallet/chain identifiers that must never appear in the
// docs bundle, plus the shared server-secret names (SERVER_SECRETS). Secret VALUE patterns catch a
// genuinely inlined credential (belt-and-suspenders).
const FORBIDDEN = [
  /\bwagmi\b/,
  /walletconnect/i,
  /@matura\/chain/,
  /\bviem\b/,
  /createSiweMessage/,
  /writeContract/,
  ...SERVER_SECRETS,
];

const dir = resolveStaticDir(staticDir);
if (dir === null) {
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/docs build`);
  process.exit(1);
}

const { nameHits, valueHits } = scanBundle(dir, {
  namePatterns: FORBIDDEN,
  valuePatterns: SECRET_VALUE_PATTERNS,
});

if (nameHits.length > 0 || valueHits.length > 0) {
  console.error("Docs bundle leak detected:");
  for (const h of nameHits) console.error(`  name:${h.pattern}  →  ${h.file}`);
  for (const h of valueHits) console.error(`  value:${h.pattern}  →  ${h.file}`);
  process.exit(1);
}

console.log("Docs bundle is clean: no wallet/chain code or secrets in client chunks.");
