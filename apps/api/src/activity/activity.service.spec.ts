import { ActivityService } from "./activity.service";
import { decodeCursor } from "../common/pagination";
import type { CursorService } from "../cursor/cursor.service";
import type { PrismaService } from "../prisma/prisma.service";

const WALLET = "0x52908400098527886E0F7030069857D2E4169EE7";

function row(block: bigint, logIndex: number): Record<string, unknown> {
  return {
    id: `${block.toString()}-${logIndex.toString()}`,
    wallet: WALLET.toLowerCase(),
    kind: "ClaimRegistered",
    claimId: `0x${"11".repeat(32)}`,
    executionId: null,
    payload: { faceValue: "1" },
    txHash: `0x${"22".repeat(32)}`,
    blockNumber: block,
    logIndex,
  };
}

function makeService(findMany: jest.Mock): ActivityService {
  const prisma = { activityEvent: { findMany } } as unknown as PrismaService;
  const cursor = { finalizedThrough: jest.fn().mockResolvedValue("500") } as unknown as CursorService;
  return new ActivityService(prisma, cursor);
}

describe("ActivityService", () => {
  it("returns an empty page for a wallet with no activity", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const page = await makeService(findMany).getActivity(WALLET, { limit: 25 });
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
    expect(page.finalizedThrough).toBe("500");
  });

  it("emits a nextCursor when more rows exist than the page limit", async () => {
    const findMany = jest.fn().mockResolvedValue([row(10n, 2), row(10n, 1), row(9n, 0)]);
    const page = await makeService(findMany).getActivity(WALLET, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    const decoded = decodeCursor(page.nextCursor ?? "");
    expect(decoded.block).toBe(10n);
    expect(decoded.logIndex).toBe(1);
    expect(page.items[0]?.blockNumber).toBe("10");
  });

  it("returns null nextCursor when the last page fits", async () => {
    const findMany = jest.fn().mockResolvedValue([row(10n, 2), row(10n, 1)]);
    const page = await makeService(findMany).getActivity(WALLET, { limit: 25 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });
});
