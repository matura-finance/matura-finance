import { BadRequestException } from "@nestjs/common";

import { AccountService } from "./account.service";
import type { CursorService } from "../cursor/cursor.service";
import type { PrismaService } from "../prisma/prisma.service";

const WALLET = "0x52908400098527886E0F7030069857D2E4169EE7";

function makeService(findMany: jest.Mock): AccountService {
  const prisma = { claimProjection: { findMany } } as unknown as PrismaService;
  const cursor = { finalizedThrough: jest.fn().mockResolvedValue("42") } as unknown as CursorService;
  return new AccountService(prisma, cursor);
}

describe("AccountService", () => {
  it("returns an empty portfolio (200) for a wallet with no claims", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const result = await makeService(findMany).getPortfolio(WALLET);
    expect(result.wallet).toBe(WALLET.toLowerCase());
    expect(result.claims).toHaveLength(0);
    expect(result.finalizedThrough).toBe("42");
  });

  it("maps projected claims to the DTO shape", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        claimId: `0x${"11".repeat(32)}`,
        beneficiary: WALLET.toLowerCase(),
        issuer: "0xdef",
        claimType: "STREAM",
        token: "0x111",
        faceValue: "10000000000",
        financedFaceValue: "0",
        dueAt: new Date("2026-11-01T00:00:00.000Z"),
        state: "ELIGIBLE",
      },
    ]);
    const result = await makeService(findMany).getPortfolio(WALLET);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.claimType).toBe("STREAM");
    expect(result.claims[0]?.dueAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("rejects a malformed wallet with 400", async () => {
    await expect(makeService(jest.fn()).getPortfolio("nope")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
