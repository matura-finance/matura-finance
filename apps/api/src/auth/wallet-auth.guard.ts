import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";

import type { Env } from "../config/env.validation";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { AuthJwtService } from "./jwt.service";
import type { WalletRequest } from "./wallet.decorator";

/** Request shape the guard needs: bearer header in, resolved wallet out. */
interface GuardedRequest extends WalletRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Fail-closed global guard. Every route is authenticated unless explicitly marked `@Public()`.
 * Validates the `Authorization: Bearer <token>` session token and pins the lowercased wallet
 * onto the request for the {@link Wallet} param decorator.
 */
@Injectable()
export class WalletAuthGuard implements CanActivate {
  private readonly chainId: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: AuthJwtService,
    config: ConfigService<Env, true>,
  ) {
    this.chainId = config.get("CHAIN_ID", { infer: true });
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest<GuardedRequest>();
    const token = extractBearer(request.headers.authorization);
    if (token === null) throw new UnauthorizedException("missing bearer token");

    const { wallet, chainId } = await this.jwt.verify(token);
    // Re-assert the token's bound chain: a shared JWT_SECRET across deploys (e.g. 31337/97)
    // must not let a token minted on one chain authenticate on another.
    if (chainId !== this.chainId) throw new UnauthorizedException("wrong chain");
    request.wallet = wallet.toLowerCase();
    return true;
  }
}

/** Parses a single `Bearer <token>` Authorization header, or null if missing/malformed. */
function extractBearer(header: string | string[] | undefined): string | null {
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.length === 0) return null;
  return token;
}
