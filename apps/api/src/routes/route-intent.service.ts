import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { Prisma, type RouteIntent } from "../generated/prisma/client";

/** Fields required to persist a route intent (JSON columns are pre-serialized, base-unit strings). */
export interface CreateRouteIntentInput {
  routeId: string;
  user: string;
  targetAdvance: string;
  maxTotalFace: string | null;
  maxTotalCost: string | null;
  totalAdvance: string;
  totalFaceAssigned: string;
  totalCost: string;
  effectiveDiscountBps: number;
  legs: Prisma.InputJsonValue;
  rejected: Prisma.InputJsonValue;
  explanation: Prisma.InputJsonValue;
  quoteSnapshotHash: string;
  blockNumber: bigint;
  routeDeadlineSeconds: number;
  expiresAt: Date;
}

/**
 * Persistence for short-lived route intents. Mirrors the `AuthNonce` single-use
 * pattern: create-or-ignore (never upsert — an upsert on the content-hash PK
 * could revive a CONSUMED intent), atomic consume via a guarded `updateMany`, and
 * an opportunistic prune so the table stays bounded without a scheduler.
 */
@Injectable()
export class RouteIntentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist an intent, or return the existing row on a content-hash collision
   * (re-optimizing identical inputs). Never mutates an existing row, so a
   * CONSUMED intent can't be resurrected. Opportunistically prunes stale rows.
   */
  async createIfAbsent(input: CreateRouteIntentInput): Promise<RouteIntent> {
    await this.prisma.routeIntent.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { status: "CONSUMED" }] },
    });
    try {
      return await this.prisma.routeIntent.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return await this.prisma.routeIntent.findUniqueOrThrow({
          where: { routeId: input.routeId },
        });
      }
      throw error;
    }
  }

  /**
   * Atomically consume a PENDING, unexpired intent owned by `user`. Exactly one
   * concurrent caller wins; returns the consumed row, or null if it was not
   * found / not owned / already consumed / expired.
   */
  async consume(routeId: string, user: string): Promise<RouteIntent | null> {
    const { count } = await this.prisma.routeIntent.updateMany({
      where: { routeId, user, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "CONSUMED" },
    });
    if (count !== 1) return null;
    return this.prisma.routeIntent.findUniqueOrThrow({ where: { routeId } });
  }

  /** User-scoped lookup used to classify a failed consume (no cross-user status oracle). */
  async getForUser(routeId: string, user: string): Promise<RouteIntent | null> {
    const row = await this.prisma.routeIntent.findUnique({ where: { routeId } });
    return row !== null && row.user === user ? row : null;
  }

  /** Mark a consumed intent FAILED (post-consume re-validation failed). */
  async markFailed(routeId: string): Promise<void> {
    await this.prisma.routeIntent.updateMany({ where: { routeId }, data: { status: "FAILED" } });
  }
}
