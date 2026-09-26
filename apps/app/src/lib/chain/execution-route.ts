import { EXECUTION_ROUTE_TYPES, routerDomain } from "@matura/chain/eip712";
import { hashTypedData, type Hex, type TypedDataDomain } from "viem";
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
}

/** Coerce + hash a prepared route. Throws if the step is not a well-formed route typed-data step. */
export function prepareRoute(step: PrepareStep): PreparedRoute {
  const verifying = step.verifyingContract ?? step.to;
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

  const domain = routerDomain(env.chainId, toAddress(verifying));
  const executionId = hashTypedData({
    domain,
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message,
  });

  return { domain, message, executionId };
}
