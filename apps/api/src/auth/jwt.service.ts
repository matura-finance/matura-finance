import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import type { Env } from "../config/env.validation";

/** Shape of a valid session token payload once decoded. */
const PayloadSchema = z.object({ sub: z.string(), chainId: z.number().int() });

/**
 * Signs and verifies stateless HS256 session tokens. The signing algorithm is pinned on
 * both sides so a token can never be accepted under a downgraded/`none` alg.
 */
@Injectable()
export class AuthJwtService {
  private readonly key: Uint8Array;
  private readonly ttlSeconds: number;
  private readonly domain: string;

  constructor(config: ConfigService<Env, true>) {
    const secret = config.get("JWT_SECRET", { infer: true });
    this.ttlSeconds = config.get("JWT_TTL_SECONDS", { infer: true });
    this.domain = config.get("SIWE_DOMAIN", { infer: true });
    this.key = new TextEncoder().encode(secret);
  }

  /** Issues a token for `wallet` bound to `chainId`, returning the token and its ISO expiry. */
  async sign(wallet: string, chainId: number): Promise<{ token: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    const token = await new SignJWT({ chainId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(wallet)
      .setIssuer(this.domain)
      .setAudience(this.domain)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /** Verifies a token (alg + issuer/audience pinned) and returns its bound wallet + chainId, or throws 401. */
  async verify(token: string): Promise<{ wallet: string; chainId: number }> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: this.domain,
        audience: this.domain,
      });
      const parsed = PayloadSchema.parse({ sub: payload.sub, chainId: payload.chainId });
      return { wallet: parsed.sub, chainId: parsed.chainId };
    } catch {
      throw new UnauthorizedException("invalid token");
    }
  }
}
