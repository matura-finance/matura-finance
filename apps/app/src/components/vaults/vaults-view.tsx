"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Badge } from "@matura/ui/components/badge";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";

import type { VaultSummaryWire } from "../../lib/api/schemas";
import { formatAmount, formatBps, formatUsdt, shortenAddress } from "../../lib/chain/format";
import { useVaultLabel } from "../../lib/chain/vault-label";
import { useVaults } from "../../lib/queries/hooks";
import { NotDeployed, RpcUnavailable } from "../states";

/** "FREELANCE_ESCROW" → "Freelance Escrow": Title Case, underscores dropped. */
function formatClaimType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Utilization as a percentage string, computed with BigInt (never float money). */
function utilization(v: VaultSummaryWire): string {
  const cap = BigInt(v.liquidityCap);
  if (cap === 0n) return "0%";
  const raw = cap - BigInt(v.fundableLiquidity);
  const used = raw > 0n ? raw : 0n; // fundable can briefly exceed cap; never show negative
  return `${(Number((used * 10_000n) / cap) / 100).toFixed(1)}%`;
}

// Teaser rows for vaults not yet live — rendered blurred behind a "Coming soon" tag.
const COMING_SOON = [
  {
    name: "Treasury Yield Vault",
    claims: "INVOICE",
    lotRange: "10K – 500K",
    liquidity: "12.40M",
    cap: "20.00M",
    util: "38.0%",
    baseDiscount: "2.80%",
    perDay: "0.050%",
    maxDuration: "180 days",
  },
  {
    name: "RWA Prime",
    claims: "SALARY",
    lotRange: "5K – 250K",
    liquidity: "8.75M",
    cap: "15.00M",
    util: "58.3%",
    baseDiscount: "3.10%",
    perDay: "0.060%",
    maxDuration: "120 days",
  },
  {
    name: "Stable Advance",
    claims: "RENT",
    lotRange: "1K – 100K",
    liquidity: "5.20M",
    cap: "10.00M",
    util: "48.0%",
    baseDiscount: "2.40%",
    perDay: "0.040%",
    maxDuration: "90 days",
  },
] as const;

/** A blurred, non-selectable value used in the "coming soon" teaser rows. */
function Blurred({ children }: { children: string }) {
  return <span className="select-none blur-[3px]">{children}</span>;
}

export function VaultsView() {
  const query = useVaults();
  const vaultLabel = useVaultLabel();

  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;
  if (query.isPending) return <Skeleton className="h-56 w-full" />;
  if (query.isError) return <RpcUnavailable />;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-background">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Vault</TH>
            <TH>Supported Claims</TH>
            <TH numeric className="whitespace-nowrap">
              Lot Range
            </TH>
            <TH numeric>Liquidity</TH>
            <TH numeric>Utilization</TH>
            <TH numeric>Base Discount</TH>
            <TH numeric>Per-Day Rate</TH>
            <TH numeric>Max Duration</TH>
          </TR>
        </THead>
        <TBody>
          {query.data.vaults.map((vault) => (
            <TR key={vault.address}>
              <TD>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{vaultLabel(vault.address)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {shortenAddress(vault.address)}
                  </span>
                </div>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {vault.supportedTypes.map((t) => (
                    <Badge key={t} variant="secondary">
                      {formatClaimType(t)}
                    </Badge>
                  ))}
                </div>
              </TD>
              <TD numeric className="whitespace-nowrap">
                {formatAmount(vault.minFace)} – {formatUsdt(vault.maxFace)}
              </TD>
              <TD numeric>{formatUsdt(vault.fundableLiquidity)}</TD>
              <TD numeric>{utilization(vault)}</TD>
              <TD numeric>{formatBps(vault.baseDiscountBps)}</TD>
              <TD numeric>{formatBps(vault.durationBpsPerDay)}</TD>
              <TD numeric>{String(vault.maxDurationDays)} days</TD>
            </TR>
          ))}

          {COMING_SOON.map((v) => (
            <TR key={v.name} className="hover:bg-transparent">
              <TD>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="select-none font-medium text-muted-foreground blur-[2px]">
                    {v.name}
                  </span>
                  <Badge variant="outline" className="whitespace-nowrap capitalize">
                    Coming soon
                  </Badge>
                </div>
              </TD>
              <TD>
                <Badge variant="secondary" className="select-none blur-[3px]">
                  {formatClaimType(v.claims)}
                </Badge>
              </TD>
              <TD numeric className="whitespace-nowrap">
                <Blurred>{v.lotRange}</Blurred>
              </TD>
              <TD numeric>
                <Blurred>{v.liquidity}</Blurred>
              </TD>
              <TD numeric>
                <Blurred>{v.util}</Blurred>
              </TD>
              <TD numeric>
                <Blurred>{v.baseDiscount}</Blurred>
              </TD>
              <TD numeric>
                <Blurred>{v.perDay}</Blurred>
              </TD>
              <TD numeric>
                <Blurred>{v.maxDuration}</Blurred>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
