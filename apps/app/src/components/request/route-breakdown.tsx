"use client";

import type { RouteResult } from "@matura/shared";
import { AllocationBar } from "@matura/ui/components/allocation-bar";
import { Badge } from "@matura/ui/components/badge";
import { Card, CardContent } from "@matura/ui/components/card";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";
import { useMemo } from "react";

import type { FilteredOut } from "../../lib/api/schemas";
import { formatBps, formatUsdt, shortenHex } from "../../lib/chain/format";
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

  // All derived values in one memo (deps: result, filteredOut, vaultLabel) — avoids rebuilding
  // the rate Map twice and re-sorting/re-reducing on every render.
  const { segments, retained, rateByLeg, retainedTotal, considered } = useMemo(() => {
    const assigned = BigInt(result.totalFaceAssigned);
    const retTotal = result.retainedFace.reduce((a, r) => a + BigInt(r.retained), 0n);
    const whole = assigned + retTotal;
    const rates = new Map(
      result.explanation.steps.map((s) => [`${s.claimId}-${s.vault}`, s.rateBps]),
    );
    const segs = result.legs.map((leg, i) => {
      const rate = rates.get(`${leg.claimId}-${leg.vault}`);
      return {
        key: `${leg.claimId}-${leg.vault}`,
        label: vaultLabel(leg.vault),
        widthPct: widthPct(BigInt(leg.faceAmount), whole),
        colorVar: VAULT_COLORS[i % VAULT_COLORS.length] ?? "--color-vault-1",
        sublabel: rate !== undefined ? formatBps(rate) : formatUsdt(leg.faceAmount),
      };
    });
    // Combine rejected + filtered into one precedence-sorted "also considered" list; the view
    // caps how many it shows.
    const consideredList = [
      ...sortByPrecedence(result.rejected).map((r) => ({
        key: `r-${r.claimId}-${r.vault}`,
        reason: r.reason,
        label: vaultLabel(r.vault),
      })),
      ...sortByPrecedence(filteredOut).map((f) => ({
        key: `f-${f.claimId}-${f.vault ?? "claim"}`,
        reason: f.reason,
        label: f.vault !== null ? vaultLabel(f.vault) : shortenHex(f.claimId),
      })),
    ];
    return {
      segments: segs,
      rateByLeg: rates,
      retainedTotal: retTotal,
      considered: consideredList,
      retained:
        retTotal > 0n
          ? {
              widthPct: widthPct(retTotal, whole),
              label: `You retain ${formatUsdt(retTotal.toString())}`,
            }
          : undefined,
    };
  }, [result, filteredOut, vaultLabel]);

  return (
    <div className="flex flex-col gap-4">
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

      {/* Receipt: the first two lines sum to the subtotal, so the cost is self-evident. */}
      <Card>
        <CardContent className="flex flex-col gap-2.5 py-4">
          <SummaryRow label="You receive" value={formatUsdt(result.totalAdvance)} emphasis />
          <SummaryRow
            label={`Total cost (${formatBps(result.effectiveDiscountBps)})`}
            value={`+ ${formatUsdt(result.totalCost)}`}
          />
          <div aria-hidden className="h-px bg-border" />
          <SummaryRow label="Claim value assigned" value={formatUsdt(result.totalFaceAssigned)} />
          <SummaryRow
            label="You retain (unfinanced)"
            value={formatUsdt(retainedTotal.toString())}
            muted
          />
        </CardContent>
      </Card>

      {considered.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Also considered
          </p>
          <div className="flex flex-col gap-1.5">
            {considered.slice(0, 3).map((c) => (
              <ReasonRow key={c.key} reason={c.reason} label={c.label} />
            ))}
          </div>
          {considered.length > 3 && (
            <p className="mt-2 text-xs text-muted-foreground">
              +{considered.length - 3} more not shown
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={`text-sm ${emphasis ? "font-medium text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          emphasis
            ? "font-heading text-xl font-semibold text-foreground"
            : muted
              ? "text-sm text-muted-foreground"
              : "text-sm font-medium text-foreground"
        }`}
      >
        {value}
      </span>
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
