import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BSC_TESTNET_CHAIN_ID,
  LOCAL_CHAIN_ID,
  bscTestnet,
  contractAbis,
  createPublicClientFor,
  getManifest,
  hardhatLocal,
} from "@matura/chain";
import type { Chain, Hex, PublicClient } from "viem";

import type { Env } from "../config/env.validation";

/** Contract addresses for the configured chain, branded to viem's `Hex` address type. */
export interface ChainAddresses {
  mockUsdt: Hex;
  issuerRegistry: Hex;
  claimRegistry: Hex;
  vaultRegistry: Hex;
  router: Hex;
  settlementManager: Hex;
}

/** A block identity used for cursor persistence + reorg detection. */
export interface BlockRef {
  number: bigint;
  hash: Hex;
}

/** On-chain claim as returned by `ClaimRegistry.getClaim`. */
export interface OnChainClaim {
  beneficiary: Hex;
  claimType: number;
  state: number;
  sliceCount: number;
  dueDate: bigint;
  issuer: Hex;
  token: Hex;
  faceValue: bigint;
  financedFaceValue: bigint;
}

const FRONTIER_CACHE_TTL_MS = 3_000;

/**
 * Single access point for the configured chain: resolves the deployment manifest on boot,
 * builds a batched viem public client, and exposes the reads the indexer / read-through /
 * health need. Addresses come ONLY from `@matura/chain` manifests, never env.
 */
@Injectable()
export class ChainService implements OnModuleInit {
  private readonly logger = new Logger(ChainService.name);

  private clientRef: PublicClient | null = null;
  private addressesRef: ChainAddresses | null = null;
  private chainIdRef = 0;
  private deploymentBlockRef = 0n;
  private confirmations = 0;
  private frontierCache: { block: BlockRef; at: number } | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const chainId = this.config.get("CHAIN_ID", { infer: true });
    const rpcUrl = this.config.get("RPC_URL", { infer: true });
    this.confirmations = this.config.get("INDEXER_CONFIRMATIONS", { infer: true });

    const chain = resolveChain(chainId);
    const manifest = getManifest(chainId);

    this.chainIdRef = chainId;
    this.deploymentBlockRef = BigInt(manifest.deploymentBlock);
    this.addressesRef = {
      mockUsdt: manifest.addresses.mockUsdt as Hex,
      issuerRegistry: manifest.addresses.issuerRegistry as Hex,
      claimRegistry: manifest.addresses.claimRegistry as Hex,
      vaultRegistry: manifest.addresses.vaultRegistry as Hex,
      router: manifest.addresses.router as Hex,
      settlementManager: manifest.addresses.settlementManager as Hex,
    };
    this.clientRef = createPublicClientFor(chain, rpcUrl, { batch: true });

    const deployed = manifest.addresses.claimRegistry !== "0x0000000000000000000000000000000000000000";
    this.logger.log(
      `Chain ${String(chainId)} @ ${rpcUrl} (deployment block ${String(this.deploymentBlockRef)}, ` +
        `${deployed ? "deployed" : "NOT deployed — zero manifest"})`,
    );
  }

  get chainId(): number {
    return this.chainIdRef;
  }

  get deploymentBlock(): bigint {
    return this.deploymentBlockRef;
  }

  get addresses(): ChainAddresses {
    if (this.addressesRef === null) throw new Error("ChainService not initialized");
    return this.addressesRef;
  }

  get client(): PublicClient {
    if (this.clientRef === null) throw new Error("ChainService not initialized");
    return this.clientRef;
  }

  /**
   * The indexing frontier block: the `finalized` tag (default) or `head - CONFIRMATIONS`
   * for RPCs without the tag. `useCache` serves a short-TTL value for health/probe paths.
   */
  async getFrontierBlock(useCache = false): Promise<BlockRef> {
    if (useCache && this.frontierCache !== null && Date.now() - this.frontierCache.at < FRONTIER_CACHE_TTL_MS) {
      return this.frontierCache.block;
    }
    const client = this.client;
    let block: BlockRef;
    if (this.confirmations > 0) {
      const head = await client.getBlockNumber();
      const target = head > BigInt(this.confirmations) ? head - BigInt(this.confirmations) : 0n;
      block = await this.getRequiredBlock(target);
    } else {
      const raw = await client.getBlock({ blockTag: "finalized" });
      block = { number: raw.number, hash: raw.hash };
    }
    this.frontierCache = { block, at: Date.now() };
    return block;
  }

  /** Fetch a block by number, or null if it no longer exists (deep reorg / pruned). */
  async getBlockAt(blockNumber: bigint): Promise<BlockRef | null> {
    try {
      return await this.getRequiredBlock(blockNumber);
    } catch {
      return null;
    }
  }

  /** Read-through: the on-chain claim, or null if it doesn't exist (e.g. `ClaimNotFound`). */
  async getClaim(claimId: Hex): Promise<OnChainClaim | null> {
    try {
      const claim = await this.client.readContract({
        address: this.addresses.claimRegistry,
        abi: contractAbis.claimRegistry,
        functionName: "getClaim",
        args: [claimId],
      });
      return {
        beneficiary: claim.beneficiary,
        claimType: claim.claimType,
        state: claim.state,
        sliceCount: claim.sliceCount,
        dueDate: claim.dueDate,
        issuer: claim.issuer,
        token: claim.token,
        faceValue: claim.faceValue,
        financedFaceValue: claim.financedFaceValue,
      };
    } catch {
      return null;
    }
  }

  private async getRequiredBlock(blockNumber: bigint): Promise<BlockRef> {
    const raw = await this.client.getBlock({ blockNumber });
    return { number: raw.number, hash: raw.hash };
  }
}

function resolveChain(chainId: number): Chain {
  if (chainId === BSC_TESTNET_CHAIN_ID) return bscTestnet;
  if (chainId === LOCAL_CHAIN_ID) return hardhatLocal;
  throw new Error(`Unsupported CHAIN_ID ${String(chainId)} (expected 97 or 31337)`);
}
