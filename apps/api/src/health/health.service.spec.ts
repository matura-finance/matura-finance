import type { ConfigService } from "@nestjs/config";

import { HealthService } from "./health.service";
import type { ChainService } from "../chain/chain.service";
import type { Env } from "../config/env.validation";
import type { CursorService } from "../cursor/cursor.service";
import type { PrismaService } from "../prisma/prisma.service";

const STALE_MS = 30_000;
const MAX_LAG_BLOCKS = 200;

function makeConfig(): ConfigService<Env, true> {
  return {
    get: jest.fn((key: string) => (key === "CURSOR_STALE_MS" ? STALE_MS : MAX_LAG_BLOCKS)),
  } as unknown as ConfigService<Env, true>;
}

describe("HealthService", () => {
  it("liveness() returns { status: 'ok' }", () => {
    const service = new HealthService(
      {} as unknown as PrismaService,
      {} as unknown as ChainService,
      {} as unknown as CursorService,
      makeConfig(),
    );
    expect(service.liveness()).toEqual({ status: "ok" });
  });

  it("readiness() is 'ok' when db, rpc, and cursor are all up", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PrismaService;
    const chain = {
      getFrontierBlock: jest.fn().mockResolvedValue({ number: 100n, hash: "0x" }),
    } as unknown as ChainService;
    const cursor = {
      current: jest.fn().mockResolvedValue({ block: 100n, hash: "0x", updatedAt: new Date() }),
    } as unknown as CursorService;

    const report = await new HealthService(prisma, chain, cursor, makeConfig()).readiness();

    expect(report.status).toBe("ok");
    expect(report.checks.db.status).toBe("up");
    expect(report.checks.rpc.status).toBe("up");
    expect(report.checks.cursor.status).toBe("up");
    expect(report.checks.cursor.lagBlocks).toBe(0);
  });

  it("readiness() is 'degraded' with the cursor down when it has never synced", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PrismaService;
    const chain = {
      getFrontierBlock: jest.fn().mockResolvedValue({ number: 100n, hash: "0x" }),
    } as unknown as ChainService;
    const cursor = {
      current: jest.fn().mockResolvedValue(null),
    } as unknown as CursorService;

    const report = await new HealthService(prisma, chain, cursor, makeConfig()).readiness();

    expect(report.status).toBe("degraded");
    expect(report.checks.db.status).toBe("up");
    expect(report.checks.rpc.status).toBe("up");
    expect(report.checks.cursor.status).toBe("down");
  });

  it("readiness() is 'degraded' when the cursor lags beyond CURSOR_MAX_LAG_BLOCKS", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PrismaService;
    const chain = {
      getFrontierBlock: jest.fn().mockResolvedValue({ number: 1000n, hash: "0x" }),
    } as unknown as ChainService;
    const cursor = {
      current: jest.fn().mockResolvedValue({ block: 100n, hash: "0x", updatedAt: new Date() }),
    } as unknown as CursorService;

    const report = await new HealthService(prisma, chain, cursor, makeConfig()).readiness();

    expect(report.status).toBe("degraded");
    expect(report.checks.cursor.status).toBe("down");
    expect(report.checks.cursor.lagBlocks).toBe(900);
  });
});
