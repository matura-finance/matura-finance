import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AdminCliModule } from "./admin-cli.module";
import { ChainService } from "../chain/chain.service";
import { INDEXER_CONSUMER } from "../cursor/cursor.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Dev/ops reindex CLI (`node dist/admin/reindex.cli.js [fromBlock]`). Wipes all projections
 * and deletes the cursor so the next worker run reindexes from the deployment block
 * (idempotent full replay converges). `fromBlock`, if given, is only a lower-bound sanity
 * check — it must be >= the deployment block. No HTTP surface; disabled-in-prod by absence.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AdminCliModule, { bufferLogs: false });
  try {
    const chain = app.get(ChainService);
    const prisma = app.get(PrismaService);

    const arg = process.argv[2];
    if (arg !== undefined) {
      const fromBlock = BigInt(arg);
      if (fromBlock < chain.deploymentBlock) {
        throw new Error(
          `fromBlock ${arg} is below the deployment block ${String(chain.deploymentBlock)}`,
        );
      }
    }

    await prisma.$transaction([
      prisma.routeLegProjection.deleteMany({}),
      prisma.settlementProjection.deleteMany({}),
      prisma.routeExecution.deleteMany({}),
      prisma.claimProjection.deleteMany({}),
      prisma.activityEvent.deleteMany({}),
      prisma.issuerProjection.deleteMany({}),
      prisma.chainCursor.deleteMany({
        where: { consumerName: INDEXER_CONSUMER, chainId: chain.chainId },
      }),
    ]);
    Logger.log(
      "Reindex reset complete — restart the worker to reindex from the deployment block",
      "Reindex",
    );
  } finally {
    await app.close();
  }
}

void main();
