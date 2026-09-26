import { REASON_PRECEDENCE, type RejectionReason } from "@matura/shared";

/** UI copy + tone for every optimizer rejection reason. `satisfies` makes a new
 *  enum value fail compilation until copy is added (mirrors the enum-parity pattern). */
export const REASON_COPY = {
  NOT_OWNED_BY_WALLET: { label: "Not owned by this wallet", tone: "warning" },
  CLAIM_NOT_FINANCEABLE: { label: "Claim not currently financeable", tone: "warning" },
  UNSUPPORTED_CLAIM_TYPE: { label: "Claim type not supported by this vault", tone: "info" },
  ISSUER_INACTIVE: { label: "Issuer is not active", tone: "warning" },
  VAULT_INACTIVE: { label: "Vault is not active", tone: "warning" },
  TOKEN_MISMATCH: { label: "Token mismatch", tone: "warning" },
  EXCEEDS_DURATION: { label: "Maturity exceeds vault limit", tone: "info" },
  BELOW_MIN_LOT: { label: "Below the vault's minimum lot", tone: "info" },
  ABOVE_MAX_LOT: { label: "Above the vault's maximum lot", tone: "info" },
  NO_SLICES_REMAINING: { label: "No claim slices remaining", tone: "info" },
  MANDATE_REJECTED: { label: "Rejected by vault mandate", tone: "info" },
  INSUFFICIENT_LIQUIDITY: { label: "Insufficient vault liquidity", tone: "warning" },
  QUOTE_EXPIRED: { label: "Quote expired", tone: "warning" },
  MAX_COST_EXCEEDED: { label: "Above your maximum cost", tone: "info" },
  MAX_LEGS_REACHED: { label: "Route leg limit reached", tone: "info" },
  HIGHER_MARGINAL_COST: { label: "A cheaper option was chosen", tone: "info" },
  TARGET_UNSATISFIABLE: { label: "Not enough eligible face to reach the amount", tone: "warning" },
  NO_ELIGIBLE_CANDIDATES: { label: "No eligible claims", tone: "warning" },
  ROUTER_PAUSED: { label: "Routing is paused", tone: "warning" },
} satisfies Record<RejectionReason, { label: string; tone: "info" | "warning" }>;

/** Sort reasons by the canonical precedence (hard constraints first, economic last). */
export function sortByPrecedence<T extends { reason: RejectionReason }>(items: T[]): T[] {
  const order = new Map(REASON_PRECEDENCE.map((r, i) => [r, i]));
  return [...items].sort((a, b) => (order.get(a.reason) ?? 0) - (order.get(b.reason) ?? 0));
}
