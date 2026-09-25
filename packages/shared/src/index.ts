// Barrel for `@matura/shared`.
//
// isolatedModules + verbatimModuleSyntax require that names re-exported as
// TYPES ONLY use `export type`. Every schema below is also a runtime value, so a
// plain `export { ... }` re-export carries both the value (schema/constructor)
// and its inferred type. `AddressString` is the only type-only export.

// Enums (Zod enums + inferred union types + ordered source-of-truth arrays).
export { ClaimType, ClaimState, CLAIM_TYPES, CLAIM_STATES } from "./enums.js";

// Branded scalar value-types + their constructors.
export { BaseUnitAmount, makeBaseUnitAmount, MAX_UINT256 } from "./money.js";
export {
  EvmAddress,
  NormalizedAddress,
  isChecksumAddress,
  makeEvmAddress,
  makeNormalizedAddress,
  toNormalized,
  toAddressString,
} from "./address.js";
export type { AddressString } from "./address.js";
export { ClaimId, makeClaimId } from "./ids.js";

// Domain schemas.
export { Issuer } from "./issuer.js";
export { VaultSummary } from "./vault.js";
export { Quote } from "./quote.js";
export { RouteLeg, ExecutionRoute } from "./route.js";
export { SettlementReceipt } from "./settlement.js";
export { Claim } from "./claim.js";

// API error envelope.
export { ApiError, ApiErrorResponse } from "./errors.js";
