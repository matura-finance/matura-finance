import { describe, expect, it } from "vitest";
import { Claim } from "../claim.js";
import { Quote } from "../quote.js";
import { ExecutionRoute, RouteLeg } from "../route.js";
import { SettlementReceipt } from "../settlement.js";
import { Issuer } from "../issuer.js";
import { VaultSummary } from "../vault.js";
import { ApiError, ApiErrorResponse } from "../errors.js";

const ADDRESS = "0x52908400098527886e0f7030069857d2e4169ee7";
const CLAIM_ID = `0x${"ab".repeat(32)}`;
const EXECUTION_ID = `0x${"cd".repeat(32)}`;
const DUE_AT = "2026-12-31T00:00:00.000Z";

const baseClaim = {
  claimId: CLAIM_ID,
  beneficiary: ADDRESS,
  issuer: ADDRESS,
  claimType: "PAYROLL",
  token: ADDRESS,
  faceValue: "1000000",
  financedFaceValue: "0",
  dueAt: DUE_AT,
  state: "ELIGIBLE",
};

describe("Claim", () => {
  it("accepts a valid claim", () => {
    expect(Claim.safeParse(baseClaim).success).toBe(true);
  });

  it("rejects an invalid claim type", () => {
    expect(Claim.safeParse({ ...baseClaim, claimType: "BOGUS" }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(Claim.safeParse({ ...baseClaim, surprise: 1 }).success).toBe(false);
  });

  it("rejects financedFaceValue greater than faceValue", () => {
    expect(Claim.safeParse({ ...baseClaim, financedFaceValue: "2000000" }).success).toBe(false);
  });

  it("requires FUNDED claims to be fully financed", () => {
    expect(
      Claim.safeParse({
        ...baseClaim,
        state: "FUNDED",
        financedFaceValue: "500000",
      }).success,
    ).toBe(false);
    expect(
      Claim.safeParse({
        ...baseClaim,
        state: "FUNDED",
        financedFaceValue: "1000000",
      }).success,
    ).toBe(true);
  });

  it("requires PARTIALLY_FUNDED claims to be 0 < financed < face", () => {
    expect(
      Claim.safeParse({
        ...baseClaim,
        state: "PARTIALLY_FUNDED",
        financedFaceValue: "400000",
      }).success,
    ).toBe(true);
    expect(
      Claim.safeParse({
        ...baseClaim,
        state: "PARTIALLY_FUNDED",
        financedFaceValue: "0",
      }).success,
    ).toBe(false);
    expect(
      Claim.safeParse({
        ...baseClaim,
        state: "PARTIALLY_FUNDED",
        financedFaceValue: "1000000",
      }).success,
    ).toBe(false);
  });
});

const validQuote = {
  chainId: 97,
  vault: ADDRESS,
  user: ADDRESS,
  claimId: CLAIM_ID,
  faceAmount: "1000000",
  advanceAmount: "950000",
  expiry: DUE_AT,
  nonce: "1",
};

describe("Quote", () => {
  it("accepts a valid quote", () => {
    expect(Quote.safeParse(validQuote).success).toBe(true);
  });

  it("rejects a non-ISO expiry", () => {
    expect(Quote.safeParse({ ...validQuote, expiry: "soon" }).success).toBe(false);
  });

  it("rejects a non-numeric nonce", () => {
    expect(Quote.safeParse({ ...validQuote, nonce: "0x1" }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(Quote.safeParse({ ...validQuote, extra: true }).success).toBe(false);
  });
});

const validLeg = {
  claimId: CLAIM_ID,
  vault: ADDRESS,
  faceAmount: "1000000",
  advanceAmount: "950000",
  discountAmount: "50000",
};

const validRoute = {
  executionId: EXECUTION_ID,
  user: ADDRESS,
  targetAdvance: "950000",
  totalAdvance: "950000",
  totalFaceAssigned: "1000000",
  totalCost: "50000",
  legs: [validLeg],
};

describe("RouteLeg", () => {
  it("accepts a leg where advance == face - discount", () => {
    expect(RouteLeg.safeParse(validLeg).success).toBe(true);
  });

  it("rejects a leg where advance != face - discount", () => {
    expect(RouteLeg.safeParse({ ...validLeg, advanceAmount: "1" }).success).toBe(false);
  });
});

describe("ExecutionRoute", () => {
  it("accepts a route whose totals match its legs", () => {
    expect(ExecutionRoute.safeParse(validRoute).success).toBe(true);
  });

  it("rejects a route whose totalCost does not match its legs", () => {
    expect(ExecutionRoute.safeParse({ ...validRoute, totalCost: "999" }).success).toBe(false);
  });

  it("rejects a route whose totalFaceAssigned does not match its legs", () => {
    expect(ExecutionRoute.safeParse({ ...validRoute, totalFaceAssigned: "1" }).success).toBe(false);
  });
});

const validReceipt = {
  claimId: CLAIM_ID,
  amountReceived: "1000000",
  vaultDistribution: "900000",
  userResidual: "80000",
  protocolFee: "20000",
};

describe("SettlementReceipt", () => {
  it("accepts a receipt whose components sum to amountReceived", () => {
    expect(SettlementReceipt.safeParse(validReceipt).success).toBe(true);
  });

  it("rejects a receipt whose components do not sum to amountReceived", () => {
    expect(SettlementReceipt.safeParse({ ...validReceipt, protocolFee: "0" }).success).toBe(false);
  });
});

describe("Issuer", () => {
  it("accepts a valid issuer", () => {
    expect(
      Issuer.safeParse({
        address: ADDRESS,
        signer: ADDRESS,
        name: "Acme Corp",
        active: true,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      Issuer.safeParse({
        address: ADDRESS,
        signer: ADDRESS,
        name: "",
        active: true,
      }).success,
    ).toBe(false);
  });
});

describe("VaultSummary", () => {
  it("accepts a valid vault summary", () => {
    expect(
      VaultSummary.safeParse({
        vault: ADDRESS,
        token: ADDRESS,
        chainId: 97,
        totalAssets: "1000000",
        availableLiquidity: "500000",
        discountRateBps: 250,
      }).success,
    ).toBe(true);
  });

  it("rejects a discount rate above 10000 bps", () => {
    expect(
      VaultSummary.safeParse({
        vault: ADDRESS,
        token: ADDRESS,
        chainId: 97,
        totalAssets: "1000000",
        availableLiquidity: "500000",
        discountRateBps: 10001,
      }).success,
    ).toBe(false);
  });
});

describe("ApiError", () => {
  it("accepts a minimal error", () => {
    expect(ApiError.safeParse({ code: "NOT_FOUND", message: "missing" }).success).toBe(true);
  });

  it("accepts an error with details", () => {
    expect(
      ApiError.safeParse({
        code: "BAD_REQUEST",
        message: "invalid",
        details: { field: "faceValue" },
      }).success,
    ).toBe(true);
  });

  it("rejects an error missing a code", () => {
    expect(ApiError.safeParse({ message: "missing" }).success).toBe(false);
  });

  it("wraps an error in the response envelope", () => {
    expect(
      ApiErrorResponse.safeParse({
        error: { code: "INTERNAL", message: "boom" },
      }).success,
    ).toBe(true);
  });
});
