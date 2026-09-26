import { INDEXER_CONSUMER } from "../cursor/cursor.service";
import type { Prisma } from "../generated/prisma/client";

type PrismaTx = Prisma.TransactionClient;

/** Postgres advisory-lock key so only one indexer/CLI mutates projections at a time (§C3). */
export const INDEXER_LOCK_KEY = 918_273_645n;

/**
 * Delete ALL projection rows AND the indexer cursor for a chain, in FK-safe order, within the
 * caller's transaction. Single source of truth for both the reorg full-wipe and the reindex CLI —
 * so the cursor is always reset atomically with the projections (never left advertising a stale
 * high block over an empty dataset). Caller is responsible for holding the advisory lock.
 */
export async function resetProjections(tx: PrismaTx, chainId: number): Promise<void> {
  await tx.routeLegProjection.deleteMany({});
  await tx.settlementProjection.deleteMany({});
  await tx.routeExecution.deleteMany({});
  await tx.claimProjection.deleteMany({});
  await tx.activityEvent.deleteMany({});
  await tx.chainCursor.deleteMany({ where: { consumerName: INDEXER_CONSUMER, chainId } });
}
