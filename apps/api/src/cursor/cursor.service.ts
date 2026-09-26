import { Injectable } from "@nestjs/common";

import { ChainService } from "../chain/chain.service";
import { PrismaService } from "../prisma/prisma.service";

/** The single indexer consumer name for the `ChainCursor` composite key. */
export const INDEXER_CONSUMER = "indexer";

/**
 * Read access to the indexer's `ChainCursor` for the configured chain. The cursor is the
 * projection's true extent, so `finalizedThrough` (the read-response marker) is the cursor
 * block — NOT the chain's finalized head, which could advertise data not yet projected.
 * The indexer owns cursor WRITES (inside its own transaction); this service only reads.
 */
@Injectable()
export class CursorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
  ) {}

  async current(): Promise<{ block: bigint; hash: string; updatedAt: Date } | null> {
    const row = await this.prisma.chainCursor.findUnique({
      where: { consumerName_chainId: { consumerName: INDEXER_CONSUMER, chainId: this.chain.chainId } },
    });
    if (row === null) return null;
    return { block: row.lastProcessedBlock, hash: row.lastProcessedBlockHash, updatedAt: row.updatedAt };
  }

  /** Decimal-string block the projection is complete through, or "0" before the first sync. */
  async finalizedThrough(): Promise<string> {
    const cursor = await this.current();
    return cursor === null ? "0" : cursor.block.toString();
  }
}
