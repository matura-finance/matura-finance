// Barrel for the deterministic best-execution router domain (pure, framework-free).
export { RouteCandidate } from "./candidate.js";
export { RejectionReason, REASON_PRECEDENCE, RejectedAlternative, rank } from "./reasons.js";
export { Explanation, ExplanationStep } from "./explanation.js";
export {
  OptimizeInput,
  OptimizeResult,
  RouteResult,
  RouteResultCore,
  NonExecutableResult,
  RouteIntentPayload,
  parseOptimizeInput,
  MAX_ROUTE_LEGS,
  EXACT_SEARCH_MAX_CLAIMS,
} from "./optimize-io.js";
export {
  ceilDiv,
  advanceForFace,
  discountForFace,
  minFaceForAdvance,
  maxFaceForAdvanceCap,
  effectiveDiscountBps,
  compareRateBps,
  BPS_DENOMINATOR,
} from "./arithmetic.js";
export { optimizeRoute } from "./optimize.js";
