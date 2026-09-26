import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CLAIM_STATES, CLAIM_TYPES } from "@matura/shared";
import { contractAbis } from "@matura/chain";
import { decodeFunctionData, type Hex } from "viem";

import { ChainService } from "../chain/chain.service";
import type { Env } from "../config/env.validation";
import { INDEXER_CONSUMER } from "../cursor/cursor.service";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ClaimRegisteredEvent,
  ClaimSettledEvent,
  ClaimSliceReleasedEvent,
  ClaimSliceReservedEvent,
  ClaimStateChangedEvent,
  RouteExecutedEvent,
  RouteLegExecutedEvent,
} from "./events";
import { extractMeta, lower, type ParsedEvent } from "./parse";
import { INDEXER_LOCK_KEY, resetProjections } from "./reset";

/** Concurrency cap for per-tx calldata fetches so a large reindex can't build an oversized RPC batch. */
const DECODE_CHUNK = 50;

type PrismaTx = Prisma.TransactionClient;

/** Per-range context threaded through the event projectors. */
interface ApplyContext {
  /** executionId → targetAdvance (decoded from calldata); absent when undecodable. */
  targetAdvances: Map<string, string>;
  /** claimId → beneficiary, pre-fetched per range + populated as claims are registered (avoids N+1). */
  beneficiaries: Map<string, string>;
  chainId: number;
  logger: Logger;
}

/**
 * Reorg-safe polling indexer. Frontier is the `finalized` tag; on a cursor block-hash
 * mismatch it full-wipes (projections + cursor, atomically, under the lock) and reindexes from
 * the deployment block. Upserts + cursor advance commit in one transaction; calldata decoding
 * and beneficiary pre-fetch happen BEFORE the transaction opens.
 */
