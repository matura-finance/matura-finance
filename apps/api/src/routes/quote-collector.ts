import { type Hex } from "viem";
import { CLAIM_STATES, CLAIM_TYPES, type RejectionReason } from "@matura/shared";

import type { PinnedReads, VaultMandate } from "../chain/contracts.service";

/** MaturaConstants.MAX_SLICES_PER_CLAIM — a claim can be sliced at most 8 times over its life. */
const MAX_SLICES_PER_CLAIM = 8;
const SECONDS_PER_DAY = 86_400n;
const ELIGIBLE = CLAIM_STATES.indexOf("ELIGIBLE");
const PARTIALLY_FUNDED = CLAIM_STATES.indexOf("PARTIALLY_FUNDED");

/** A plain candidate object (RouteCandidate shape) ready to feed the pure optimizer. */
export interface CollectedCandidate {
  claimId: string;
  vault: string;
  claimType: string;
  dueDate: string;
  remainingFace: string;
  minFace: string;
  maxFace: string;
  vaultFundable: string;
  rateBps: number;
  slicesRemaining: number;
}

export interface CollectedRejection {
  claimId: string;
  vault: string;
  reason: RejectionReason;
}

export interface CollectionResult {
  candidates: CollectedCandidate[];
  rejected: CollectedRejection[];
}

interface ActiveVault {
  address: Hex;
  mandate: VaultMandate;
  fundable: bigint;
  token: Hex;
}

function ceilRateBps(discount: bigint, face: bigint): number {
  return Number((discount * 10_000n + face - 1n) / face);
}

/**
 * Collect eligible `(claim, vault)` financing candidates from a pinned block.
 * Applies every hard constraint the router's `_validateLegs` + the vault mandate
 * enforce, mapping each failure to a machine-readable reason. Only `ok` candidates
 * become optimizer input; everything else is a rejected alternative. Filters
 * claims to `beneficiary == wallet` before quoting (no IDOR info leak). Wallet and
 * claimIds are lowercased `Hex`; reads share one block via {@link PinnedReads}.
 */
export async function collectCandidates(
  reads: PinnedReads,
  blockTimestamp: bigint,
  wallet: Hex,
  claimIds: Hex[],
): Promise<CollectionResult> {
  // Wave 1: enumerate + qualify vaults (getVaults returns ALL vaults, not active-only).
  const vaultAddrs = await reads.getVaults();
  const vaults = (
    await Promise.all(
      vaultAddrs.map(async (address): Promise<ActiveVault | null> => {
        const [active, mandate, fundable, token] = await Promise.all([
          reads.isVaultActive(address),
          reads.getMandate(address),
          reads.fundableLiquidity(address),
          reads.vaultToken(address),
        ]);
        return active ? { address, mandate, fundable, token } : null;
      }),
    )
  ).filter((v): v is ActiveVault => v !== null);

  const candidates: CollectedCandidate[] = [];
  const rejected: CollectedRejection[] = [];

  // Wave 2: per claim, qualify then quote against every active vault.
  await Promise.all(
    claimIds.map(async (claimId) => {
      const claim = await reads.getClaim(claimId);
      const rejectAll = (reason: RejectionReason): void => {
        if (vaults.length === 0) rejected.push({ claimId, vault: claimId, reason });
        else for (const v of vaults) rejected.push({ claimId, vault: v.address, reason });
      };

      if (claim === null) {
        rejectAll("NOT_OWNED_BY_WALLET");
        return;
      }
      if (claim.beneficiary.toLowerCase() !== wallet.toLowerCase()) {
        rejectAll("NOT_OWNED_BY_WALLET");
        return;
      }
      if (claim.state !== ELIGIBLE && claim.state !== PARTIALLY_FUNDED) {
        rejectAll("CLAIM_NOT_FINANCEABLE");
        return;
      }
      const slicesRemaining = MAX_SLICES_PER_CLAIM - claim.sliceCount;
      if (slicesRemaining <= 0) {
        rejectAll("NO_SLICES_REMAINING");
        return;
      }
      if (!(await reads.isIssuerActive(claim.issuer))) {
        rejectAll("ISSUER_INACTIVE");
        return;
      }
      const remaining = claim.faceValue - claim.financedFaceValue;
      const claimTypeName = CLAIM_TYPES[claim.claimType];
      if (claimTypeName === undefined) {
        rejectAll("CLAIM_NOT_FINANCEABLE");
        return;
      }

      await Promise.all(
        vaults.map(async (v) => {
          const reject = (reason: RejectionReason): void => {
            rejected.push({ claimId, vault: v.address, reason });
          };
          if (((v.mandate.supportedTypesBitmap >> claim.claimType) & 1) === 0) {
            reject("UNSUPPORTED_CLAIM_TYPE");
            return;
          }
          if (claim.token.toLowerCase() !== v.token.toLowerCase()) {
            reject("TOKEN_MISMATCH");
            return;
          }
          if (claim.dueDate <= blockTimestamp) {
            reject("CLAIM_NOT_FINANCEABLE");
            return;
          }
          const daysToDue = (claim.dueDate - blockTimestamp) / SECONDS_PER_DAY;
          if (daysToDue > BigInt(v.mandate.maxDurationDays)) {
            reject("EXCEEDS_DURATION");
            return;
          }
          if (remaining < v.mandate.minFace) {
            reject("BELOW_MIN_LOT");
            return;
          }

          const maxFace = remaining < v.mandate.maxFace ? remaining : v.mandate.maxFace;
          const quote = await reads.quoteAndCheck(
            v.address,
            claim.issuer,
            claim.claimType,
            maxFace,
            claim.dueDate,
          );
          if (!quote.ok) {
            reject("MANDATE_REJECTED");
            return;
          }

          candidates.push({
            claimId,
            vault: v.address.toLowerCase(),
            claimType: claimTypeName,
            dueDate: claim.dueDate.toString(),
            remainingFace: remaining.toString(),
            minFace: v.mandate.minFace.toString(),
            maxFace: maxFace.toString(),
            vaultFundable: v.fundable.toString(),
            rateBps: ceilRateBps(quote.discountAmount, maxFace),
            slicesRemaining,
          });
        }),
      );
    }),
  );

  return { candidates, rejected };
}
