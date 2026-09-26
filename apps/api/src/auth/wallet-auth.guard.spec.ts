import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Reflector } from "@nestjs/core";

import type { Env } from "../config/env.validation";
import type { AuthJwtService } from "./jwt.service";
import type { WalletRequest } from "./wallet.decorator";
import { WalletAuthGuard } from "./wallet-auth.guard";

const WALLET = "0x52908400098527886E0F7030069857D2E4169EE7";
const CHAIN_ID = 31337;

interface RequestWithHeaders extends WalletRequest {
  headers: Record<string, string | undefined>;
}

function makeContext(request: RequestWithHeaders): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(isPublic: boolean, verify: jest.Mock): WalletAuthGuard {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
  const jwt = { verify } as unknown as AuthJwtService;
  const config = {
    get: (key: keyof Env): unknown => (key === "CHAIN_ID" ? CHAIN_ID : undefined),
  } as unknown as ConfigService<Env, true>;
  return new WalletAuthGuard(reflector, jwt, config);
}

describe("WalletAuthGuard", () => {
  it("allows public routes without a token", async () => {
    const verify = jest.fn();
    const guard = makeGuard(true, verify);
    const ctx = makeContext({ headers: {} });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects when no bearer header is present", async () => {
    const verify = jest.fn();
    const guard = makeGuard(false, verify);
    const ctx = makeContext({ headers: {} });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it("sets request.wallet (lowercased) on a valid token", async () => {
    const verify = jest.fn().mockResolvedValue({ wallet: WALLET, chainId: CHAIN_ID });
    const guard = makeGuard(false, verify);
    const request: RequestWithHeaders = { headers: { authorization: `Bearer good-token` } };
    const ctx = makeContext(request);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith("good-token");
    expect(request.wallet).toBe(WALLET.toLowerCase());
  });

  it("rejects a token bound to a different chainId", async () => {
    const verify = jest.fn().mockResolvedValue({ wallet: WALLET, chainId: 97 });
    const guard = makeGuard(false, verify);
    const request: RequestWithHeaders = { headers: { authorization: `Bearer good-token` } };
    const ctx = makeContext(request);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.wallet).toBeUndefined();
  });
});
