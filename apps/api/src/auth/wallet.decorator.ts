import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

/** Request augmented by {@link WalletAuthGuard} with the authenticated, lowercased address. */
export interface WalletRequest {
  wallet?: string;
}

/**
 * Param decorator resolving the authenticated wallet address (lowercased) set by
 * {@link WalletAuthGuard}. Undefined on public routes that skipped the guard.
 */
export const Wallet = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<WalletRequest>();
  return request.wallet;
});
