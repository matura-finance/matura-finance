// Shared scan harness for the client-bundle guards (check-landing-bundle.mjs, check-app-secrets.mjs).
//
// Both guards walk a Next.js `.next/static` tree, read every `.js` chunk, and grep for
// forbidden strings. This module factors out the common pieces:
//   - walkJs(dir): recursive `.js` collector
//   - SERVER_SECRETS: the server-secret NAME patterns forbidden in ANY client bundle
//   - SECRET_VALUE_PATTERNS: named patterns that match leaked secret VALUES (see below)
//
// Why value patterns and not just names?
// Next.js inlines a referenced `NEXT_PUBLIC_` env as its literal VALUE, and replaces a
// server-only env with `undefined`. So a genuine leak would inline the secret's VALUE — the
// literal identifier (e.g. `ISSUER_PRIVATE_KEY`) would NOT appear in the chunk. A name-only
// grep can therefore green-light a real leak. The NAME check is kept as belt-and-suspenders
// (it catches accidental hard-coded references), and the VALUE patterns below catch the
// actual inlined-secret case.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Recursively collect every `.js` file under `dir`. */
export function walkJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkJs(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

// Server-secret NAMES — must never be inlined into any client chunk. Shared by both guards.
export const SERVER_SECRETS = [
  /ISSUER_PRIVATE_KEY/,
  /JWT_SECRET/,
  /DEPLOYER_PRIVATE_KEY/,
  /DATABASE_URL/,
];

// Secret-VALUE patterns. Each match names the pattern only — the raw match is redacted in output
// so the guard's own logs never echo a leaked secret.
//
// Scope / false-positive tradeoff (deliberate):
// We do NOT ship a blanket `0x[0-9a-fA-F]{64}` (or bare 64-hex) rule. A real production build of
// the product app legitimately contains such strings — EVM bytecode fragments, secp256k1 curve
// constants (the curve order `0xffff…364141`, the field prime `0xffff…fffc2f`), viem placeholders
// (e.g. the ERC-6492 magic suffix), and keccak256 hashes / event topics. Flagging all 0x-64hex
// would fail every clean build and make the guard useless. Instead we use patterns that are
// unambiguous about carrying a *credential*:
//   1. Postgres connection strings that embed `user:pass@host` (the DATABASE_URL leak shape).
//   2. JWT-shaped tokens (header.payload.signature, both segments base64 JSON => `eyJ…`).
//   3. A hex value sitting ADJACENT to a private-key-ish identifier. Terser/Next mangle local
//      bindings but preserve object *property* names, so a shipped `{ issuerPrivateKey: "0x…" }`
//      survives as a name→value pair — the one hex case we can flag without false positives.
export const SECRET_VALUE_PATTERNS = [
  {
    name: "postgres-connection-string-with-credentials",
    regex: /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s:@/]+@[^\s"'`/]+/,
  },
  {
    name: "jwt-token",
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  },
  {
    name: "private-key-adjacent-hex",
    regex:
      /(?:private[_-]?key|privatekey|issuer[_-]?key|deployer[_-]?key|signing[_-]?key|secret[_-]?key)["'`\s]*[:=]\s*["'`]?(?:0x)?[0-9a-fA-F]{64}\b/i,
  },
];

/**
 * Resolve a `.next/static` dir, returning the absolute path or `null` if it doesn't exist.
 * Callers treat `null` as "no build output" and exit 1 with a build hint.
 */
export function resolveStaticDir(staticDir) {
  try {
    return statSync(staticDir).isDirectory() ? staticDir : null;
  } catch {
    return null;
  }
}

/**
 * Scan every `.js` chunk under `dir` for the given name patterns and value patterns.
 * Returns `{ nameHits, valueHits }` where nameHits are `{ file, pattern }` (pattern source string)
 * and valueHits are `{ file, pattern }` (the pattern NAME only — the match itself is never echoed).
 */
export function scanBundle(dir, { namePatterns = [], valuePatterns = [] } = {}) {
  const nameHits = [];
  const valueHits = [];
  for (const file of walkJs(dir)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of namePatterns) {
      if (pattern.test(text)) nameHits.push({ file, pattern: pattern.source });
    }
    for (const { name, regex } of valuePatterns) {
      if (regex.test(text)) valueHits.push({ file, pattern: name });
    }
  }
  return { nameHits, valueHits };
}
