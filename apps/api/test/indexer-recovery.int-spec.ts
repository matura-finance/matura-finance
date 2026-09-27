import { Logger } from "@nestjs/common";

import { INDEXER_CONSUMER } from "../src/cursor/cursor.service";
import { applyEvent, applyRange } from "../src/indexer/indexer.service";
import type { ParsedEvent } from "../src/indexer/parse";
import { INDEXER_LOCK_KEY, resetProjections } from "../src/indexer/reset";
import { startTestDb, type TestDb } from "./db/postgres-testcontainer";

// Integration test: indexer recovery / idempotency / cursor atomicity / FK-wedge against a REAL
// Postgres. Exercises `applyEvent` inside the SAME transaction shape the live `processRange` uses
// (advisory lock → non-legs → legs → cursor upsert). Requires Docker. Run via `pnpm test:int`.

const CHAIN_ID = 31337;
const CLAIM_ID = `0x${"11".repeat(32)}`;
const WALLET = "0xabc0000000000000000000000000000000000001";
const ISSUER = "0xdef0000000000000000000000000000000000002";
const TOKEN = "0x1110000000000000000000000000000000000003";
const VAULT = "0x2220000000000000000000000000000000000004";
const EXEC_ID = `0x${"99".repeat(32)}`;

function registered(
  block: bigint,
  logIndex: number,
  claimType = 0,
  claimId = CLAIM_ID,
): ParsedEvent {
  return {
    kind: "ClaimRegistered",
    blockNumber: block,
    logIndex,
    txHash: `0x${block.toString(16).padStart(64, "0")}`,
    claimId,
    issuer: ISSUER,
    beneficiary: WALLET,
    claimType,
    token: TOKEN,
    faceValue: 20_000_000_000n,
    dueDate: 1_800_000_000n,
  };
}

function stateChanged(block: bigint, logIndex: number, newState: number): ParsedEvent {
  return {
    kind: "ClaimStateChanged",
    blockNumber: block,
    logIndex,
    txHash: `0x${(block + 1000n).toString(16).padStart(64, "0")}`,
    claimId: CLAIM_ID,
    newState,
  };
}

function routeExecuted(block: bigint, logIndex: number): ParsedEvent {
  return {
    kind: "RouteExecuted",
    blockNumber: block,
    logIndex,
    txHash: `0x${(block + 2000n).toString(16).padStart(64, "0")}`,
    executionId: EXEC_ID,
    user: WALLET,
    totalAdvance: 500n,
    totalFaceAssigned: 510n,
    totalCost: 10n,
  };
}

function routeLegExecuted(block: bigint, logIndex: number, claimId = CLAIM_ID): ParsedEvent {
  return {
    kind: "RouteLegExecuted",
    blockNumber: block,
    logIndex,
    txHash: `0x${(block + 2000n).toString(16).padStart(64, "0")}`,
    executionId: EXEC_ID,
    claimId,
    vault: VAULT,
    faceAmount: 510n,
    advanceAmount: 500n,
    discountAmount: 10n,
  };
}

function settled(block: bigint, logIndex: number): ParsedEvent {
  return {
    kind: "ClaimSettled",
    blockNumber: block,
    logIndex,
    txHash: `0x${(block + 3000n).toString(16).padStart(64, "0")}`,
    claimId: CLAIM_ID,
    amountReceived: 20_000_000_000n,
    vaultDistribution: 500n,
    userResidual: 19_999_999_490n,
    protocolFee: 10n,
  };
}

