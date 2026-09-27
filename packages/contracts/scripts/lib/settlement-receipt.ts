import type { Hex } from "viem";

/// A single party's token balance before/after a settlement (base units).
export interface PartyBalance {
  label: string;
  address: Hex;
  before: bigint;
  after: bigint;
}

/// The four `ClaimSettled` conservation components (base units).
export interface ClaimSettledFields {
  amountReceived: bigint;
  vaultDistribution: bigint;
  userResidual: bigint;
  protocolFee: bigint;
}

/// A settlement receipt: the claim, its face, per-party balance deltas, and the emitted components.
export interface SettlementReceipt {
  claimId: Hex;
  faceValue: bigint;
  parties: readonly PartyBalance[];
  settled: ClaimSettledFields;
}

/// Signed balance delta for a party (after − before).
export function partyDelta(p: PartyBalance): bigint {
  return p.after - p.before;
}

/// Throw unless the emitted components satisfy exact conservation
/// (`amountReceived == vaultDistribution + userResidual + protocolFee`).
export function assertConservation(s: ClaimSettledFields): void {
  const sum = s.vaultDistribution + s.userResidual + s.protocolFee;
  if (s.amountReceived !== sum) {
    throw new Error(
      `Settlement conservation violated: amountReceived ${s.amountReceived.toString()} != ` +
        `vaultDistribution ${s.vaultDistribution.toString()} + userResidual ${s.userResidual.toString()} + ` +
        `protocolFee ${s.protocolFee.toString()}`,
    );
  }
}

/// Human-readable receipt (base units) for demo scripts and logs.
export function formatReceipt(r: SettlementReceipt): string {
  const lines = [
    `Settlement receipt — claim ${r.claimId}`,
    `  faceValue:         ${r.faceValue.toString()}`,
    `  amountReceived:    ${r.settled.amountReceived.toString()}`,
    `  vaultDistribution: ${r.settled.vaultDistribution.toString()}`,
    `  userResidual:      ${r.settled.userResidual.toString()}`,
    `  protocolFee:       ${r.settled.protocolFee.toString()}`,
  ];
  for (const p of r.parties) {
    const d = partyDelta(p);
    const sign = d >= 0n ? "+" : "";
    lines.push(
      `  ${p.label.padEnd(16)} ${sign}${d.toString()} (before ${p.before.toString()} → after ${p.after.toString()})`,
    );
  }
  return lines.join("\n");
}
