import { type Hex } from "viem";

import { RoutesService } from "./routes.service";
import type { ChainService } from "../chain/chain.service";
import type { ContractsService, PinnedReads, VaultMandate } from "../chain/contracts.service";
import type { CursorService } from "../cursor/cursor.service";
import type { RouteIntentService } from "./route-intent.service";
import type { OnChainClaim } from "../chain/chain.service";

const hex = (fill: string): Hex => `0x${fill}`;
const WALLET = hex("a".repeat(40));
const ROUTER = hex("f".repeat(40));
const ISSUER = hex("b".repeat(40));
const TOKEN = hex("c".repeat(40));
const VAULT = hex("d".repeat(40));
const CLAIM = hex("1".repeat(64));
const TS = 1_780_000_000n;

const mandate: VaultMandate = {
  supportedTypesBitmap: 0b101,
  baseDiscountBps: 100,
  durationBpsPerDay: 0,
  maxDurationDays: 365,
  minFace: 1n,
  maxFace: 1_000_000n,
  liquidityCap: 10_000_000n,
  claimTypePremiumBps: [0, 0, 0],
};

const claim: OnChainClaim = {
  beneficiary: WALLET,
  claimType: 0,
  state: 1,
  sliceCount: 0,
  dueDate: TS + 30n * 86_400n,
  issuer: ISSUER,
  token: TOKEN,
  faceValue: 1000n,
  financedFaceValue: 0n,
};

function reads(overrides: Partial<PinnedReads> = {}): PinnedReads {
  return {
    blockNumber: 10n,
    getClaim: () => Promise.resolve(claim),
    isIssuerActive: () => Promise.resolve(true),
    isVaultActive: () => Promise.resolve(true),
    vaultToken: () => Promise.resolve(TOKEN),
    routerPaused: () => Promise.resolve(false),
    routerNonce: () => Promise.resolve(0n),
    getVaults: () => Promise.resolve([VAULT]),
    getMandate: () => Promise.resolve(mandate),
    fundableLiquidity: () => Promise.resolve(5_000_000n),
    quoteAndCheck: () => Promise.resolve({ ok: true, advanceAmount: 990n, discountAmount: 10n }),
    ...overrides,
  };
}

function makeService(
  pinned: PinnedReads,
  intents: Partial<RouteIntentService> = {},
): {
  service: RoutesService;
  createIfAbsent: jest.Mock;
} {
  const createIfAbsent = jest.fn().mockResolvedValue({ routeId: "x" });
  const chain = {
    chainId: 31337,
    addresses: { router: ROUTER },
    getFrontierBlock: () => Promise.resolve({ number: 10n, hash: hex("0".repeat(64)) }),
    client: { getBlock: () => Promise.resolve({ timestamp: TS }) },
  } as unknown as ChainService;
  const contracts = { pinnedAt: () => pinned } as unknown as ContractsService;
  const cursor = { finalizedThrough: () => Promise.resolve("10") } as unknown as CursorService;
  const intentSvc = { createIfAbsent, ...intents } as unknown as RouteIntentService;
  return { service: new RoutesService(chain, contracts, cursor, intentSvc), createIfAbsent };
}

describe("RoutesService.optimize", () => {
  it("returns a non-executable ROUTER_PAUSED result without persisting when the router is paused", async () => {
    const { service, createIfAbsent } = makeService(
      reads({ routerPaused: () => Promise.resolve(true) }),
    );
    const res = await service.optimize(WALLET, { claimIds: [CLAIM], targetAdvance: "500" });
    expect(res.result.executable).toBe(false);
    expect(res.routeId).toBeNull();
    expect(res.filteredOut[0]?.reason).toBe("ROUTER_PAUSED");
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  it("returns an executable route and persists an intent on the happy path", async () => {
    const { service, createIfAbsent } = makeService(reads());
    const res = await service.optimize(WALLET, { claimIds: [CLAIM], targetAdvance: "500" });
    expect(res.result.executable).toBe(true);
    expect(res.routeId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(res.expiresAt).not.toBeNull();
    expect(createIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("rejects a zero targetAdvance", async () => {
    const { service } = makeService(reads());
    await expect(
      service.optimize(WALLET, { claimIds: [CLAIM], targetAdvance: "0" }),
    ).rejects.toThrow();
  });
});

describe("RoutesService.prepareExecution", () => {
  it("404s when the intent does not exist", async () => {
    const { service } = makeService(reads(), {
      consume: () => Promise.resolve(null),
      getForUser: () => Promise.resolve(null),
    });
    await expect(service.prepareExecution(WALLET, CLAIM)).rejects.toThrow(/No such route intent/);
  });
});
