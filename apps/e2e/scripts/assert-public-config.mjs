// Positive bake assertion for the product app's `NEXT_PUBLIC_*` config.
// Run after `pnpm --filter @matura/app build` (with the deploy's build-args set).
//
// Next.js inlines each referenced `NEXT_PUBLIC_*` env as its literal VALUE at build time. A
// wrong or empty value does NOT throw — it is silently baked as its fallback (or `undefined`),
// which then breaks the build-time CSP `connect-src` (the app can't reach its API/RPC) with no
// error at deploy. The negative guards (check-app-secrets.mjs) only prove secrets are ABSENT;
// this guard proves the expected PUBLIC origins are PRESENT.
//
// It asserts the built chunks contain, as plain substrings:
//   - EXPECT_API_URL  — the API origin baked from NEXT_PUBLIC_API_URL (e.g. https://api.matura.xyz)
//   - EXPECT_RPC_URL  — the RPC origin baked from NEXT_PUBLIC_RPC_URL
//   - EXPECT_CHAIN_ID — the chain id (default "97"), matched as the quoted string literal ("97"),
//                       since NEXT_PUBLIC_CHAIN_ID is read as a string (see apps/app/src/lib/env.ts).
//
// Exit 1 (with a human-readable report) if any expected literal is ABSENT, or if there is no build.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolveStaticDir, walkJs } from "./lib/scan-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, "..", "..", "app", ".next", "static");

// EXPECT_API_URL + EXPECT_RPC_URL are required (no sane fallback in production). EXPECT_CHAIN_ID
// defaults to the BSC-testnet id this MVP targets.
const apiUrl = process.env.EXPECT_API_URL;
const rpcUrl = process.env.EXPECT_RPC_URL;
const chainId = process.env.EXPECT_CHAIN_ID ?? "97";

const missingEnv = [];
if (apiUrl === undefined || apiUrl === "") missingEnv.push("EXPECT_API_URL");
if (rpcUrl === undefined || rpcUrl === "") missingEnv.push("EXPECT_RPC_URL");
if (missingEnv.length > 0) {
  console.error(`assert-public-config: missing required env: ${missingEnv.join(", ")}`);
  console.error(
    "  Set EXPECT_API_URL + EXPECT_RPC_URL (and optionally EXPECT_CHAIN_ID, default 97).",
  );
  process.exit(1);
}

// Each expected literal: a human label + the exact substring that must appear in some chunk.
// The chain id is inlined as a string, so we look for its quoted form to avoid matching a bare
// numeric that could appear inside a hash or offset.
const expected = [
  { label: "API origin (NEXT_PUBLIC_API_URL)", literal: apiUrl },
  { label: "RPC origin (NEXT_PUBLIC_RPC_URL)", literal: rpcUrl },
  { label: "chain id (NEXT_PUBLIC_CHAIN_ID)", literal: `"${chainId}"` },
];

const dir = resolveStaticDir(staticDir);
if (dir === null) {
  console.error(`No build output at ${staticDir}. Run: pnpm --filter @matura/app build`);
  process.exit(1);
}

// Read every chunk once; a literal is "present" if it appears in any chunk.
const found = new Set();
for (const file of walkJs(dir)) {
  const text = readFileSync(file, "utf8");
  for (const { literal } of expected) {
    if (!found.has(literal) && text.includes(literal)) found.add(literal);
  }
}

const absent = expected.filter(({ literal }) => !found.has(literal));
if (absent.length > 0) {
  console.error("Product-app bundle is MISSING expected NEXT_PUBLIC_* literals:");
  for (const { label, literal } of absent) console.error(`  absent: ${label}  →  ${literal}`);
  console.error("A wrong/empty NEXT_PUBLIC_* bakes silently and breaks the CSP connect-src.");
  console.error("Rebuild the app image with the correct build-args (see the env matrix).");
  process.exit(1);
}

console.log("Product-app bundle baked the expected public config:");
for (const { label, literal } of expected) console.log(`  present: ${label}  →  ${literal}`);
