import { describe, expect, it } from "vitest";

import type { PrepareStep } from "../api/schemas";
import { prepareRoute } from "./execution-route";

const ROUTER = "0x00000000000000000000000000000000000000aa";
const CLAIM = "0x1111111111111111111111111111111111111111111111111111111111111111";
const VAULT = "0x00000000000000000000000000000000000000bb";

const step: PrepareStep = {
  kind: "typed-data",
  to: ROUTER,
  value: "0",
  verifyingContract: ROUTER,
  submitFunction: "executeRoute",
  typedData: {
    message: {
      user: "0x00000000000000000000000000000000000000cc",
      targetAdvance: "4800000000",
      maxTotalFace: "6000000000",
      deadline: "1900000000",
      nonce: "0",
      legs: [
        {
          claimId: CLAIM,
          vault: VAULT,
          faceAmount: "4868000000",
          minimumAdvanceAmount: "4800000000",
        },
      ],
    },
  },
};

describe("prepareRoute", () => {
  it("coerces wire strings to bigint (never re-scaled) and Hex/Address", () => {
    const { message } = prepareRoute(step);
    expect(message.targetAdvance).toBe(4_800_000_000n);
    expect(message.nonce).toBe(0n);
    expect(message.legs[0]?.faceAmount).toBe(4_868_000_000n);
    expect(message.legs[0]?.claimId).toBe(CLAIM);
  });

  it("derives a deterministic bytes32 executionId from the coerced message", () => {
    const a = prepareRoute(step);
    const b = prepareRoute(step);
    expect(a.executionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a.executionId).toBe(b.executionId);
  });
});
