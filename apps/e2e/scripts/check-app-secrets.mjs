// Fails if the product-app production build leaks any SERVER secret into its client bundle.
// Run after `pnpm --filter @matura/app build`.
//
// Unlike the wallet-free landing site (see check-landing-bundle.mjs), the product app is
// EXPECTED to ship wallet/chain code (wagmi/viem/@matura/chain) — that is not a leak. What must
// NEVER reach the browser is a server-side secret: the attestation/deploy keys, the JWT signing
// secret, or the database URL. Those live only in the API/deploy processes.
//
// Two layers of detection (see scripts/lib/scan-bundle.mjs for the rationale):
//   - NAME check: catches an accidental hard-coded reference to a server env identifier.
//   - VALUE check: Next inlines a referenced public env as its VALUE and strips server envs to
//     `undefined`, so a genuine leak would inline the secret VALUE and the identifier would NOT
//     appear. The value patterns catch that case (connection strings, JWTs, key-adjacent hex).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SECRET_VALUE_PATTERNS,
  SERVER_SECRETS,
  resolveStaticDir,
  scanBundle,
} from "./lib/scan-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "app", ".next", "static");

const dir = resolveStaticDir(staticDir);
if (dir === null) {
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/app build`);
  process.exit(1);
}

const { nameHits, valueHits } = scanBundle(dir, {
  namePatterns: SERVER_SECRETS,
  valuePatterns: SECRET_VALUE_PATTERNS,
});

if (nameHits.length > 0 || valueHits.length > 0) {
  console.error("Product-app bundle secret leak detected:");
  for (const h of nameHits) console.error(`  name:  ${h.pattern}  →  ${h.file}`);
  // Value matches are redacted: we print the pattern name, never the matched secret.
  for (const h of valueHits) console.error(`  value: ${h.pattern} (redacted)  →  ${h.file}`);
  process.exit(1);
}

console.log("Product-app bundle is clean: no server secrets in client chunks.");
