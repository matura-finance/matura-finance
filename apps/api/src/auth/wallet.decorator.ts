import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

/** Request augmented by {@link WalletAuthGuard} with the authenticated, lowercased address. */
export interface WalletRequest {
  wallet?: string;
}

/**
 * Param decorator resolving the authenticated wallet address (lowercased) set by
 * {@link WalletAuthGuard}. Throws 401 if the guard did not run (e.g. a route mis-marked
 * `@Public()`), so the resolved value is a real `string` for authenticated routes.
 */
export const Wallet = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<WalletRequest>();
  if (request.wallet === undefined) throw new UnauthorizedException();
  return request.wallet;
});
