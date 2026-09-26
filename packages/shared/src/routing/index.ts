// Barrel for the deterministic best-execution router domain (pure, framework-free).
// The `arithmetic.ts` primitives are internal to this module (imported directly
// by optimize.ts + the tests), so they are deliberately NOT re-exported here.
export { RouteCandidate } from "./candidate.js";
export { RejectionReason, REASON_PRECEDENCE, RejectedAlternative } from "./reasons.js";
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
export { optimizeRoute } from "./optimize.js";