describe("indexer recovery + atomicity (integration)", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.prisma.$transaction(async (tx) => {
      await resetProjections(tx, CHAIN_ID);
    });
  });

  /** Drives the REAL shipped range pipeline: replicate the service's RPC-free preamble (prefetch
   *  beneficiaries + sort), then hand the sorted events to the exported `applyRange` inside a
   *  `$transaction` — the same advisory-lock → non-legs → legs → cursor body production runs.
   *  All-or-nothing (the point of the atomicity tests). */
  async function processRange(
    events: ParsedEvent[],
    endBlock: bigint,
    endHash: string,
  ): Promise<void> {
    const claimIds = new Set<string>();
    for (const e of events) {
      if (
        e.kind === "ClaimStateChanged" ||
        e.kind === "ClaimSliceReserved" ||
        e.kind === "ClaimSliceReleased" ||
        e.kind === "ClaimSettled"
      ) {
        claimIds.add(e.claimId);
      }
    }
    const prefetched =
      claimIds.size === 0
        ? []
        : await db.prisma.claimProjection.findMany({
            where: { claimId: { in: [...claimIds] } },
            select: { claimId: true, beneficiary: true },
          });
    const beneficiaries = new Map(prefetched.map((r) => [r.claimId, r.beneficiary]));

    // Sort exactly as the service's processRange does before calling applyRange.
    const sorted = [...events].sort((a, b) =>
      a.blockNumber !== b.blockNumber
        ? Number(a.blockNumber - b.blockNumber)
        : a.logIndex - b.logIndex,
    );
    const ctx = {
      targetAdvances: new Map<string, string>(),
      beneficiaries,
      chainId: CHAIN_ID,
      logger: new Logger("indexer-recovery-int"),
    };

    await db.prisma.$transaction((tx) =>
      applyRange(tx, sorted, ctx, { number: endBlock, hash: endHash }),
    );
  }

  function readCursor() {
    return db.prisma.chainCursor.findUnique({
      where: { consumerName_chainId: { consumerName: INDEXER_CONSUMER, chainId: CHAIN_ID } },
    });
  }

  it("recovers after being 'down' while the chain advanced: projection == on-chain, cursor past tx block, no dup rows (item 10)", async () => {
    // Range 1: claim registered + eligible; cursor advances to 12.
    await processRange([registered(10n, 0), stateChanged(11n, 0, 1)], 12n, "0xhash12");
    expect((await readCursor())?.lastProcessedBlock).toBe(12n);

    // The API/DB was unavailable while the chain advanced to block 20 (slice + settle happened).
    // On restore we process the whole gap [13..20] in one range.
    await processRange([settled(18n, 0), stateChanged(19n, 0, 5)], 20n, "0xhash20");

    const claim = await db.prisma.claimProjection.findUniqueOrThrow({
      where: { claimId: CLAIM_ID },
    });
    expect(claim.state).toBe(CLAIM_STATE_AT_5);
    expect((await readCursor())?.lastProcessedBlock).toBe(20n);
    expect(await db.prisma.settlementProjection.count()).toBe(1);

    // Re-processing the exact same recovery range is idempotent (no duplicate rows, same state).
    await processRange([settled(18n, 0), stateChanged(19n, 0, 5)], 20n, "0xhash20");
    expect(await db.prisma.claimProjection.count()).toBe(1);
    expect(await db.prisma.settlementProjection.count()).toBe(1);
    const activityCount = await db.prisma.activityEvent.count();
    await processRange([settled(18n, 0), stateChanged(19n, 0, 5)], 20n, "0xhash20");
    expect(await db.prisma.activityEvent.count()).toBe(activityCount);
  });

  it("commits the cursor and projections together — a mid-batch failure rolls back BOTH", async () => {
    await expect(
      db.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INDEXER_LOCK_KEY})`;
        const ctx = {
          targetAdvances: new Map<string, string>(),
          beneficiaries: new Map<string, string>(),
          chainId: CHAIN_ID,
          logger: new Logger("indexer-recovery-int"),
        };
        await applyEvent(tx, registered(10n, 0), ctx);
        // Simulate a failure AFTER a projection write but BEFORE the cursor advances.
        throw new Error("boom before cursor upsert");
      }),
    ).rejects.toThrow(/boom/);

    // No half-applied batch: neither the claim nor the cursor survives.
    expect(await db.prisma.claimProjection.count()).toBe(0);
    expect(await readCursor()).toBeNull();
  });

  it("skips a RouteLegExecuted whose parent claim/execution is absent (FK-wedge guard, learnings §6)", async () => {
    // A leg with no parent claim + no parent execution must be SKIPPED, not abort the batch with an
    // FK violation. A sibling ClaimRegistered in the same batch must still be projected.
    await processRange(
      [registered(10n, 0), routeLegExecuted(11n, 0, `0x${"77".repeat(32)}`)],
      12n,
      "0xh12",
    );
    expect(await db.prisma.claimProjection.count()).toBe(1);
    expect(await db.prisma.routeLegProjection.count()).toBe(0);
    expect((await readCursor())?.lastProcessedBlock).toBe(12n);
  });

  it("skips a claim with an unknown claimType ordinal and does not wedge on its dependent events", async () => {
    // Unknown ordinal → claim skipped; a leg + settlement referencing it are skipped, not FK-aborted.
    await processRange(
      [registered(10n, 0, 99), routeExecuted(10n, 1), routeLegExecuted(11n, 0), settled(12n, 0)],
      13n,
      "0xh13",
    );
    expect(await db.prisma.claimProjection.count()).toBe(0);
    expect(await db.prisma.routeLegProjection.count()).toBe(0);
    expect(await db.prisma.settlementProjection.count()).toBe(0);
    // The execution (no FK to claim) still projects — the batch was not wedged.
    expect(await db.prisma.routeExecution.count()).toBe(1);
    expect((await readCursor())?.lastProcessedBlock).toBe(13n);
  });

  it("block-hash mismatch full-wipe clears projections + cursor, then reindex yields canonical state", async () => {
    await processRange([registered(10n, 0), stateChanged(11n, 0, 1)], 12n, "0xoldhash");
    expect(await db.prisma.claimProjection.count()).toBe(1);

    // The reorg path: resetProjections wipes projections AND the cursor atomically under the lock.
    await db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INDEXER_LOCK_KEY})`;
      await resetProjections(tx, CHAIN_ID);
    });
    expect(await db.prisma.claimProjection.count()).toBe(0);
    expect(await readCursor()).toBeNull();

    // Reindex from the deployment block rebuilds the identical canonical state.
    await processRange([registered(10n, 0), stateChanged(11n, 0, 1)], 12n, "0xnewhash");
    const claim = await db.prisma.claimProjection.findUniqueOrThrow({
      where: { claimId: CLAIM_ID },
    });
    expect(claim.state).toBe("ELIGIBLE");
    expect((await readCursor())?.lastProcessedBlockHash).toBe("0xnewhash");
  });
});

// CLAIM_STATES[5] — kept as a named constant so the assertion documents the ordinal→name mapping.
const CLAIM_STATE_AT_5 = "PAID";
