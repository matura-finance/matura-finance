// Fails if the product-app production build leaks any SERVER secret into its client bundle.
// Run after `pnpm --filter @matura/app build`.
//
// Unlike the wallet-free landing site (see check-landing-bundle.mjs), the product app is
// EXPECTED to ship wallet/chain code (wagmi/viem/@matura/chain) — that is not a leak. What must
// NEVER reach the browser is a server-side secret: the attestation/deploy keys, the JWT signing
// secret, or the database URL. Those live only in the API/deploy processes; if any string ever
// appears in a client chunk it means a `NEXT_PUBLIC_`-less env was inlined by mistake.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "app", ".next", "static");

// Server secrets — must never be inlined into any client chunk. Only these are forbidden;
// wallet/chain identifiers are intentionally allowed in the product app.
const FORBIDDEN = [/ISSUER_PRIVATE_KEY/, /JWT_SECRET/, /DEPLOYER_PRIVATE_KEY/, /DATABASE_URL/];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

let dir;
try {
  dir = statSync(staticDir).isDirectory() ? staticDir : null;
} catch {
  dir = null;
}
if (dir === null) {
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/app build`);
  process.exit(1);
}

const hits = [];
for (const file of walk(dir)) {
  const text = readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) hits.push({ file, pattern: pattern.source });
  }
}

if (hits.length > 0) {
  console.error("Product-app bundle secret leak detected:");
  for (const h of hits) console.error(`  ${h.pattern}  →  ${h.file}`);
  process.exit(1);
}

console.log("Product-app bundle is clean: no server secrets in client chunks.");
