// Fails if the landing production build leaks wallet/chain code or any server secret
// into its client bundle. Run after `pnpm --filter @matura/landing build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "landing", ".next", "static");

// Wallet/chain identifiers that must never appear in the marketing bundle.
const FORBIDDEN = [
  /\bwagmi\b/,
  /walletconnect/i,
  /@matura\/chain/,
  /createSiweMessage/,
  /writeContract/,
  // Server secrets — must never be inlined into any client chunk.
  /ISSUER_PRIVATE_KEY/,
  /DEPLOYER_PRIVATE_KEY/,
  /DATABASE_URL/,
  /JWT_SECRET/,
];

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
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/landing build`);
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
  console.error("Landing bundle leak detected:");
  for (const h of hits) console.error(`  ${h.pattern}  →  ${h.file}`);
  process.exit(1);
}

console.log("Landing bundle is clean: no wallet/chain code or secrets in client chunks.");
