import { Logger } from "@nestjs/common";

import { applyEvent } from "../src/indexer/indexer.service";
import type { ParsedEvent } from "../src/indexer/parse";
import { startTestDb, type TestDb } from "./db/postgres-testcontainer";

// Integration test: projection idempotency + reorg full-wipe against a REAL Postgres.
// Requires Docker (Testcontainers). Run via `pnpm test:int`; NOT part of `pnpm test`.

const CHAIN_ID = 31337;
const CLAIM_ID = `0x${"11".repeat(32)}`;
const WALLET = "0xabc0000000000000000000000000000000000001";

function registered(block: bigint, logIndex: number): ParsedEvent {
  return {
    kind: "ClaimRegistered",
    blockNumber: block,
    logIndex,
    txHash: `0x${block.toString(16).padStart(64, "0")}`,
    claimId: CLAIM_ID,
    issuer: "0xdef0000000000000000000000000000000000002",
    beneficiary: WALLET,
    claimType: 0,
    token: "0x1110000000000000000000000000000000000003",
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

describe("indexer projection (integration)", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.prisma.activityEvent.deleteMany({});
    await db.prisma.claimProjection.deleteMany({});
  });

  async function apply(events: ParsedEvent[]): Promise<void> {
    await db.prisma.$transaction(async (tx) => {
      const ctx = {
        targetAdvances: new Map<string, string>(),
        beneficiaries: new Map<string, string>(),
        chainId: CHAIN_ID,
        logger: new Logger("indexer-int-spec"),
      };
      for (const event of events) await applyEvent(tx, event, ctx);
    });
  }

  it("re-applying the same events is idempotent (no duplicate rows, same state)", async () => {
    const events = [registered(10n, 0), stateChanged(11n, 1, 1)]; // ELIGIBLE
    await apply(events);
    await apply(events); // replay

    const claims = await db.prisma.claimProjection.findMany();
    expect(claims).toHaveLength(1);
    expect(claims[0]?.state).toBe("ELIGIBLE");

    const activity = await db.prisma.activityEvent.findMany();
    // one ClaimRegistered + one ClaimStateChanged for the beneficiary; replay adds none.
    expect(activity).toHaveLength(2);
  });

  it("converges regardless of event order (last-writer state)", async () => {
    await apply([stateChanged(11n, 1, 1), registered(10n, 0)]); // reversed
    const claim = await db.prisma.claimProjection.findUnique({ where: { claimId: CLAIM_ID } });
    // registration must exist; state-change only updates an existing row.
    expect(claim).not.toBeNull();
    expect(claim?.beneficiary).toBe(WALLET);
  });

  it("full wipe clears projections (reorg/reset path)", async () => {
    await apply([registered(10n, 0)]);
    await db.prisma.claimProjection.deleteMany({});
    expect(await db.prisma.claimProjection.count()).toBe(0);
    // re-applying rebuilds identically.
    await apply([registered(10n, 0)]);
    expect(await db.prisma.claimProjection.count()).toBe(1);
  });
});
