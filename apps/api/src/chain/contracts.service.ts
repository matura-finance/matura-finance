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

  get demoSignerAddress(): Hex | null {
    return this.demoSigner?.address ?? null;
  }

  /** Demo-sign a ClaimAttestation with the isolated server key. Throws if demo signing is off. */
  async signClaimAttestation(domain: TypedDataDomain, message: ClaimAttestationMessage): Promise<Hex> {
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

  isIssuerActive(issuer: Hex): Promise<boolean> {
    return this.chain.client.readContract({
      address: this.chain.addresses.issuerRegistry,
      abi: contractAbis.issuerRegistry,
      functionName: "isActive",
      args: [issuer],
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

  routerNonce(user: Hex): Promise<bigint> {
    return this.chain.client.readContract({
      address: this.chain.addresses.router,
      abi: contractAbis.router,
      functionName: "nonces",
      args: [user],
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

  getVaults(): Promise<readonly Hex[]> {
    return this.chain.client.readContract({
      address: this.chain.addresses.vaultRegistry,
      abi: contractAbis.vaultRegistry,
      functionName: "getVaults",
    });
  }

  getMandate(vault: Hex): Promise<{
    supportedTypesBitmap: number;
    baseDiscountBps: number;
    durationBpsPerDay: number;
    maxDurationDays: number;
    minFace: bigint;
    maxFace: bigint;
    liquidityCap: bigint;
    claimTypePremiumBps: readonly [number, number, number];
  }> {
    return this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "getMandate",
    });
  }

  fundableLiquidity(vault: Hex): Promise<bigint> {
    return this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "fundableLiquidity",
    });
  }

  async quoteAndCheck(
    vault: Hex,
    issuer: Hex,
    claimType: number,
    faceAmount: bigint,
    dueDate: bigint,
  ): Promise<VaultQuote> {
    const [ok, advanceAmount, discountAmount] = await this.chain.client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "quoteAndCheck",
      args: [issuer, claimType, faceAmount, dueDate],
    });
    return { ok, advanceAmount, discountAmount };
  }
}
