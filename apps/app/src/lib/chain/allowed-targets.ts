import { bscTestnet } from "@matura/chain/chains";
import { getDeployment } from "@matura/chain/deployments";

/**
 * Defense-in-depth for the issuer-demo dialogs, which submit server-produced calldata directly.
 * They may only ever target contracts from the pinned on-chain manifest — single-sourced here so
 * the allowlist and its sentinel error can't drift between the create and settle/delay flows.
 */
export const UNEXPECTED_TARGET_MESSAGE =
  "Refusing to submit a transaction to an unexpected contract";

/** The only addresses the issuer-demo flows may send transactions to (lowercased). */
export function manifestAllowedTargets(): Set<string> {
  const d = getDeployment(bscTestnet.id);
  return new Set([d.claimRegistry, d.settlementManager, d.mockUsdt].map((a) => a.toLowerCase()));
}

/** Throw {@link UNEXPECTED_TARGET_MESSAGE} if `to` is not a manifest address. */
export function assertAllowedTarget(to: string, allowed: Set<string>): void {
  if (!allowed.has(to.toLowerCase())) throw new Error(UNEXPECTED_TARGET_MESSAGE);
}

/** True when an error is the unexpected-target guard tripping (for catch-site branching). */
export function isUnexpectedTargetError(e: unknown): boolean {
  return e instanceof Error && e.message === UNEXPECTED_TARGET_MESSAGE;
}
