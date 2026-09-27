import type { PrismaService } from "../src/prisma/prisma.service";
import {
  RouteIntentService,
  type CreateRouteIntentInput,
} from "../src/routes/route-intent.service";
import { startTestDb, type TestDb } from "./db/postgres-testcontainer";

// Integration test: RouteIntent single-use guarantee against a REAL Postgres — the atomic
// `updateMany` consume + create-or-ignore no-revive semantics can only be proven on a real DB.
// Requires Docker (Testcontainers). Run via `pnpm test:int`; NOT part of `pnpm test`.

const USER = "0xaaa0000000000000000000000000000000000001";
const OTHER = "0xbbb0000000000000000000000000000000000002";

function input(overrides: Partial<CreateRouteIntentInput> = {}): CreateRouteIntentInput {
  return {
    routeId: `0x${"11".repeat(32)}`,
    user: USER,
    targetAdvance: "500",
    maxTotalFace: null,
    maxTotalCost: null,
    totalAdvance: "500",
    totalFaceAssigned: "510",
    totalCost: "10",
    effectiveDiscountBps: 100,
    legs: [],
    rejected: [],
    explanation: {},
    quoteSnapshotHash: `0x${"22".repeat(32)}`,
    blockNumber: 10n,
    routeDeadlineSeconds: 300,
    expiresAt: new Date(Date.now() + 120_000),
    ...overrides,
  };
}

describe("RouteIntentService single-use (integration)", () => {
  let db: TestDb;
  let service: RouteIntentService;

  beforeAll(async () => {
    db = await startTestDb();
    service = new RouteIntentService(db.prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.prisma.routeIntent.deleteMany({});
  });

  it("consumes a PENDING intent exactly once", async () => {
    await service.createIfAbsent(input());
    const first = await service.consume(input().routeId, USER);
    expect(first).not.toBeNull();
    expect(first?.status).toBe("CONSUMED");
    const second = await service.consume(input().routeId, USER);
    expect(second).toBeNull();
  });

  it("lets exactly one of two concurrent consumers win (atomic updateMany guard)", async () => {
    await service.createIfAbsent(input());
    const [a, b] = await Promise.all([
      service.consume(input().routeId, USER),
      service.consume(input().routeId, USER),
    ]);
    const winners = [a, b].filter((row) => row !== null);
    expect(winners).toHaveLength(1);
    // The one persisted row is CONSUMED; there is never a duplicate.
    expect(await db.prisma.routeIntent.count()).toBe(1);
  });

  it("returns null for an expired intent (never consumable)", async () => {
    await service.createIfAbsent(input({ expiresAt: new Date(Date.now() - 1000) }));
    expect(await service.consume(input().routeId, USER)).toBeNull();
  });

  it("returns null when consumed by a different user (owner-scoped)", async () => {
    await service.createIfAbsent(input());
    expect(await service.consume(input().routeId, OTHER)).toBeNull();
    // Still PENDING and consumable by the real owner.
    expect((await service.consume(input().routeId, USER))?.status).toBe("CONSUMED");
  });

  it("never revives a CONSUMED routeId on an identical re-optimize (create-or-ignore, no upsert)", async () => {
    await service.createIfAbsent(input());
    await service.consume(input().routeId, USER);
    // Re-optimizing identical inputs collides on the PK: returns the existing (CONSUMED) row,
    // NEVER a fresh PENDING one — so the spent routeId can't be resurrected.
    const revived = await service.createIfAbsent(input());
    expect(revived.status).toBe("CONSUMED");
    expect(await service.consume(input().routeId, USER)).toBeNull();
  });

  it("marks a consumed intent FAILED (losing prepare) and keeps it non-PENDING / non-revivable", async () => {
    await service.createIfAbsent(input());
    await service.consume(input().routeId, USER);
    await service.markFailed(input().routeId);
    const row = await db.prisma.routeIntent.findUniqueOrThrow({
      where: { routeId: input().routeId },
    });
    expect(row.status).toBe("FAILED");
    // An identical re-optimize does not reset it to PENDING, and it stays unconsumable.
    const afterReoptimize = await service.createIfAbsent(input());
    expect(afterReoptimize.status).toBe("FAILED");
    expect(await service.consume(input().routeId, USER)).toBeNull();
  });

  it("prunes only expired rows on createIfAbsent (does not delete live/spent rows)", async () => {
    const live = input({ routeId: `0x${"33".repeat(32)}` });
    const expired = input({
      routeId: `0x${"44".repeat(32)}`,
      expiresAt: new Date(Date.now() - 1000),
    });
    await service.createIfAbsent(live);
    await db.prisma.routeIntent.create({ data: expired });
    // Creating a third, fresh intent triggers the opportunistic expired-only prune.
    await service.createIfAbsent(input({ routeId: `0x${"55".repeat(32)}` }));
    const ids = (await db.prisma.routeIntent.findMany({ select: { routeId: true } })).map(
      (r) => r.routeId,
    );
    expect(ids).toContain(live.routeId);
    expect(ids).not.toContain(expired.routeId);
  });
});
