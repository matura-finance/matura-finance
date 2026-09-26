"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Badge } from "@matura/ui/components/badge";
import { Card, CardContent } from "@matura/ui/components/card";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Stack } from "@matura/ui/components/stack";
import { useAccount } from "wagmi";

import { useAccountPortfolio } from "../../lib/api/hooks";
import { formatUsdt, shortenAddress } from "../../lib/chain/format";
import type { ClaimWire } from "../../lib/api/schemas";
import { Disconnected, EmptyAccount, NotDeployed, RpcUnavailable, WrongChain } from "../states";

const CLAIM_TYPE_LABEL: Record<ClaimWire["claimType"], string> = {
  PAYROLL: "Earned salary",
  FREELANCE_ESCROW: "Approved freelance payout",
  STREAM: "Onchain stream",
};

/** Sum a list of base-unit strings with BigInt (never float). */
function sumBaseUnits(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v), 0n).toString();
}

function availableToRoute(claim: ClaimWire): string {
  return (BigInt(claim.faceValue) - BigInt(claim.financedFaceValue)).toString();
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function AccountView() {
  const { address, isConnected, chainId } = useAccount();
  const query = useAccountPortfolio(isConnected ? address : undefined);

  if (!isConnected || address === undefined) return <Disconnected />;
  if (chainId !== bscTestnet.id) return <WrongChain />;
  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;
  if (query.isPending) {
    return (
      <Stack gap="md">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </Stack>
    );
  }
  if (query.isError) return <RpcUnavailable />;

  const { claims } = query.data;
  if (claims.length === 0) return <EmptyAccount />;

  const totalVerified = sumBaseUnits(claims.map((c) => c.faceValue));
  const financed = sumBaseUnits(claims.map((c) => c.financedFaceValue));
  const eligible = sumBaseUnits(claims.map(availableToRoute));
  const nextDue = claims
    .map((c) => c.dueAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(0);

  return (
    <Stack gap="lg">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total verified value" value={formatUsdt(totalVerified)} />
        <Metric label="Available to route" value={formatUsdt(eligible)} />
        <Metric label="Financed value" value={formatUsdt(financed)} />
        <Metric
          label="Next expected payment"
          value={nextDue !== undefined ? new Date(nextDue).toLocaleDateString() : "—"}
        />
      </div>

      <Stack gap="md">
        {claims.map((claim) => (
          <Card key={claim.claimId}>
            <CardContent className="flex flex-col gap-3 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">{CLAIM_TYPE_LABEL[claim.claimType]}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{claim.state}</Badge>
                  <Badge variant="warning">Testnet · synthetic</Badge>
                  {claim.pending === true && <Badge variant="secondary">Indexing…</Badge>}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Field label="Issuer" value={shortenAddress(claim.issuer)} mono />
                <Field label="Face value" value={formatUsdt(claim.faceValue)} />
                <Field label="Available to route" value={formatUsdt(availableToRoute(claim))} />
                <Field label="Maturity" value={new Date(claim.dueAt).toLocaleDateString()} />
              </dl>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-foreground ${mono ? "font-mono tabular-nums" : "tabular-nums"}`}>
        {value}
      </dd>
    </div>
  );
}
