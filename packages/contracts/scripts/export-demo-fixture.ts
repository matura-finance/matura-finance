// Emits `packages/shared/src/fixtures/demo.generated.ts` — the typed, checked-in demo fixture — from
// the on-chain-truth `config/demo.ts` + `config/vault-mandates.ts`. Mirrors the `@matura/chain`
// `gen-deployments.ts` pipeline (bigint → base-unit string; committed, not read as JSON at runtime;
// `as const satisfies`; guarded by a CI freshness gate). Run via `pnpm contracts:export-demo-fixture`
// (bare `node`, no chain — so the CI gate runs without a node).
//
// Boundary: this writes a plain `.ts` into `@matura/shared` by RELATIVE fs path (exactly like the ABI
// / manifest generators write into `@matura/chain`). It deliberately does NOT import `@matura/shared`
// — that would add a forbidden `@matura/*` dep to the self-contained `@matura/contracts` and create a
// generate-time cycle. The generated file's `as const satisfies DemoFixture` gives the compile-time
// type check; the shared `demo-fixture.test.ts` gives the runtime Zod + optimizer-feasibility check.
import { writeFileSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Our `config/*` sources use NodeNext `.js` import specifiers that point at `.ts` files (repo
// convention). Plain `node` type-stripping does not remap `.js` → `.ts`, so register a minimal
// resolve hook that does (copied from `packages/chain/scripts/gen-deployments.ts`), then dynamically
// import the config below (a static import would resolve before the hook is registered).
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(spec, ctx, next) {" +
        "  const fromDep = ctx.parentURL && ctx.parentURL.includes('/node_modules/');" +
        "  if (!fromDep && (spec.startsWith('./') || spec.startsWith('../')) && spec.endsWith('.js')) {" +
        "    return next(spec.slice(0, -3) + '.ts', ctx);" +
        "  }" +
        "  return next(spec, ctx);" +
        "}",
    ),
  import.meta.url,
);

// `.js` specifiers point at the `.ts` sources (repo convention): tsc resolves them under NodeNext,
// and the register hook above remaps them to `.ts` for the bare-`node` runtime.
const { ALICE_CLAIMS, REQUEST_A, REQUEST_B } = await import("../config/demo.js");
const { STABLE_MANDATE, FLEX_MANDATE } = await import("../config/vault-mandates.js");
const { CLAIM_TYPE } = await import("../config/constants.js");

/** Ordinal → claim-type name (reverse of `CLAIM_TYPE`). Total (throws on an unknown ordinal) so the
 *  result is never `undefined` — the fixture's `claimType` is a required enum. */
function typeName(ordinal: number): "PAYROLL" | "FREELANCE_ESCROW" | "STREAM" {
  switch (ordinal) {
    case CLAIM_TYPE.PAYROLL:
      return "PAYROLL";
    case CLAIM_TYPE.FREELANCE_ESCROW:
      return "FREELANCE_ESCROW";
    case CLAIM_TYPE.STREAM:
      return "STREAM";
    default:
      throw new Error(`unknown claim-type ordinal ${String(ordinal)}`);
  }
}

/** Every value below is derived from a `parseUnits(x, 6)` bigint, so `.toString()` is always a
 *  canonical base-unit integer string — the fixture schema's `/^\d+$/` can never fail by construction. */
const assertUnits = (value: string): string => {
  if (!/^\d+$/.test(value)) throw new Error(`non-canonical base-unit amount: ${value}`);
  return value;
};

/** Bitmap → the list of supported claim-type names (bit i ⇔ ordinal i). */
function supportedTypes(bitmap: number): ("PAYROLL" | "FREELANCE_ESCROW" | "STREAM")[] {
  return [CLAIM_TYPE.PAYROLL, CLAIM_TYPE.FREELANCE_ESCROW, CLAIM_TYPE.STREAM]
    .filter((ordinal) => (bitmap & (1 << ordinal)) !== 0)
    .map(typeName);
}

interface FixtureClaim {
  label: string;
  kind: "signed" | "escrow" | "stream";
  claimType: "PAYROLL" | "FREELANCE_ESCROW" | "STREAM";
  faceUnits: string;
  dueInDays: number;
}

const claims: FixtureClaim[] = ALICE_CLAIMS.map((claim) => {
  switch (claim.kind) {
    case "signed":
      return {
        label: claim.label,
        kind: "signed" as const,
        claimType: typeName(claim.claimType),
        faceUnits: assertUnits(claim.faceValue.toString()),
        dueInDays: claim.dueInDays,
      };
    case "escrow":
      return {
        label: claim.label,
        kind: "escrow" as const,
        claimType: typeName(claim.claimType),
        faceUnits: assertUnits(claim.amount.toString()),
        dueInDays: claim.dueInDays,
      };
    case "stream": {
      // Face at registration is vested-so-far = deposit * startOffsetDays / durationDays (linear
      // vesting); dueDate is the stream stop = now + (durationDays − startOffsetDays).
      const vested = (claim.deposit * BigInt(claim.startOffsetDays)) / BigInt(claim.durationDays);
      return {
        label: claim.label,
        kind: "stream" as const,
        claimType: typeName(claim.claimType),
        faceUnits: assertUnits(vested.toString()),
        dueInDays: claim.durationDays - claim.startOffsetDays,
      };
    }
  }
});

const requests = [REQUEST_A, REQUEST_B].map((req) => ({
  key: req.key,
  targetAdvanceUnits: assertUnits(req.targetAdvance.toString()),
  maxTotalFaceUnits: assertUnits(req.maxTotalFace.toString()),
  eligibleClaims: [...req.eligibleClaims],
}));

const vaults = [
  { name: "stable" as const, mandate: STABLE_MANDATE },
  { name: "flex" as const, mandate: FLEX_MANDATE },
].map(({ name, mandate }) => ({
  name,
  supportedTypes: supportedTypes(mandate.supportedTypesBitmap),
  baseDiscountBps: mandate.baseDiscountBps,
  durationBpsPerDay: mandate.durationBpsPerDay,
  maxDurationDays: mandate.maxDurationDays,
  minFaceUnits: assertUnits(mandate.minFace.toString()),
  maxFaceUnits: assertUnits(mandate.maxFace.toString()),
  liquidityCapUnits: assertUnits(mandate.liquidityCap.toString()),
  claimTypePremiumBps: [...mandate.claimTypePremiumBps],
}));

const fixture = {
  chainId: 97,
  generatedFrom: "packages/contracts/config/demo.ts",
  claims,
  requests,
  vaults,
};

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "../../shared/src/fixtures/demo.generated.ts");

const body =
  `// AUTO-GENERATED by packages/contracts/scripts/export-demo-fixture.ts — do not edit by hand.\n` +
  `import type { DemoFixture } from "./demo.js";\n\n` +
  `export const DEMO_FIXTURE = ${JSON.stringify(fixture, null, 2)} as const satisfies DemoFixture;\n`;

writeFileSync(outFile, body);

console.log(`Generated ${outFile} from config/demo.ts (${String(claims.length)} claims).`);
