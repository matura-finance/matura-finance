import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CLAIM_ATTESTATION_TYPES, contractAbis, vaultAbi } from "@matura/chain";
import { type Hex, type TypedDataDomain } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { ChainService } from "./chain.service";
import type { ClaimAttestationMessage } from "../common/attestation";
import type { Env } from "../config/env.validation";

/** Quote result from `LiquidityVault.quoteAndCheck` (revert-free; `ok=false` = mandate-rejected). */
export interface VaultQuote {
  ok: boolean;
  advanceAmount: bigint;
  discountAmount: bigint;
}

/** On-chain mandate parameters returned by `LiquidityVault.getMandate`. */
export interface VaultMandate {
  supportedTypesBitmap: number;
  baseDiscountBps: number;
  durationBpsPerDay: number;
  maxDurationDays: number;
  minFace: bigint;
  maxFace: bigint;
  liquidityCap: bigint;
  claimTypePremiumBps: readonly [number, number, number];
}

/**
 * Chain reads bound to a single pinned block, so a request's whole snapshot is
 * internally consistent (determinism + a meaningful quote-snapshot hash). Obtain
 * one via `ContractsService.pinnedAt(blockNumber)`; the methods take no block
 * argument — they physically cannot read at `latest`.
 */
export interface PinnedReads {
  readonly blockNumber: bigint;
  getClaim(claimId: Hex): Promise<import("./chain.service").OnChainClaim | null>;
  isIssuerActive(issuer: Hex): Promise<boolean>;
  isVaultActive(vault: Hex): Promise<boolean>;
  vaultToken(vault: Hex): Promise<Hex>;
  routerPaused(): Promise<boolean>;
  routerNonce(user: Hex): Promise<bigint>;
  getVaults(): Promise<readonly Hex[]>;
  getMandate(vault: Hex): Promise<VaultMandate>;
  fundableLiquidity(vault: Hex): Promise<bigint>;
  quoteAndCheck(
    vault: Hex,
    issuer: Hex,
    claimType: number,
    faceAmount: bigint,
    dueDate: bigint,
  ): Promise<VaultQuote>;
}

/**
 * Prepare-time chain reads (epochs, nonces, financeability, vault quotes, fees) and the
 * isolated issuer demo signer. The signer is constructed ONLY outside production with a
 * configured key (§B1); in production it is never built and `ISSUER_PRIVATE_KEY` is never used.
 */
@Injectable()
export class ContractsService implements OnModuleInit {
  private readonly logger = new Logger(ContractsService.name);
  private demoSigner: PrivateKeyAccount | null = null;

  constructor(
    private readonly chain: ChainService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get("DEMO_ISSUER_SIGNING_ENABLED", { infer: true });
    const nodeEnv = this.config.get("NODE_ENV", { infer: true });
    const key = this.config.get("ISSUER_PRIVATE_KEY", { infer: true });
    if (enabled && nodeEnv !== "production" && key !== "") {
      this.demoSigner = privateKeyToAccount(key as Hex);
      this.logger.warn(`Issuer demo signing ENABLED (signer ${this.demoSigner.address})`);
    }
  }

  get canDemoSign(): boolean {
    return this.demoSigner !== null;
  }

  /** Demo-sign a ClaimAttestation with the isolated server key. Throws if demo signing is off. */
  async signClaimAttestation(
    domain: TypedDataDomain,
    message: ClaimAttestationMessage,
  ): Promise<Hex> {
    if (this.demoSigner === null) {
      throw new Error("Demo signing is not enabled");
    }
    return this.demoSigner.signTypedData({
      domain,
      types: CLAIM_ATTESTATION_TYPES,
      primaryType: "ClaimAttestation",
      message,
    });
  }

  currentEpoch(issuer: Hex): Promise<bigint> {
    return this.chain.client.readContract({
      address: this.chain.addresses.issuerRegistry,
      abi: contractAbis.issuerRegistry,
      functionName: "currentEpoch",
      args: [issuer],
    });
  }

