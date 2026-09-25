import { keccak256, toHex, zeroHash } from "viem";

/// AccessControl role identifiers. `keccak256(toHex("X"))` is byte-identical to Solidity
/// `keccak256("X")`; DEFAULT_ADMIN_ROLE is bytes32(0). Single source shared by tests + Ignition.
export const ROLES = {
  DEFAULT_ADMIN_ROLE: zeroHash,
  ISSUER_ADMIN_ROLE: keccak256(toHex("ISSUER_ADMIN_ROLE")),
  CLAIM_REVIEWER_ROLE: keccak256(toHex("CLAIM_REVIEWER_ROLE")),
  ROUTER_ROLE: keccak256(toHex("ROUTER_ROLE")),
  SETTLEMENT_ROLE: keccak256(toHex("SETTLEMENT_ROLE")),
  PAUSER_ROLE: keccak256(toHex("PAUSER_ROLE")),
} as const;

/// Claim-type ordinals — MUST match packages/shared/src/enums.ts CLAIM_TYPES.
export const CLAIM_TYPE = { PAYROLL: 0, FREELANCE_ESCROW: 1, STREAM: 2 } as const;

/// Claim-state ordinals — MUST match packages/shared/src/enums.ts CLAIM_STATES.
export const CLAIM_STATE = {
  ATTESTED: 0,
  ELIGIBLE: 1,
  PARTIALLY_FUNDED: 2,
  FUNDED: 3,
  MATURED: 4,
  PAID: 5,
  DELAYED: 6,
  DISPUTED: 7,
  DEFAULTED: 8,
  REJECTED: 9,
  REVOKED: 10,
} as const;

export const USDT_DECIMALS = 6;
export const MAX_SLICES_PER_CLAIM = 8;
export const MAX_LEGS = 8;
export const MAX_DISCOUNT_BPS = 3000;
export const MAX_FEE_BPS = 500;
export const BPS_DENOMINATOR = 10_000n;

/// EIP-712 domain names — MUST match the contracts' EIP712(name, version) constructor args.
export const CLAIM_REGISTRY_DOMAIN_NAME = "MaturaClaimRegistry";
export const ROUTER_DOMAIN_NAME = "MaturaRouter";
export const DOMAIN_VERSION = "1";
