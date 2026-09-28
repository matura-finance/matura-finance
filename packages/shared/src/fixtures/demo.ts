import { z } from "zod";

/**
 * Deterministic demo-scenario fixture — the checked-in, judge-facing mirror of
 * `packages/contracts/config/demo.ts` (Alice's claims, Request A/B calibration, the two vault
 * mandates). It is the single source of truth for the numbers cited in `README.md` and
 * `docs/demo-script.md`, and the pre-demo smoke test asserts the live chain matches it.
 *
 * The concrete data lives in the generated `demo.generated.ts` (`export const DEMO_FIXTURE = {…}
 * as const satisfies DemoFixture`), emitted by `packages/contracts/scripts/export-demo-fixture.ts`
 * and guarded by a CI freshness gate — mirroring the `@matura/chain` `deployments.generated.ts`
 * pipeline (validated, generated; never hand-edited).
 *
 * Money is a 6-dp MockUSDT base-unit integer string (`/^\d+$/`). This is a PLAIN string (not the
 * branded `BaseUnitAmount`) on purpose: a generated `as const` object holds raw string literals,
 * which structurally satisfy `string` but not a phantom-branded type — so `satisfies DemoFixture`
 * would fail against a branded field. The regex still forbids a non-canonical amount.
 */
const Units = z.string().regex(/^\d+$/, "base-unit integer string");

/** Claim-type name (mirrors the `CLAIM_TYPE` ordinals: PAYROLL=0, FREELANCE_ESCROW=1, STREAM=2). */
export const DemoClaimType = z.enum(["PAYROLL", "FREELANCE_ESCROW", "STREAM"]);
export type DemoClaimType = z.infer<typeof DemoClaimType>;

/** One of Alice's seeded, ELIGIBLE claims. `faceUnits` is exact for signed/escrow; for a stream it
 *  is the expected vested-at-registration face (`deposit * startOffsetDays / durationDays`). */
export const DemoClaim = z
  .object({
    label: z.string(),
    kind: z.enum(["signed", "escrow", "stream"]),
    claimType: DemoClaimType,
    faceUnits: Units,
    dueInDays: z.number().int().nonnegative(),
  })
  .strict();
export type DemoClaim = z.infer<typeof DemoClaim>;

/** A best-execution request calibration (the optimizer inputs the demo drives). Arrays are
 *  `.readonly()` so the generated `as const` fixture (deeply readonly) satisfies this schema. */
export const DemoRequest = z
  .object({
    key: z.enum(["A", "B"]),
    targetAdvanceUnits: Units,
    maxTotalFaceUnits: Units,
    eligibleClaims: z.array(z.string()).min(1).readonly(),
  })
  .strict();
export type DemoRequest = z.infer<typeof DemoRequest>;

/** A named vault mandate (Stable / Flex) — the pricing + eligibility envelope for routing. */
export const DemoVault = z
  .object({
    name: z.enum(["stable", "flex"]),
    supportedTypes: z.array(DemoClaimType).min(1).readonly(),
    baseDiscountBps: z.number().int().nonnegative(),
    durationBpsPerDay: z.number().int().nonnegative(),
    maxDurationDays: z.number().int().positive(),
    minFaceUnits: Units,
    maxFaceUnits: Units,
    liquidityCapUnits: Units,
    claimTypePremiumBps: z.array(z.number().int().nonnegative()).length(3).readonly(),
  })
  .strict();
export type DemoVault = z.infer<typeof DemoVault>;

/** The whole demo fixture. `chainId` is the BSC-Testnet target the demo runs against. */
export const DemoFixture = z
  .object({
    chainId: z.literal(97),
    generatedFrom: z.literal("packages/contracts/config/demo.ts"),
    claims: z.array(DemoClaim).min(1).readonly(),
    requests: z.array(DemoRequest).min(1).readonly(),
    vaults: z.array(DemoVault).min(1).readonly(),
  })
  .strict();
export type DemoFixture = z.infer<typeof DemoFixture>;
