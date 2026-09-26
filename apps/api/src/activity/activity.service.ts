import { Injectable } from "@nestjs/common";
import type { z } from "zod";

import { CursorService } from "../cursor/cursor.service";
import type { ActivityPageSchema, ActivityQuerySchema } from "../common/dto";
import { normalizeWallet } from "../common/evm.util";
import { decodeCursor, encodeCursor } from "../common/pagination";
import type { ActivityEvent } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * GET /api/v1/activity/:wallet. Keyset pagination over the append-only ActivityEvent feed,
   * ordered (blockNumber DESC, logIndex DESC). Empty wallet → 200 with an empty page.
   */
  async getActivity(
    rawWallet: string,
    query: z.infer<typeof ActivityQuerySchema>,
  ): Promise<z.infer<typeof ActivityPageSchema>> {
    const wallet = normalizeWallet(rawWallet);
    const keyset = query.cursor === undefined ? null : decodeCursor(query.cursor);

    const rows = await this.prisma.activityEvent.findMany({
      where: {
        wallet,
        ...(keyset === null
          ? {}
          : {
              OR: [
                { blockNumber: { lt: keyset.block } },
                { blockNumber: keyset.block, logIndex: { lt: keyset.logIndex } },
              ],
            }),
      },
      orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = hasMore ? page[page.length - 1] : undefined;
    const nextCursor =
      last === undefined ? null : encodeCursor({ block: last.blockNumber, logIndex: last.logIndex });

    const finalizedThrough = await this.cursor.finalizedThrough();
    return {
      wallet,
      items: page.map((row) => this.mapEvent(row)),
      nextCursor,
      finalizedThrough,
    };
  }

  private mapEvent(row: ActivityEvent): z.infer<typeof ActivityPageSchema>["items"][number] {
    return {
      kind: row.kind,
      claimId: row.claimId,
      executionId: row.executionId,
      payload: row.payload,
      txHash: row.txHash,
      blockNumber: row.blockNumber.toString(),
      logIndex: row.logIndex,
    };
  }
}
