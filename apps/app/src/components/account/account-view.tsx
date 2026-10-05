"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Badge } from "@matura/ui/components/badge";
import { buttonVariants } from "@matura/ui/components/button";
import { Card, CardContent } from "@matura/ui/components/card";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Stack } from "@matura/ui/components/stack";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";
import Link from "next/link";
import { useAccount } from "wagmi";

import type { ClaimWire } from "../../lib/api/schemas";
import { formatUsdt, shortenAddress } from "../../lib/chain/format";
import { CLAIM_TYPE_LABEL } from "../../lib/claim-display";
import { useAccountPortfolio } from "../../lib/queries/hooks";
import { Disconnected, NotDeployed, RpcUnavailable, StatePanel, WrongChain } from "../states";

/** Sum a list of base-unit strings with BigInt (never float). */
function sumBaseUnits(values: string[]): string {
  return values.reduce((acc, v) => acc + BigInt(v), 0n).toString();
}

// Only these states contribute financeable value; only non-terminal claims have an
// expected future payment.
const ELIGIBLE_STATES = new Set(["ELIGIBLE", "PARTIALLY_FUNDED"]);
const TERMINAL_STATES = new Set(["PAID", "DEFAULTED", "REVOKED", "REJECTED"]);

function availableToRoute(claim: ClaimWire): string {
  const remaining = BigInt(claim.faceValue) - BigInt(claim.financedFaceValue);
  return (remaining > 0n ? remaining : 0n).toString();
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
  if (claims.length === 0) {
    return (
      <StatePanel
        title="No future payments yet"
        body="Your verified future payments (Matura Claims) show up here once an approved issuer issues one to this wallet. Ask your issuer to issue yours from their Matura issuer portal — it appears here automatically once it's on-chain, and then you can route it for liquidity."
        action={
          <Link href="/issuer" className={buttonVariants({ variant: "outline", size: "default" })}>
            Open the issuer portal
          </Link>
        }
      />
    );
  }

  const totalVerified = sumBaseUnits(claims.map((c) => c.faceValue));
  const financed = sumBaseUnits(claims.map((c) => c.financedFaceValue));
  const eligible = sumBaseUnits(
    claims.filter((c) => ELIGIBLE_STATES.has(c.state)).map(availableToRoute),
  );
  const nextDue = claims
    .filter((c) => !TERMINAL_STATES.has(c.state))
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

      <div className="overflow-hidden rounded-card border border-border bg-background">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Type</TH>
              <TH>State</TH>
              <TH numeric>Face value</TH>
              <TH numeric>Available to route</TH>
              <TH numeric>Maturity</TH>
              <TH>Issuer</TH>
            </TR>
          </THead>
          <TBody>
            {claims.map((claim) => (
              <TR key={claim.claimId}>
                <TD className="font-medium text-foreground">{CLAIM_TYPE_LABEL[claim.claimType]}</TD>
                <TD>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{claim.state}</Badge>
                    {claim.pending === true && <Badge variant="secondary">Indexing…</Badge>}
                  </div>
                </TD>
                <TD numeric>{formatUsdt(claim.faceValue)}</TD>
                <TD numeric>{formatUsdt(availableToRoute(claim))}</TD>
                <TD numeric className="whitespace-nowrap">
                  {new Date(claim.dueAt).toLocaleDateString()}
                </TD>
                <TD className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(claim.issuer)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </Stack>
  );
}
