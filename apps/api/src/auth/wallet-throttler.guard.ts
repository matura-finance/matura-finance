import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate-limit by authenticated wallet when present, falling back to IP. Because
 * `WalletAuthGuard` is registered BEFORE this guard, `request.wallet` is already
 * resolved for authenticated routes, so a wallet cannot dodge per-principal
 * limits by rotating source IPs (and NAT'd wallets don't share one IP budget).
 * Public routes have no wallet and fall back to IP.
 */
@Injectable()
export class WalletThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const wallet = typeof req.wallet === "string" ? req.wallet : undefined;
    const ip = typeof req.ip === "string" ? req.ip : "";
    return Promise.resolve(wallet ?? ip);
  }
}
