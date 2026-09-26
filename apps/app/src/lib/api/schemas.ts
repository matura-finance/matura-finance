import { ClaimState, ClaimType, OptimizeResult, RejectionReason } from "@matura/shared";
import { z } from "zod";

/**
 * Local Zod mirrors of the `apps/api` HTTP wire shapes. The API DTOs are not
 * frontend-importable, so we mirror only what the frontend consumes. Money is a
 * base-unit decimal STRING everywhere (never number/float); addresses are lowercase
 * strings. The router `OptimizeResult` (and its nested route types) is reused DIRECTLY
 * from `@matura/shared` — the single source of truth for that shape.
 *
 * A drift guard (shared fixture parsed by both apps/api DTO tests and these) is a
 * follow-up (see plan WS-F2); today these are validated against MSW/e2e fixtures.
 */

// Wire scalars (unbranded — what the API actually sends).
const Money = z.string();
const Address = z.string();
const Bytes32 = z.string();
const IsoDate = z.string();

// ── Auth ──────────────────────────────────────────────────────────────────────
export const NonceResponse = z.object({
  nonce: z.string(),
  domain: z.string(),
  chainId: z.number(),
});
export type NonceResponse = z.infer<typeof NonceResponse>;

export const SessionResponse = z.object({
  token: z.string(),
  expiresAt: IsoDate,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

// ── Claims / portfolio ──────────────────────────────────────────────────────────
export const ClaimWire = z.object({
  claimId: Bytes32,
  beneficiary: Address,
  issuer: Address,
  claimType: ClaimType,
  token: Address,
  faceValue: Money,
  financedFaceValue: Money,
  dueAt: IsoDate,
  state: ClaimState,
  pending: z.boolean().optional(),
});
export type ClaimWire = z.infer<typeof ClaimWire>;

export const PortfolioResponse = z.object({
  wallet: Address,
  claims: z.array(ClaimWire),
  finalizedThrough: z.string(),
});
export type PortfolioResponse = z.infer<typeof PortfolioResponse>;

// ── Routes: optimize + prepare ────────────────────────────────────────────────
export const OptimizeRequest = z.object({
  claimIds: z.array(Bytes32).min(1).max(20),
  targetAdvance: Money,
  maxTotalFace: Money.optional(),
  maxTotalCost: Money.optional(),
  routeDeadlineSeconds: z.number().int().positive().max(3600).optional(),
});
export type OptimizeRequest = z.infer<typeof OptimizeRequest>;

export const FilteredOut = z.object({
  claimId: Bytes32,
  vault: Address.nullable(),
  reason: RejectionReason,
});
export type FilteredOut = z.infer<typeof FilteredOut>;

export const OptimizeResponse = z.object({
  chainId: z.number(),
  blockNumber: z.string(),
  finalizedThrough: z.string(),
  routeId: z.string().nullable(),
  expiresAt: IsoDate.nullable(),
  result: OptimizeResult,
  filteredOut: z.array(FilteredOut),
});
export type OptimizeResponse = z.infer<typeof OptimizeResponse>;

// The uniform write-preparation envelope.
export const PrepareStep = z.object({
  kind: z.enum(["typed-data", "transaction"]),
  to: Address,
  data: z.string().optional(),
  value: z.string().default("0"),
  verifyingContract: Address.optional(),
  typedData: z.unknown().optional(),
  expiry: z.string().optional(),
  nonce: z.string().optional(),
  submitFunction: z.string().optional(),
  signature: z.string().optional(),
});
export type PrepareStep = z.infer<typeof PrepareStep>;

export const PrepareResponse = z.object({
  chainId: z.number(),
  steps: z.array(PrepareStep),
  summary: z.string(),
  finalizedThrough: z.string(),
});
export type PrepareResponse = z.infer<typeof PrepareResponse>;

// ── Executions ──────────────────────────────────────────────────────────────────
export const ExecutionStatus = z.enum(["PENDING", "EXECUTED", "FAILED"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const ExecutionLegWire = z.object({
  claimId: Bytes32,
  vault: Address,
  faceAmount: Money,
  advanceAmount: Money,
  discountAmount: Money,
});

export const ExecutionResponse = z.object({
  executionId: Bytes32,
  user: Address,
  targetAdvance: Money.nullable(),
  totalAdvance: Money,
  totalFaceAssigned: Money,
  totalCost: Money,
  status: ExecutionStatus,
  legs: z.array(ExecutionLegWire),
  finalizedThrough: z.string(),
});
export type ExecutionResponse = z.infer<typeof ExecutionResponse>;

// ── Vaults ────────────────────────────────────────────────────────────────────
export const VaultSummaryWire = z.object({
  address: Address,
  supportedTypes: z.array(ClaimType),
  baseDiscountBps: z.number(),
  durationBpsPerDay: z.number(),
  maxDurationDays: z.number(),
  minFace: Money,
  maxFace: Money,
  liquidityCap: Money,
  fundableLiquidity: Money,
});
export type VaultSummaryWire = z.infer<typeof VaultSummaryWire>;

export const VaultsResponse = z.object({
  vaults: z.array(VaultSummaryWire),
  finalizedThrough: z.string(),
});
export type VaultsResponse = z.infer<typeof VaultsResponse>;

// ── Activity ────────────────────────────────────────────────────────────────────
export const ActivityEvent = z.object({
  kind: z.string(),
  claimId: Bytes32.nullable(),
  executionId: Bytes32.nullable(),
  payload: z.unknown(),
  txHash: z.string(),
  blockNumber: z.string(),
  logIndex: z.number(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

export const ActivityPage = z.object({
  wallet: Address,
  items: z.array(ActivityEvent),
  finalizedThrough: z.string(),
});
export type ActivityPage = z.infer<typeof ActivityPage>;

// ── Issuer attestation (demo-sign claim registration) ──────────────────────────
export const AttestationPrepareRequest = z.object({
  claimId: Bytes32,
  beneficiary: Address,
  token: Address,
  faceValue: Money,
  dueAt: IsoDate,
  claimType: ClaimType,
  externalIdHash: Bytes32.optional(),
  evidenceHash: Bytes32.optional(),
});
export type AttestationPrepareRequest = z.infer<typeof AttestationPrepareRequest>;
