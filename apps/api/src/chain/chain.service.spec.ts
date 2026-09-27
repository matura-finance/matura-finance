import type { ConfigService } from "@nestjs/config";
import { BaseError, ContractFunctionZeroDataError, type Hex, type PublicClient } from "viem";

import { ChainService, type OnChainClaim } from "./chain.service";
import type { Env } from "../config/env.validation";

const hex = (fill: string): Hex => `0x${fill}`;
const CLAIM_ID = hex("11".repeat(32));
const REGISTRY = hex("c".repeat(40));

interface Harness {
  service: ChainService;
  readContract: jest.Mock;
}

/**
 * Build a ChainService WITHOUT `onModuleInit` (which would open a real viem client). We inject a
 * mock client + addresses through the private refs so `getClaim`'s error discrimination is the
 * only behaviour under test.
 */
function makeService(): Harness {
  const config = { get: () => undefined } as unknown as ConfigService<Env, true>;
  const service = new ChainService(config);
  const readContract = jest.fn();
  const injected = service as unknown as {
    clientRef: PublicClient;
    addressesRef: { claimRegistry: Hex };
  };
  injected.clientRef = { readContract } as unknown as PublicClient;
  injected.addressesRef = { claimRegistry: REGISTRY };
  return { service, readContract };
}

describe("ChainService.getClaim read-through error discrimination (C6)", () => {
  it("returns null on a ContractFunctionZeroDataError (claim absent / empty return)", async () => {
    const { service, readContract } = makeService();
    readContract.mockRejectedValue(new ContractFunctionZeroDataError({ functionName: "getClaim" }));
    await expect(service.getClaim(CLAIM_ID)).resolves.toBeNull();
  });

  it("returns null when a revert-shaped error is nested in the cause chain (BaseError.walk)", async () => {
    const { service, readContract } = makeService();
    const wrapped = new BaseError("execution reverted", {
      cause: new ContractFunctionZeroDataError({ functionName: "getClaim" }),
    });
    readContract.mockRejectedValue(wrapped);
    await expect(service.getClaim(CLAIM_ID)).resolves.toBeNull();
  });

  it("propagates a plain transport error (NOT masked as null → becomes a 5xx upstream)", async () => {
    const { service, readContract } = makeService();
    const transport = new Error("HTTP request failed: ECONNREFUSED");
    readContract.mockRejectedValue(transport);
    await expect(service.getClaim(CLAIM_ID)).rejects.toBe(transport);
  });

  it("propagates a viem BaseError with no revert cause (transport-class failure)", async () => {
    const { service, readContract } = makeService();
    const transport = new BaseError("The HTTP request failed", { details: "timeout" });
    readContract.mockRejectedValue(transport);
    await expect(service.getClaim(CLAIM_ID)).rejects.toBe(transport);
  });

  it("maps a successful read to the OnChainClaim shape", async () => {
    const { service, readContract } = makeService();
    const raw: OnChainClaim = {
      beneficiary: hex("a".repeat(40)),
      claimType: 0,
      state: 1,
      sliceCount: 0,
      dueDate: 1_800_000_000n,
      issuer: hex("b".repeat(40)),
      token: hex("d".repeat(40)),
      faceValue: 1000n,
      financedFaceValue: 0n,
    };
    readContract.mockResolvedValue(raw);
    const claim = await service.getClaim(CLAIM_ID);
    expect(claim).toEqual<OnChainClaim>(raw);
  });
});
