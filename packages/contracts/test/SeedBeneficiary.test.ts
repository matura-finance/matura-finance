import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address } from "viem";
import { resolveBeneficiary } from "../config/demo.js";

/// Pure coverage for the SEED_BENEFICIARY resolver — the guard that decides whether the interactive
/// demo claims go to an operator-supplied wallet or the deployer/Alice fallback, and that a malformed
/// env fails fast at seed rather than minting a claim to an unusable address. No chain, no node.

// A funded operator wallet the demo would connect (checksummed), and the deployer fallback.
const OPERATOR: Address = getAddress("0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
const DEPLOYER_FALLBACK: Address = getAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");

describe("resolveBeneficiary", () => {
  it("returns the fallback when SEED_BENEFICIARY is unset", () => {
    assert.equal(resolveBeneficiary(undefined, DEPLOYER_FALLBACK), DEPLOYER_FALLBACK);
  });

  it("returns the fallback when SEED_BENEFICIARY is blank / whitespace", () => {
    assert.equal(resolveBeneficiary("", DEPLOYER_FALLBACK), DEPLOYER_FALLBACK);
    assert.equal(resolveBeneficiary("   ", DEPLOYER_FALLBACK), DEPLOYER_FALLBACK);
  });

  it("returns the checksummed override when SEED_BENEFICIARY is a valid address", () => {
    assert.equal(resolveBeneficiary(OPERATOR, DEPLOYER_FALLBACK), OPERATOR);
  });

  it("normalizes a lower-case override to its checksummed form", () => {
    assert.equal(resolveBeneficiary(OPERATOR.toLowerCase(), DEPLOYER_FALLBACK), OPERATOR);
  });

  it("trims surrounding whitespace before resolving", () => {
    assert.equal(resolveBeneficiary(`  ${OPERATOR}  `, DEPLOYER_FALLBACK), OPERATOR);
  });

  it("rejects a too-short / wrong-length / non-hex / garbage address", () => {
    assert.throws(() => resolveBeneficiary("0x1234", DEPLOYER_FALLBACK), /not a valid address/);
    assert.throws(
      () => resolveBeneficiary("not-an-address", DEPLOYER_FALLBACK),
      /not a valid address/,
    );
    // Right length but a non-hex character.
    assert.throws(
      () => resolveBeneficiary("0x70997970c51812dc3a010c7d01b50e0d17dc79cg", DEPLOYER_FALLBACK),
      /not a valid address/,
    );
  });
});
