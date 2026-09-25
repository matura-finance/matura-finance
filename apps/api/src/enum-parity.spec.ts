import { CLAIM_TYPES, CLAIM_STATES } from "@matura/shared";
import {
  ClaimType as PrismaClaimType,
  ClaimState as PrismaClaimState,
} from "./generated/prisma/enums";

// Authoritative Solidity ordinal order — mirror of
// packages/contracts/contracts/libraries/ClaimEnums.sol (ClaimTypes / ClaimStates).
// If you reorder the on-chain enums, update this array and the Solidity library together.
const SOLIDITY_CLAIM_TYPES = ["PAYROLL", "FREELANCE_ESCROW", "STREAM"] as const;
const SOLIDITY_CLAIM_STATES = [
  "ATTESTED",
  "ELIGIBLE",
  "PARTIALLY_FUNDED",
  "FUNDED",
  "MATURED",
  "PAID",
  "DELAYED",
  "DISPUTED",
  "DEFAULTED",
  "REJECTED",
  "REVOKED",
] as const;

describe("enum parity (Solidity ⇄ @matura/shared ⇄ Prisma)", () => {
  it("claim types agree in order across all three layers", () => {
    expect([...CLAIM_TYPES]).toEqual([...SOLIDITY_CLAIM_TYPES]);
    expect(Object.values(PrismaClaimType)).toEqual([...SOLIDITY_CLAIM_TYPES]);
  });

  it("claim states agree in order across all three layers", () => {
    expect([...CLAIM_STATES]).toEqual([...SOLIDITY_CLAIM_STATES]);
    expect(Object.values(PrismaClaimState)).toEqual([...SOLIDITY_CLAIM_STATES]);
  });
});
