"use client";

import type { RejectedAlternative, RouteResult } from "@matura/shared";
import { AllocationBar } from "@matura/ui/components/allocation-bar";
import { Badge } from "@matura/ui/components/badge";
import { Card, CardContent } from "@matura/ui/components/card";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";
import { useMemo } from "react";

import type { FilteredOut } from "../../lib/api/schemas";
import { formatBps, formatUsdt, shortenAddress } from "../../lib/chain/format";
import { useVaultLabel } from "../../lib/chain/vault-label";
import { REASON_COPY, sortByPrecedence } from "../../lib/reasons";

const VAULT_COLORS = ["--color-vault-1", "--color-vault-2", "--color-vault-3", "--color-vault-4"];

/** width% of a base-unit value against a base-unit whole — BigInt geometry, not float money. */
function widthPct(value: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((value * 10_000n) / whole) / 100;
}

export function RouteBreakdown({
  result,
  filteredOut,
}: {
  result: RouteResult;
  filteredOut: FilteredOut[];
}) {
  const vaultLabel = useVaultLabel();

  const { segments, retained } = useMemo(() => {
    const assigned = BigInt(result.totalFaceAssigned);
    const retainedTotal = result.retainedFace.reduce((a, r) => a + BigInt(r.retained), 0n);
    const whole = assigned + retainedTotal;
    const rateByLeg = new Map(
      result.explanation.steps.map((s) => [`${s.claimId}-${s.vault}`, s.rateBps]),
    );
    const segs = result.legs.map((leg, i) => {
      const rate = rateByLeg.get(`${leg.claimId}-${leg.vault}`);
      return {
        key: `${leg.claimId}-${leg.vault}`,
        label: vaultLabel(leg.vault),
        widthPct: widthPct(BigInt(leg.faceAmount), whole),
        colorVar: VAULT_COLORS[i % VAULT_COLORS.length] ?? "--color-vault-1",
        sublabel: rate !== undefined ? formatBps(rate) : formatUsdt(leg.faceAmount),
      };
    });
    return {
      segments: segs,
      retained:
        retainedTotal > 0n
          ? {
              widthPct: widthPct(retainedTotal, whole),
              label: `You retain ${formatUsdt(retainedTotal.toString())}`,
            }
          : undefined,
    };
  }, [result, vaultLabel]);

  const rateByLeg = new Map(
    result.explanation.steps.map((s) => [`${s.claimId}-${s.vault}`, s.rateBps]),
  );
  const rejected: RejectedAlternative[] = sortByPrecedence(result.rejected);
  const filtered = sortByPrecedence(filteredOut);

  return (
    <div className="flex flex-col gap-6">
      {result.approximation === "greedy" && (
        <p className="text-sm text-warning-foreground">
          This route is an approximation and may not be the absolute cheapest.
        </p>
      )}

      <AllocationBar segments={segments} retained={retained} />

      <Table>
        <THead>
          <TR>
            <TH>Vault</TH>
            <TH numeric>Slice (face)</TH>
            <TH numeric>Rate</TH>
            <TH numeric>Cost</TH>
            <TH numeric>Advance</TH>
          </TR>
        </THead>
        <TBody>
          {result.legs.map((leg, i) => {
            const rate = rateByLeg.get(`${leg.claimId}-${leg.vault}`);
            return (
              <TR key={`${leg.claimId}-${leg.vault}`}>
                <TD>
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{
                        background: `var(${VAULT_COLORS[i % VAULT_COLORS.length] ?? "--color-vault-1"})`,
                      }}
                    />
                    {vaultLabel(leg.vault)}
                  </span>
                </TD>
                <TD numeric>{formatUsdt(leg.faceAmount)}</TD>
                <TD numeric>{rate !== undefined ? formatBps(rate) : "—"}</TD>
                <TD numeric>{formatUsdt(leg.discountAmount)}</TD>
                <TD numeric>{formatUsdt(leg.advanceAmount)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 py-5 text-sm sm:grid-cols-3">
          <Summary label="You receive" value={formatUsdt(result.totalAdvance)} strong />
          <Summary label="Claim value assigned" value={formatUsdt(result.totalFaceAssigned)} />
          <Summary label="Total cost" value={formatUsdt(result.totalCost)} />
          <Summary label="Effective cost" value={formatBps(result.effectiveDiscountBps)} />
          <Summary
            label="You retain"
            value={formatUsdt(
              result.retainedFace.reduce((a, r) => a + BigInt(r.retained), 0n).toString(),
            )}
          />
        </CardContent>
      </Card>

      {(rejected.length > 0 || filtered.length > 0) && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Also considered
          </p>
          <div className="flex flex-col gap-1.5">
            {rejected.map((r) => (
              <ReasonRow
                key={`r-${r.claimId}-${r.vault}`}
                reason={r.reason}
                label={vaultLabel(r.vault)}
              />
            ))}
            {filtered.map((f) => (
              <ReasonRow
                key={`f-${f.claimId}-${f.vault ?? "claim"}`}
                reason={f.reason}
                label={f.vault !== null ? vaultLabel(f.vault) : shortenAddress(f.claimId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${strong ? "font-heading text-lg font-semibold text-foreground" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ReasonRow({ reason, label }: { reason: keyof typeof REASON_COPY; label: string }) {
  const copy = REASON_COPY[reason];
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant={copy.tone === "warning" ? "warning" : "secondary"}>{copy.label}</Badge>
    </div>
  );
}
