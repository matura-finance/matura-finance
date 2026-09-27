import { OptimizeResult } from "@matura/shared";
import { isHex, type Hex } from "viem";
import { z } from "zod";

/// A 0x-hex string, validated + typed as viem `Hex` at the boundary (no downstream `as Hex` casts).
const HexString = z.custom<Hex>((v) => typeof v === "string" && isHex(v), "expected 0x-hex");

/// The freshly-deployed manifest, read from disk at runtime (NOT via @matura/chain's compiled
/// getManifest, which is bound to the dist loaded at import time — before the stack deploys).
export const Manifest = z.object({
  chainId: z.number(),
  deploymentBlock: z.string(),
  addresses: z.object({
    mockUsdt: z.string(),
    issuerRegistry: z.string(),
    claimRegistry: z.string(),
    vaultRegistry: z.string(),
    router: z.string(),
    settlementManager: z.string(),
  }),
  namedVaults: z.object({ stableVault: z.string(), flexVault: z.string() }),
  sources: z.object({ payroll: z.string(), freelance: z.string(), stream: z.string() }),
});
export type Manifest = z.infer<typeof Manifest>;

/// Thin Zod mirrors of the apps/api HTTP wire shapes the e2e consumes. The API DTOs are not
/// importable across packages, so we mirror only what we use — and reuse `@matura/shared`'s
/// `OptimizeResult` directly (the single source of truth for the optimizer shape). Money is a
/// base-unit decimal string everywhere.

export const NonceResponse = z.object({
  nonce: z.string(),
  domain: z.string(),
  chainId: z.number(),
});
export type NonceResponse = z.infer<typeof NonceResponse>;

export const SessionResponse = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const OptimizeResponse = z.object({
  chainId: z.number(),
  blockNumber: z.string(),
  finalizedThrough: z.string(),
  routeId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  result: OptimizeResult,
  filteredOut: z.array(
    z.object({ claimId: z.string(), vault: z.string().nullable(), reason: z.string() }),
  ),
});
export type OptimizeResponse = z.infer<typeof OptimizeResponse>;

/// The EIP-712 ExecutionRoute message the prepare step carries (numeric fields are decimal strings
/// on the wire). We validate + coerce this instead of trusting a raw `unknown` typedData blob.
export const ExecutionRouteMessage = z.object({
  user: z.string(),
  targetAdvance: z.string(),
  maxTotalFace: z.string(),
  deadline: z.string(),
  nonce: z.string(),
  legs: z.array(
    z.object({
      claimId: HexString,
      vault: HexString,
      faceAmount: z.string(),
      minimumAdvanceAmount: z.string(),
    }),
  ),
});
export type ExecutionRouteMessage = z.infer<typeof ExecutionRouteMessage>;

/// The prepare envelope, narrowed to the one typed-data ExecutionRoute step the route flow returns.
export const PrepareResponse = z.object({
  chainId: z.number(),
  finalizedThrough: z.string(),
  steps: z
    .array(
      z.object({
        kind: z.enum(["typed-data", "transaction"]),
        to: z.string(),
        submitFunction: z.string().optional(),
        typedData: z
          .object({
            domain: z.object({ verifyingContract: z.string() }).loose(),
            primaryType: z.string(),
            message: ExecutionRouteMessage,
          })
          .optional(),
      }),
    )
    .min(1),
});
export type PrepareResponse = z.infer<typeof PrepareResponse>;

/// The claim read-model detail, including its settlement projection (present ⇒ the DB projected the
/// ClaimSettled event; null ⇒ never settled or served from the chain read-through fallback).
export const ClaimDetail = z.object({
  claimId: z.string(),
  beneficiary: z.string(),
  state: z.string(),
  faceValue: z.string(),
  financedFaceValue: z.string(),
  finalizedThrough: z.string(),
  settlement: z
    .object({
      amountReceived: z.string(),
      vaultDistribution: z.string(),
      userResidual: z.string(),
      protocolFee: z.string(),
    })
    .nullable(),
});
export type ClaimDetail = z.infer<typeof ClaimDetail>;
