import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ChainService } from "../chain/chain.service";
import type { Env } from "../config/env.validation";
import { CursorService } from "../cursor/cursor.service";
import { PrismaService } from "../prisma/prisma.service";

/** A single dependency check outcome. */
export interface CheckStatus {
  status: "up" | "down";
}

/** The cursor check additionally reports how far the projection trails the frontier. */
export interface CursorCheckStatus extends CheckStatus {
  lagMs: number;
  lagBlocks: number;
}

/** The aggregate readiness payload — overall "ok" only when every check is up. */
export interface ReadinessReport {
  status: "ok" | "degraded";
  checks: {
    db: CheckStatus;
    rpc: CheckStatus;
    cursor: CursorCheckStatus;
  };
}

/**
 * Hand-rolled liveness + readiness probes (no `@nestjs/terminus` — ESM-only, banned here).
 * Each readiness sub-check runs independently and never throws: a failing dependency is
 * reported as `down` rather than blowing up the whole probe.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly cursor: CursorService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Trivial process-alive signal with no external dependencies. */
  liveness(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Probe the DB, RPC, and indexer cursor; overall "ok" only when all three are up. */
  async readiness(): Promise<ReadinessReport> {
    const db = await this.checkDb();
    const { check: rpc, frontierNumber } = await this.checkRpc();
    const cursor = await this.checkCursor(frontierNumber);

    const status = db.status === "up" && rpc.status === "up" && cursor.status === "up" ? "ok" : "degraded";
    return { status, checks: { db, rpc, cursor } };
  }

  private async checkDb(): Promise<CheckStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "up" };
    } catch {
      return { status: "down" };
    }
  }

  private async checkRpc(): Promise<{ check: CheckStatus; frontierNumber: bigint | null }> {
    try {
      const block = await this.chain.getFrontierBlock(true);
      return { check: { status: "up" }, frontierNumber: block.number };
    } catch {
      return { check: { status: "down" }, frontierNumber: null };
    }
  }

  private async checkCursor(frontierNumber: bigint | null): Promise<CursorCheckStatus> {
    try {
      const current = await this.cursor.current();
      if (current === null) return { status: "down", lagMs: 0, lagBlocks: 0 };

      const staleMs = this.config.get("CURSOR_STALE_MS", { infer: true });
      const maxLagBlocks = this.config.get("CURSOR_MAX_LAG_BLOCKS", { infer: true });

      const lagMs = Date.now() - current.updatedAt.getTime();
      const lagBlocks = frontierNumber === null ? 0 : Number(frontierNumber - current.block);

      const status = lagMs > staleMs || lagBlocks > maxLagBlocks ? "down" : "up";
      return { status, lagMs, lagBlocks };
    } catch {
      return { status: "down", lagMs: 0, lagBlocks: 0 };
    }
  }
}
