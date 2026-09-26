import { type Hex } from "viem";
import { CLAIM_STATES } from "@matura/shared";

import type { PinnedReads } from "../chain/contracts.service";
import { conflict, unprocessable } from "./http-errors";
import { toHexAddress, validateBytes32 } from "./evm.util";
import { parseUint256 } from "./amount.util";

/** MaturaConstants.MAX_SLICES_PER_CLAIM — reserveSlice reverts once a claim has been sliced 8×. */
const MAX_SLICES_PER_CLAIM = 8;
const ELIGIBLE = CLAIM_STATES.indexOf("ELIGIBLE");
const PARTIALLY_FUNDED = CLAIM_STATES.indexOf("PARTIALLY_FUNDED");

/** A single leg to validate (money as decimal base-unit strings). */
export interface RouteLegInput {
  claimId: string;
  vault: string;
  faceAmount: string;
}

/** A leg that passed the full prepare-time mirror, with its fresh re-quoted advance. */
export interface ValidatedLeg {
  claimId: Hex;
  vault: Hex;
  faceAmount: bigint;
  advance: bigint;
}

/**
 * Authoritative prepare-time mirror of `MaturaRouter._validateLegs` PLUS the
 * `ClaimRegistry.reserveSlice` effects-phase checks (remaining face, slice count)
 * and `_requireNoDuplicateClaims`, evaluated against a single pinned block. This
 * is the ONE home for the on-chain leg-acceptance rules, shared by the routes and
 * executions prepare flows so they cannot drift (previously each had a partial,
 * divergent copy). Throws a coded error on the first failing condition; returns
 * each leg's fresh re-quoted advance so the caller can set the signed
 * `minimumAdvanceAmount`. Reads are pinned via {@link PinnedReads} — no `latest`.
 */
export async function validateRouteLegs(
  reads: PinnedReads,
  user: Hex,
  legs: readonly RouteLegInput[],
): Promise<ValidatedLeg[]> {
  if (legs.length === 0) throw unprocessable("EMPTY_ROUTE", "Route has no legs");

  // Per-leg checks + re-quote, concurrently (one pinned block).
  const validated = await Promise.all(
    legs.map(async (leg): Promise<ValidatedLeg> => {
      const claimId = validateBytes32(leg.claimId, "claimId");
      const vault = toHexAddress(leg.vault);
      const faceAmount = parseUint256(leg.faceAmount, "faceAmount");

      const claim = await reads.getClaim(claimId);
      if (claim === null) throw unprocessable("CLAIM_NOT_FOUND", `Claim ${claimId} not found`);
      if (claim.beneficiary.toLowerCase() !== user.toLowerCase()) {
        throw conflict(
          "BENEFICIARY_MISMATCH",
          `Claim ${claimId} beneficiary does not match the wallet`,
        );
      }
      if (claim.state !== ELIGIBLE && claim.state !== PARTIALLY_FUNDED) {
        throw unprocessable(
          "CLAIM_NOT_FINANCEABLE",
          `Claim ${claimId} is not in a financeable state`,
        );
      }
      if (faceAmount > claim.faceValue - claim.financedFaceValue) {
        throw unprocessable(
          "OVER_ASSIGNMENT",
          `Face exceeds remaining unfinanced amount for claim ${claimId}`,
        );
      }
      if (claim.sliceCount >= MAX_SLICES_PER_CLAIM) {
        throw unprocessable("MAX_SLICES_EXCEEDED", `Claim ${claimId} has no remaining slices`);
      }

      const [issuerActive, vaultActive, vaultToken] = await Promise.all([
        reads.isIssuerActive(claim.issuer),
        reads.isVaultActive(vault),
        reads.vaultToken(vault),
      ]);
      if (!issuerActive)
        throw unprocessable("ISSUER_INACTIVE", `Issuer inactive for claim ${claimId}`);
      if (!vaultActive) throw unprocessable("VAULT_INACTIVE", `Vault ${vault} is not active`);
      if (claim.token.toLowerCase() !== vaultToken.toLowerCase()) {
        throw unprocessable("TOKEN_MISMATCH", `Token mismatch for claim ${claimId}`);
      }

      const quote = await reads.quoteAndCheck(
        vault,
        claim.issuer,
        claim.claimType,
        faceAmount,
        claim.dueDate,
      );
      if (!quote.ok)
        throw unprocessable("MANDATE_REJECTED", `Vault rejected claim ${claimId} (mandate)`);

      return { claimId, vault, faceAmount, advance: quote.advanceAmount };
    }),
  );

  // Route-level: no duplicate claimId (on-chain _requireNoDuplicateClaims).
  const seen = new Set<string>();
  for (const leg of validated) {
    if (seen.has(leg.claimId))
      throw conflict("DUPLICATE_CLAIM_IN_ROUTE", `Duplicate claim in route: ${leg.claimId}`);
    seen.add(leg.claimId);
  }

  // Route-level: per-distinct-vault reserved advance ≤ fundable liquidity (one snapshot).
  const perVault = new Map<Hex, bigint>();
  for (const leg of validated)
    perVault.set(leg.vault, (perVault.get(leg.vault) ?? 0n) + leg.advance);
  await Promise.all(
    [...perVault.entries()].map(async ([vault, reserved]) => {
      const fundable = await reads.fundableLiquidity(vault);
      if (reserved > fundable)
        throw unprocessable("INSUFFICIENT_LIQUIDITY", `Insufficient vault liquidity for ${vault}`);
    }),
  );

  return validated;
}
