import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.validation";
import { AuthJwtService } from "./jwt.service";

const WALLET = "0x52908400098527886e0f7030069857d2e4169ee7";
const CHAIN_ID = 31337;

function makeService(secret: string): AuthJwtService {
  const config = {
    get: (key: keyof Env): unknown => {
      if (key === "JWT_SECRET") return secret;
      if (key === "JWT_TTL_SECONDS") return 900;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
  return new AuthJwtService(config);
}

describe("AuthJwtService", () => {
  const secret = "test-secret-that-is-at-least-32-characters-long";

  it("round-trips wallet + chainId through sign then verify", async () => {
    const service = makeService(secret);
    const { token, expiresAt } = await service.sign(WALLET, CHAIN_ID);
    expect(token).toEqual(expect.any(String));
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const claims = await service.verify(token);
    expect(claims).toEqual({ wallet: WALLET, chainId: CHAIN_ID });
  });

  it("rejects a token signed with a different secret", async () => {
    const signer = makeService(secret);
    const verifier = makeService("another-secret-that-is-32-chars-minimum-xx");
    const { token } = await signer.sign(WALLET, CHAIN_ID);

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a tampered token", async () => {
    const service = makeService(secret);
    const { token } = await service.sign(WALLET, CHAIN_ID);
    const tampered = `${token}tampered`;

    await expect(service.verify(tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
