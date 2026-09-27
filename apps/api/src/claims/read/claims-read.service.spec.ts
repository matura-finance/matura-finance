import { BadRequestException, NotFoundException } from "@nestjs/common";

import type { ChainService, OnChainClaim } from "../../chain/chain.service";
import type { CursorService } from "../../cursor/cursor.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { ClaimsReadService } from "./claims-read.service";

const CLAIM_ID = `0x${"ab".repeat(32)}`;

interface Mocks {
  findUnique: jest.Mock;
  getClaim: jest.Mock;
  service: ClaimsReadService;
}

function makeService(): Mocks {
  const findUnique = jest.fn();
  const getClaim = jest.fn();
  const prisma = { claimProjection: { findUnique } } as unknown as PrismaService;
  const chain = { getClaim } as unknown as ChainService;
  const cursor = {
    finalizedThrough: jest.fn().mockResolvedValue("100"),
  } as unknown as CursorService;
  return { findUnique, getClaim, service: new ClaimsReadService(prisma, chain, cursor) };
}

describe("ClaimsReadService", () => {
  it("rejects a malformed claimId with 400", async () => {
    const { service } = makeService();
    await expect(service.getClaim("0xabc")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("serves a projected claim with finalizedThrough", async () => {
    const { findUnique, service } = makeService();
    findUnique.mockResolvedValue({
      claimId: CLAIM_ID,
      beneficiary: "0xabc",
      issuer: "0xdef",
      claimType: "PAYROLL",
      token: "0x111",
      faceValue: "20000000000",
      financedFaceValue: "0",
      dueAt: new Date("2026-10-01T00:00:00.000Z"),
      state: "ELIGIBLE",
      settlement: null,
    });
    const result = await service.getClaim(CLAIM_ID);
    expect(result.state).toBe("ELIGIBLE");
    expect(result.pending).toBeUndefined();
    expect(result.finalizedThrough).toBe("100");
  });

  it("falls back to a chain read tagged pending on a projection miss", async () => {
    const { findUnique, getClaim, service } = makeService();
    findUnique.mockResolvedValue(null);
    const onChain: OnChainClaim = {
      beneficiary: "0xABC0000000000000000000000000000000000001",
      claimType: 0,
      state: 1,
      sliceCount: 0,
      dueDate: 1_800_000_000n,
      issuer: "0xDEF0000000000000000000000000000000000002",
      token: "0x1110000000000000000000000000000000000003",
      faceValue: 20_000_000_000n,
      financedFaceValue: 0n,
    };
    getClaim.mockResolvedValue(onChain);
    const result = await service.getClaim(CLAIM_ID);
    expect(result.pending).toBe(true);
    expect(result.claimType).toBe("PAYROLL");
    expect(result.state).toBe("ELIGIBLE");
    expect(result.beneficiary).toBe("0xabc0000000000000000000000000000000000001");
  });

  it("404s when the claim exists nowhere", async () => {
    const { findUnique, getClaim, service } = makeService();
    findUnique.mockResolvedValue(null);
    getClaim.mockResolvedValue(null);
    await expect(service.getClaim(CLAIM_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("propagates a chain read-through transport error instead of masking it as a 404 (C6)", async () => {
    // A revert (claim absent) is `getClaim === null` → 404. A transport/RPC failure must NOT be
    // swallowed into a 404/null: the ChainService distinguishes them via BaseError.walk, so a
    // rejected read-through propagates here (→ 5xx), never a misleading CLAIM_NOT_FOUND.
    const { findUnique, getClaim, service } = makeService();
    findUnique.mockResolvedValue(null);
    const transportError = new Error("HTTP request failed: ECONNREFUSED");
    getClaim.mockRejectedValue(transportError);
    await expect(service.getClaim(CLAIM_ID)).rejects.toBe(transportError);
    await expect(service.getClaim(CLAIM_ID)).rejects.not.toBeInstanceOf(NotFoundException);
  });
});
