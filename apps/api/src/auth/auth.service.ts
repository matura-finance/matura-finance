import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getAddress } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";

import type { Env } from "../config/env.validation";
import { ChainService } from "../chain/chain.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthJwtService } from "./jwt.service";

/**
 * SIWE (EIP-4361) login flow. Nonces are single-use, expiring rows consumed atomically;
 * signature + bound fields are checked by viem, and chainId is asserted independently
 * (viem's SIWE verification does not check it). Success mints a session token.
 */
@Injectable()
export class AuthService {
  private readonly domain: string;
  private readonly chainId: number;
  private readonly nonceTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    config: ConfigService<Env, true>,
    private readonly jwt: AuthJwtService,
  ) {
    this.domain = config.get("SIWE_DOMAIN", { infer: true });
    this.chainId = config.get("CHAIN_ID", { infer: true });
    this.nonceTtlSeconds = config.get("SIWE_NONCE_TTL_SECONDS", { infer: true });
  }

  /**
   * Issues a fresh single-use nonce and persists it with its expiry, returning the fields a
   * client needs to assemble a verifiable SIWE message. Opportunistically prunes stale
   * (expired or already-used) rows so the table stays bounded without a scheduler.
   */
  async issueNonce(): Promise<{ nonce: string; domain: string; chainId: number }> {
    // Non-fatal cleanup: best-effort prune of stale rows before minting a fresh nonce.
    await this.prisma.authNonce.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true }] },
    });

    const nonce = generateSiweNonce();
    await this.prisma.authNonce.create({
      data: {
        nonce,
        domain: this.domain,
        chainId: this.chainId,
        expiresAt: new Date(Date.now() + this.nonceTtlSeconds * 1000),
      },
    });
    return { nonce, domain: this.domain, chainId: this.chainId };
  }

  /** Verifies a signed SIWE message and returns a session token, or throws 401. */
  async verify(message: string, signature: string): Promise<{ token: string; expiresAt: string }> {
    const fields = parseSiweMessage(message);
    if (fields.nonce === undefined) throw new UnauthorizedException("missing nonce");

    // Atomic single-use + expiry consume: exactly one unused, unexpired row must match.
    const { count } = await this.prisma.authNonce.updateMany({
      where: { nonce: fields.nonce, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (count !== 1) throw new UnauthorizedException("invalid or expired nonce");

    // The signature is DTO-validated as 0x-hex, so the narrowing is truthful. A malformed
    // payload that slips past viem's parsing must still surface as 401, not a 500.
    let valid: boolean;
    try {
      valid = await this.chain.client.verifySiweMessage({
        message,
        signature: signature as `0x${string}`,
        domain: this.domain,
        nonce: fields.nonce,
        time: new Date(),
      });
    } catch {
      throw new UnauthorizedException("invalid signature");
    }
    if (!valid) throw new UnauthorizedException("invalid signature");

    // viem's SIWE verify does NOT check chainId — assert it independently.
    if (fields.chainId !== this.chain.chainId) throw new UnauthorizedException("wrong chain");

    if (fields.address === undefined) throw new UnauthorizedException("missing address");
    const wallet = getAddress(fields.address).toLowerCase();

    return this.jwt.sign(wallet, this.chain.chainId);
  }
}
