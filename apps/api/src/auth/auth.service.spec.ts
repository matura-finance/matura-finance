import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { parseSiweMessage } from "viem/siwe";

import type { Env } from "../config/env.validation";
import type { ChainService } from "../chain/chain.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import type { AuthJwtService } from "./jwt.service";

jest.mock("viem/siwe", () => ({
  parseSiweMessage: jest.fn(),
  generateSiweNonce: jest.fn(() => "nonce-123"),
}));

const parseMock = parseSiweMessage as jest.Mock;

const CHAIN_ID = 31337;
const ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";
const MESSAGE = "example.com wants you to sign in";
const SIGNATURE = `0x${"11".repeat(65)}`;

interface Mocks {
  service: AuthService;
  updateMany: jest.Mock;
  verifySiweMessage: jest.Mock;
  sign: jest.Mock;
}

function makeService(): Mocks {
  const updateMany = jest.fn();
  const verifySiweMessage = jest.fn();
  const sign = jest.fn();

  const prisma = { authNonce: { create: jest.fn(), updateMany } } as unknown as PrismaService;
  const chain = { chainId: CHAIN_ID, client: { verifySiweMessage } } as unknown as ChainService;
  const config = {
    get: (key: keyof Env): unknown => {
      if (key === "SIWE_DOMAIN") return "example.com";
      if (key === "CHAIN_ID") return CHAIN_ID;
      if (key === "SIWE_NONCE_TTL_SECONDS") return 300;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
  const jwt = { sign } as unknown as AuthJwtService;

  return { service: new AuthService(prisma, chain, config, jwt), updateMany, verifySiweMessage, sign };
}

describe("AuthService.verify", () => {
  beforeEach(() => {
    parseMock.mockReset();
    parseMock.mockReturnValue({ nonce: "nonce-123", chainId: CHAIN_ID, address: ADDRESS });
  });

  it("rejects when the nonce is already used or expired (updateMany count 0)", async () => {
    const { service, updateMany, verifySiweMessage } = makeService();
    updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verify(MESSAGE, SIGNATURE)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifySiweMessage).not.toHaveBeenCalled();
  });

  it("rejects on chainId mismatch even when signature is valid", async () => {
    const { service, updateMany, verifySiweMessage } = makeService();
    updateMany.mockResolvedValue({ count: 1 });
    verifySiweMessage.mockResolvedValue(true);
    parseMock.mockReturnValue({ nonce: "nonce-123", chainId: 1, address: ADDRESS });

    await expect(service.verify(MESSAGE, SIGNATURE)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns a session token on the happy path", async () => {
    const { service, updateMany, verifySiweMessage, sign } = makeService();
    updateMany.mockResolvedValue({ count: 1 });
    verifySiweMessage.mockResolvedValue(true);
    const session = { token: "jwt-token", expiresAt: "2026-01-01T00:00:00.000Z" };
    sign.mockResolvedValue(session);

    await expect(service.verify(MESSAGE, SIGNATURE)).resolves.toEqual(session);
    expect(sign).toHaveBeenCalledWith(ADDRESS.toLowerCase(), CHAIN_ID);
  });
});