@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndexerService.name);
  private running = false;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  private readonly maxRange: bigint;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    config: ConfigService<Env, true>,
  ) {
    this.maxRange = BigInt(config.get("INDEXER_MAX_BLOCK_RANGE", { infer: true }));
    this.pollIntervalMs = config.get("INDEXER_POLL_INTERVAL_MS", { infer: true });
  }

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loop;
  }

  private async run(): Promise<void> {
    this.logger.log("Indexer started");
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        this.logger.error(`Indexer tick failed: ${String(error)}`);
      }
      // sleep() is interrupted immediately by wake() on shutdown, so no running-guard needed.
      await this.sleep(this.pollIntervalMs);
    }
    this.logger.log("Indexer stopped");
  }

  /** One poll: resolve frontier, detect reorg/reset, then process forward in bounded chunks. */
  async tick(): Promise<void> {
    const frontier = await this.chain.getFrontierBlock();
    const cursor = await this.readCursor();

    let fromBlock: bigint;
    if (cursor === null) {
      fromBlock = this.chain.deploymentBlock;
    } else {
      const stored = await this.chain.getBlockAt(cursor.block);
      if (stored?.hash !== cursor.hash) {
        this.logger.warn(
          `Cursor block ${String(cursor.block)} hash mismatch — full wipe + reindex from deployment block`,
        );
        await this.wipe();
        fromBlock = this.chain.deploymentBlock;
      } else {
        fromBlock = cursor.block + 1n;
      }
    }

    for (let start = fromBlock; start <= frontier.number && this.running; start += this.maxRange) {
      const end =
        start + this.maxRange - 1n < frontier.number ? start + this.maxRange - 1n : frontier.number;
      await this.processRange(start, end);
    }
  }

  private async processRange(fromBlock: bigint, toBlock: bigint): Promise<void> {
    const events = await this.fetchEvents(fromBlock, toBlock);
    // Both reads happen BEFORE the transaction (no RPC / minimal DB work under the lock).
    const [targetAdvances, beneficiaries] = await Promise.all([
      this.decodeTargetAdvances(events),
      this.prefetchBeneficiaries(events),
    ]);
    const endBlock = await this.chain.getBlockAt(toBlock);
    if (endBlock === null) return; // block vanished mid-poll; next tick re-resolves

    events.sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(a.blockNumber - b.blockNumber)
        : a.logIndex - b.logIndex,
    );
    // FK-safe two passes: everything except legs first (creates claims + executions), then legs.
    const nonLegs = events.filter((event) => event.kind !== "RouteLegExecuted");
    const legs = events.filter((event) => event.kind === "RouteLegExecuted");
    const ctx: ApplyContext = { targetAdvances, beneficiaries, chainId: this.chain.chainId, logger: this.logger };

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INDEXER_LOCK_KEY})`;
        for (const event of nonLegs) await applyEvent(tx, event, ctx);
        for (const event of legs) await applyEvent(tx, event, ctx);
        await tx.chainCursor.upsert({
          where: {
            consumerName_chainId: { consumerName: INDEXER_CONSUMER, chainId: this.chain.chainId },
          },
          create: {
            consumerName: INDEXER_CONSUMER,
            chainId: this.chain.chainId,
            lastProcessedBlock: endBlock.number,
            lastProcessedBlockHash: endBlock.hash,
          },
          update: { lastProcessedBlock: endBlock.number, lastProcessedBlockHash: endBlock.hash },
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    if (events.length > 0) {
      this.logger.log(
        `Indexed ${String(events.length)} event(s) in blocks ${String(fromBlock)}-${String(toBlock)}`,
      );
    }
  }

  private async fetchEvents(fromBlock: bigint, toBlock: bigint): Promise<ParsedEvent[]> {
    const { claimRegistry, router, settlementManager } = this.chain.addresses;
    const client = this.chain.client;

    const [registered, stateChanged, sliceReserved, sliceReleased, routeExecuted, routeLegExecuted, settled] =
      await Promise.all([
        client.getLogs({ address: claimRegistry, event: ClaimRegisteredEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: claimRegistry, event: ClaimStateChangedEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: claimRegistry, event: ClaimSliceReservedEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: claimRegistry, event: ClaimSliceReleasedEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: router, event: RouteExecutedEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: router, event: RouteLegExecutedEvent, fromBlock, toBlock, strict: true }),
        client.getLogs({ address: settlementManager, event: ClaimSettledEvent, fromBlock, toBlock, strict: true }),
      ]);

    const events: ParsedEvent[] = [];
    for (const log of registered) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "ClaimRegistered",
        claimId: lower(log.args.claimId),
        issuer: lower(log.args.issuer),
        beneficiary: lower(log.args.beneficiary),
        claimType: log.args.claimType,
        token: lower(log.args.token),
        faceValue: log.args.faceValue,
        dueDate: log.args.dueDate,
      });
    }
    for (const log of stateChanged) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({ ...meta, kind: "ClaimStateChanged", claimId: lower(log.args.claimId), newState: log.args.newState });
    }
    for (const log of sliceReserved) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "ClaimSliceReserved",
        claimId: lower(log.args.claimId),
        financedFaceValue: log.args.financedFaceValue,
      });
    }
    for (const log of sliceReleased) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "ClaimSliceReleased",
        claimId: lower(log.args.claimId),
        financedFaceValue: log.args.financedFaceValue,
      });
    }
    for (const log of routeExecuted) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "RouteExecuted",
        executionId: lower(log.args.executionId),
        user: lower(log.args.user),
        totalAdvance: log.args.totalAdvance,
        totalFaceAssigned: log.args.totalFaceAssigned,
        totalCost: log.args.totalCost,
      });
    }
    for (const log of routeLegExecuted) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "RouteLegExecuted",
        executionId: lower(log.args.executionId),
        claimId: lower(log.args.claimId),
        vault: lower(log.args.vault),
        faceAmount: log.args.faceAmount,
        advanceAmount: log.args.advanceAmount,
        discountAmount: log.args.discountAmount,
      });
    }
    for (const log of settled) {
      const meta = extractMeta(log);
      if (meta === null) continue;
      events.push({
        ...meta,
        kind: "ClaimSettled",
        claimId: lower(log.args.claimId),
        amountReceived: log.args.amountReceived,
        vaultDistribution: log.args.vaultDistribution,
        userResidual: log.args.userResidual,
        protocolFee: log.args.protocolFee,
      });
    }
    return events;
  }

  /**
   * Recover `targetAdvance` (not in the event) from each RouteExecuted tx's calldata — BEFORE the
   * tx, in bounded-concurrency batches. Undecodable entries are OMITTED (→ persisted as null),
   * never silently coerced to a real "0".
   */
  private async decodeTargetAdvances(events: ParsedEvent[]): Promise<Map<string, string>> {
    const routeTxs = new Map<string, Hex>();
    for (const event of events) {
      if (event.kind === "RouteExecuted") routeTxs.set(event.executionId, event.txHash);
    }
    const map = new Map<string, string>();
    const entries = [...routeTxs.entries()];
    for (let i = 0; i < entries.length; i += DECODE_CHUNK) {
      const chunk = entries.slice(i, i + DECODE_CHUNK);
      const results = await Promise.all(chunk.map(([executionId, txHash]) => this.decodeOne(executionId, txHash)));
      for (const result of results) {
        if (result !== null) map.set(result.executionId, result.targetAdvance);
      }
    }
    return map;
  }

  private async decodeOne(
    executionId: string,
    txHash: Hex,
  ): Promise<{ executionId: string; targetAdvance: string } | null> {
    try {
      const tx = await this.chain.client.getTransaction({ hash: txHash });
      const decoded = decodeFunctionData({ abi: contractAbis.router, data: tx.input });
      if (decoded.functionName === "executeRoute") {
        return { executionId, targetAdvance: decoded.args[0].targetAdvance.toString() };
      }
      this.logger.warn(`RouteExecuted ${executionId}: tx is not a direct executeRoute call; targetAdvance unknown`);
      return null;
    } catch {
      this.logger.warn(`RouteExecuted ${executionId}: failed to decode targetAdvance from calldata`);
      return null;
    }
  }

  /** One `findMany` per range for the beneficiaries of claims referenced by non-registration events. */
  private async prefetchBeneficiaries(events: ParsedEvent[]): Promise<Map<string, string>> {
    const claimIds = new Set<string>();
    for (const event of events) {
      if (
        event.kind === "ClaimStateChanged" ||
        event.kind === "ClaimSliceReserved" ||
        event.kind === "ClaimSliceReleased" ||
        event.kind === "ClaimSettled"
      ) {
        claimIds.add(event.claimId);
      }
    }
    if (claimIds.size === 0) return new Map();
    const rows = await this.prisma.claimProjection.findMany({
      where: { claimId: { in: [...claimIds] } },
      select: { claimId: true, beneficiary: true },
    });
    return new Map(rows.map((row) => [row.claimId, row.beneficiary]));
  }

  /** Reorg full-wipe: reset projections + cursor atomically, under the same advisory lock. */
  private async wipe(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INDEXER_LOCK_KEY})`;
      await resetProjections(tx, this.chain.chainId);
    });
  }

  private async readCursor(): Promise<{ block: bigint; hash: string } | null> {
    const row = await this.prisma.chainCursor.findUnique({
      where: {
        consumerName_chainId: { consumerName: INDEXER_CONSUMER, chainId: this.chain.chainId },
      },
    });
    return row === null ? null : { block: row.lastProcessedBlock, hash: row.lastProcessedBlockHash };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

/** Apply one parsed event to the projections within a transaction. Exported for integration tests. */
export async function applyEvent(tx: PrismaTx, event: ParsedEvent, ctx: ApplyContext): Promise<void> {
  switch (event.kind) {
    case "ClaimRegistered": {
      const claimType = CLAIM_TYPES[event.claimType];
      if (claimType === undefined) {
        ctx.logger.warn(`ClaimRegistered ${event.claimId}: unknown claimType ordinal ${String(event.claimType)} — skipped`);
        return;
      }
      await tx.claimProjection.upsert({
        where: { claimId: event.claimId },
        create: {
          claimId: event.claimId,
          beneficiary: event.beneficiary,
          issuer: event.issuer,
          claimType,
          token: event.token,
          faceValue: event.faceValue.toString(),
          financedFaceValue: "0",
          dueAt: new Date(Number(event.dueDate) * 1000),
          state: "ATTESTED",
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
        update: {},
      });
      ctx.beneficiaries.set(event.claimId, event.beneficiary);
      await appendActivity(tx, event.beneficiary, "ClaimRegistered", event, {
        claimId: event.claimId,
        payload: { faceValue: event.faceValue.toString(), claimType },
      });
      return;
    }
    case "ClaimStateChanged": {
      const state = CLAIM_STATES[event.newState];
      if (state === undefined) return;
      await tx.claimProjection.updateMany({
        where: { claimId: event.claimId },
        data: { state, blockNumber: event.blockNumber, logIndex: event.logIndex, txHash: event.txHash },
      });
      await appendClaimActivity(tx, event.claimId, "ClaimStateChanged", event, { state }, ctx);
      return;
    }
    case "ClaimSliceReserved":
    case "ClaimSliceReleased": {
      await tx.claimProjection.updateMany({
        where: { claimId: event.claimId },
        data: {
          financedFaceValue: event.financedFaceValue.toString(),
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
          txHash: event.txHash,
        },
      });
      await appendClaimActivity(
        tx,
        event.claimId,
        event.kind,
        event,
        { financedFaceValue: event.financedFaceValue.toString() },
        ctx,
      );
      return;
    }
    case "RouteExecuted": {
      await tx.routeExecution.upsert({
        where: { executionId: event.executionId },
        create: {
          executionId: event.executionId,
          user: event.user,
          targetAdvance: ctx.targetAdvances.get(event.executionId) ?? null,
          totalAdvance: event.totalAdvance.toString(),
          totalFaceAssigned: event.totalFaceAssigned.toString(),
          totalCost: event.totalCost.toString(),
          status: "EXECUTED",
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
        update: { status: "EXECUTED" },
      });
      await appendActivity(tx, event.user, "RouteExecuted", event, {
        executionId: event.executionId,
        payload: { totalAdvance: event.totalAdvance.toString() },
      });
      return;
    }
    case "RouteLegExecuted": {
      // FK-safe guard: skip (don't abort the batch) if the parent claim or execution is absent —
      // e.g. a claim skipped for an unknown claimType ordinal. Prevents an FK-violation poison-pill.
      const [claim, execution] = await Promise.all([
        tx.claimProjection.findUnique({ where: { claimId: event.claimId }, select: { claimId: true } }),
        tx.routeExecution.findUnique({ where: { executionId: event.executionId }, select: { executionId: true } }),
      ]);
      if (claim === null || execution === null) {
        ctx.logger.warn(
          `RouteLegExecuted ${event.executionId}/${event.claimId}: missing parent claim or execution — skipped`,
        );
        return;
      }
      await tx.routeLegProjection.upsert({
        where: { executionId_claimId: { executionId: event.executionId, claimId: event.claimId } },
        create: {
          executionId: event.executionId,
          claimId: event.claimId,
          vault: event.vault,
          faceAmount: event.faceAmount.toString(),
          advanceAmount: event.advanceAmount.toString(),
          discountAmount: event.discountAmount.toString(),
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
        update: {},
      });
      return;
    }
    case "ClaimSettled": {
      const beneficiary = ctx.beneficiaries.get(event.claimId);
      if (beneficiary === undefined) return; // claim not projected (e.g. skipped) — skip settlement
      await tx.settlementProjection.upsert({
        where: { claimId: event.claimId },
        create: {
          claimId: event.claimId,
          beneficiary,
          amountReceived: event.amountReceived.toString(),
          vaultDistribution: event.vaultDistribution.toString(),
          userResidual: event.userResidual.toString(),
          protocolFee: event.protocolFee.toString(),
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          logIndex: event.logIndex,
        },
        update: {},
      });
      await appendActivity(tx, beneficiary, "ClaimSettled", event, {
        claimId: event.claimId,
        payload: { amountReceived: event.amountReceived.toString() },
      });
      return;
    }
    default: {
      // Exhaustiveness guard: adding a ParsedEvent variant without a case here fails to compile.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

async function appendClaimActivity(
  tx: PrismaTx,
  claimId: string,
  kind: string,
  meta: { blockNumber: bigint; logIndex: number; txHash: string },
  payload: Prisma.InputJsonValue,
  ctx: ApplyContext,
): Promise<void> {
  const beneficiary = ctx.beneficiaries.get(claimId);
  if (beneficiary === undefined) return;
  await appendActivity(tx, beneficiary, kind, meta, { claimId, payload });
}

async function appendActivity(
  tx: PrismaTx,
  wallet: string,
  kind: string,
  meta: { blockNumber: bigint; logIndex: number; txHash: string },
  extra: { claimId?: string; executionId?: string; payload?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.activityEvent.upsert({
    where: { txHash_logIndex_wallet: { txHash: meta.txHash, logIndex: meta.logIndex, wallet } },
    create: {
      wallet,
      kind,
      claimId: extra.claimId ?? null,
      executionId: extra.executionId ?? null,
      payload: extra.payload ?? {},
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      logIndex: meta.logIndex,
    },
    update: {},
  });
}
