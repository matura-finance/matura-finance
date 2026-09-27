import { EXECUTION_ROUTE_TYPES, routerDomain } from "@matura/chain/eip712";
import { hashTypedData, type Address, type Hex, type TypedDataDomain } from "viem";
import { z } from "zod";

import { env } from "../env";
import type { PrepareStep } from "../api/schemas";
import { toAddress, toHex32 } from "./bridge";

/**
 * Turn the server's `prepare-execution` typed-data step into everything the wallet +
 * router call need. The SAME coerced message feeds `signTypedData`, `hashTypedData`
 * (executionId), and `executeRoute` args — so the signature, the polled id, and the
 * submitted struct can never drift. Money strings → `bigint` via `BigInt` (NOT
 * `toBaseUnits`); addresses → `Address` via `getAddress`; bytes32 → `Hex`.
 */

// Money/uint256 fields are ALWAYS base-unit strings on the wire (never JSON numbers — a number
// > 2^53 would already be precision-truncated by JSON.parse before BigInt sees it).
const WireBig = z.string().regex(/^\d+$/, "expected a base-unit integer string");

const WireMessage = z.object({
  message: z.object({
    user: z.string(),
    targetAdvance: WireBig,
    maxTotalFace: WireBig,
    deadline: WireBig,
    nonce: WireBig,
    legs: z.array(
      z.object({
        claimId: z.string(),
        vault: z.string(),
        faceAmount: WireBig,
        minimumAdvanceAmount: WireBig,
      }),
    ),
  }),
});

export interface ExecutionRouteStruct {
  user: `0x${string}`;
  targetAdvance: bigint;
  maxTotalFace: bigint;
  deadline: bigint;
  nonce: bigint;
  legs: {
    claimId: Hex;
    vault: `0x${string}`;
    faceAmount: bigint;
    minimumAdvanceAmount: bigint;
  }[];
}

export interface PreparedRoute {
  domain: TypedDataDomain;
  message: ExecutionRouteStruct;
  executionId: Hex;
  /**
   * The pinned on-chain manifest router — the ONLY address the caller may submit `executeRoute`
   * to. Equals `toAddress(expectedRouter)` and, by the mismatch guard above, the signed/validated
   * target. Callers use this (never the API-claimed `verifyingContract`/`to`) as the write target.
   */
  router: Address;
}

/**
 * Coerce + hash a prepared route, pinning the signing/submit target to the on-chain manifest.
 *
 * Defense-in-depth: the API response is NEVER trusted for the contract we sign or submit to.
 * `expectedRouter` is the manifest router address (the single source of truth). If the step's
 * `verifyingContract`/`to` disagrees, we refuse — a compromised/malicious API cannot redirect a
 * signature or `executeRoute` call to an attacker contract. The EIP-712 domain's
 * `verifyingContract` is likewise pinned to the manifest router, not to the API's claimed value.
 *
 * Throws if the step is not a well-formed route typed-data step, or if its target does not match
 * `expectedRouter`.
 */
export function prepareRoute(step: PrepareStep, expectedRouter: string): PreparedRoute {
  const router = toAddress(expectedRouter);
  const target = toAddress(step.verifyingContract ?? step.to);
  if (target !== router) {
    throw new Error(
      `Route target ${target} does not match the on-chain manifest router ${router}; refusing to sign.`,
    );
  }
  const { message: raw } = WireMessage.parse(step.typedData);

  const message: ExecutionRouteStruct = {
    user: toAddress(raw.user),
    targetAdvance: BigInt(raw.targetAdvance),
    maxTotalFace: BigInt(raw.maxTotalFace),
    deadline: BigInt(raw.deadline),
    nonce: BigInt(raw.nonce),
    legs: raw.legs.map((leg) => ({
      claimId: toHex32(leg.claimId),
      vault: toAddress(leg.vault),
      faceAmount: BigInt(leg.faceAmount),
      minimumAdvanceAmount: BigInt(leg.minimumAdvanceAmount),
    })),
  };

  const domain = routerDomain(env.chainId, router);
  const executionId = hashTypedData({
    domain,
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message,
  });

  return { domain, message, executionId, router };
}
