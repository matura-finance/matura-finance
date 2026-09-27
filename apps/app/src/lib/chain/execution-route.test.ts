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

// The on-chain manifest router the app pins every signature + submit to.
const MANIFEST_ROUTER = ROUTER;
// An attacker-controlled contract a malicious/compromised API might try to redirect us to.
const EVIL = "0x000000000000000000000000000000000000dead";

describe("prepareRoute", () => {
  it("coerces wire strings to bigint (never re-scaled) and Hex/Address", () => {
    const { message } = prepareRoute(step, MANIFEST_ROUTER);
    expect(message.targetAdvance).toBe(4_800_000_000n);
    expect(message.nonce).toBe(0n);
    expect(message.legs[0]?.faceAmount).toBe(4_868_000_000n);
    expect(message.legs[0]?.claimId).toBe(CLAIM);
  });

  it("derives a deterministic bytes32 executionId from the coerced message", () => {
    const a = prepareRoute(step, MANIFEST_ROUTER);
    const b = prepareRoute(step, MANIFEST_ROUTER);
    expect(a.executionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a.executionId).toBe(b.executionId);
  });

  it("pins the EIP-712 domain's verifyingContract to the manifest router", () => {
    const { domain } = prepareRoute(step, MANIFEST_ROUTER);
    // getAddress-checksummed manifest router; never the API's claimed value.
    expect(domain.verifyingContract?.toLowerCase()).toBe(MANIFEST_ROUTER.toLowerCase());
  });

  it("returns the pinned manifest router as the submit target (never the API-claimed value)", () => {
    const { router } = prepareRoute(step, MANIFEST_ROUTER);
    // The write target callers must use — provably equals the (checksummed) manifest router.
    expect(router.toLowerCase()).toBe(MANIFEST_ROUTER.toLowerCase());
  });

  // ── C2: pin-to-manifest defense-in-depth ──────────────────────────────────
  // A malicious/compromised API response MUST NOT be able to redirect a signature or an
  // executeRoute submission to a contract other than the on-chain manifest router.
  it("refuses a step whose `to` targets a contract other than the manifest router", () => {
    const malicious: PrepareStep = { ...step, to: EVIL, verifyingContract: undefined };
    expect(() => prepareRoute(malicious, MANIFEST_ROUTER)).toThrow(/does not match/i);
  });

  it("refuses a step whose `verifyingContract` targets an attacker contract", () => {
    // `to` looks legitimate, but the (trusted-first) verifyingContract is the attacker's — refuse.
    const malicious: PrepareStep = { ...step, to: MANIFEST_ROUTER, verifyingContract: EVIL };
    expect(() => prepareRoute(malicious, MANIFEST_ROUTER)).toThrow(/does not match/i);
  });

  it("accepts when the target matches the manifest regardless of address checksum casing", () => {
    const mixedCase: PrepareStep = { ...step, to: ROUTER.toUpperCase().replace("0X", "0x") };
    expect(() => prepareRoute(mixedCase, MANIFEST_ROUTER)).not.toThrow();
  });
});
