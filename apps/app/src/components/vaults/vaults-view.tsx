"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Badge } from "@matura/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@matura/ui/components/card";
import { Skeleton } from "@matura/ui/components/skeleton";

import { useVaults } from "../../lib/api/hooks";
import { formatBps, formatUsdt, shortenAddress } from "../../lib/chain/format";
import { useVaultLabel } from "../../lib/chain/vault-label";
import type { VaultSummaryWire } from "../../lib/api/schemas";
import { NotDeployed, RpcUnavailable } from "../states";

/** Utilization as a percentage string, computed with BigInt (never float money). */
function utilization(v: VaultSummaryWire): string {
  const cap = BigInt(v.liquidityCap);
  if (cap === 0n) return "0%";
  const raw = cap - BigInt(v.fundableLiquidity);
  const used = raw > 0n ? raw : 0n; // fundable can briefly exceed cap; never show negative
  return `${(Number((used * 10_000n) / cap) / 100).toFixed(1)}%`;
}

export function VaultsView() {
  const query = useVaults();
  const vaultLabel = useVaultLabel();

  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;
  if (query.isPending) return <Skeleton className="h-56 w-full" />;
  if (query.isError) return <RpcUnavailable />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {query.data.vaults.map((vault) => (
        <Card key={vault.address}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{vaultLabel(vault.address)}</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">
                {shortenAddress(vault.address)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vault.supportedTypes.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Stat label="Base discount" value={formatBps(vault.baseDiscountBps)} />
              <Stat label="Per-day rate" value={formatBps(vault.durationBpsPerDay)} />
              <Stat label="Max duration" value={`${String(vault.maxDurationDays)} days`} />
              <Stat
                label="Lot range"
                value={`${formatUsdt(vault.minFace)} – ${formatUsdt(vault.maxFace)}`}
              />
              <Stat label="Fundable liquidity" value={formatUsdt(vault.fundableLiquidity)} />
              <Stat label="Utilization" value={utilization(vault)} />
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