  isIssuerActive(issuer: Hex, blockNumber?: bigint): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.issuerRegistry,
      abi: contractAbis.issuerRegistry,
      functionName: "isActive",
      args: [issuer],
      blockNumber,
    });
  }

  isNonceUsed(signer: Hex, nonce: bigint): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.claimRegistry,
      abi: contractAbis.claimRegistry,
      functionName: "isNonceUsed",
      args: [signer, nonce],
    });
  }

  isFinanceable(claimId: Hex): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.claimRegistry,
      abi: contractAbis.claimRegistry,
      functionName: "isFinanceable",
      args: [claimId],
    });
  }

  routerNonce(user: Hex, blockNumber?: bigint): Promise<bigint> {
    return this.chain.client.readContract({
      address: this.chain.addresses.router,
      abi: contractAbis.router,
      functionName: "nonces",
      args: [user],
      blockNumber,
    });
  }

  /** Whether the router is paused (`whenNotPaused` on `executeRoute`). */
  routerPaused(blockNumber?: bigint): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.router,
      abi: contractAbis.router,
      functionName: "paused",
      blockNumber,
    });
  }

  feeBps(): Promise<number> {
    return this.chain.client.readContract({
      address: this.chain.addresses.settlementManager,
      abi: contractAbis.settlementManager,
      functionName: "feeBps",
    });
  }

  isSettled(claimId: Hex): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.settlementManager,
      abi: contractAbis.settlementManager,
      functionName: "isSettled",
      args: [claimId],
    });
  }

  getVaults(blockNumber?: bigint): Promise<readonly Hex[]> {
    return this.chain.client.readContract({
      address: this.chain.addresses.vaultRegistry,
      abi: contractAbis.vaultRegistry,
      functionName: "getVaults",
      blockNumber,
    });
  }

  /** Whether a vault is active in the registry (`getVaults` returns ALL vaults, not active-only). */
  isVaultActive(vault: Hex, blockNumber?: bigint): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.vaultRegistry,
      abi: contractAbis.vaultRegistry,
      functionName: "isActive",
      args: [vault],
      blockNumber,
    });
  }

  /** The settlement token a vault funds in (for the `TokenMismatch` check). */
  vaultToken(vault: Hex, blockNumber?: bigint): Promise<Hex> {
    return this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "token",
      blockNumber,
    });
  }

  getMandate(vault: Hex, blockNumber?: bigint): Promise<VaultMandate> {
    return this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "getMandate",
      blockNumber,
    });
  }

  fundableLiquidity(vault: Hex, blockNumber?: bigint): Promise<bigint> {
    return this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "fundableLiquidity",
      blockNumber,
    });
  }

  async quoteAndCheck(
    vault: Hex,
    issuer: Hex,
    claimType: number,
    faceAmount: bigint,
    dueDate: bigint,
    blockNumber?: bigint,
  ): Promise<VaultQuote> {
    const [ok, advanceAmount, discountAmount] = await this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "quoteAndCheck",
      args: [issuer, claimType, faceAmount, dueDate],
      blockNumber,
    });
    return { ok, advanceAmount, discountAmount };
  }

  /**
   * A {@link PinnedReads} facade whose reads are all bound to `blockNumber`. Use
   * this for the router optimize/prepare snapshot so every read in a request lands
   * on one block — structurally impossible to accidentally read at `latest`.
   */
  pinnedAt(blockNumber: bigint): PinnedReads {
    return {
      blockNumber,
      getClaim: (claimId) => this.chain.getClaim(claimId, blockNumber),
      isIssuerActive: (issuer) => this.isIssuerActive(issuer, blockNumber),
      isVaultActive: (vault) => this.isVaultActive(vault, blockNumber),
      vaultToken: (vault) => this.vaultToken(vault, blockNumber),
      routerPaused: () => this.routerPaused(blockNumber),
      routerNonce: (user) => this.routerNonce(user, blockNumber),
      getVaults: () => this.getVaults(blockNumber),
      getMandate: (vault) => this.getMandate(vault, blockNumber),
      fundableLiquidity: (vault) => this.fundableLiquidity(vault, blockNumber),
      quoteAndCheck: (vault, issuer, claimType, faceAmount, dueDate) =>
        this.quoteAndCheck(vault, issuer, claimType, faceAmount, dueDate, blockNumber),
    };
  }
}
