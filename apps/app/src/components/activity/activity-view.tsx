"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { buttonVariants } from "@matura/ui/components/button";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@matura/ui/components/table";
import Link from "next/link";
import { useAccount } from "wagmi";

import { shortenHex, txExplorerUrl } from "../../lib/chain/format";
import { useActivity } from "../../lib/queries/hooks";
import { Disconnected, NotDeployed, RpcUnavailable, StatePanel, WrongChain } from "../states";

/** Turn an event `kind` (e.g. "ROUTE_EXECUTED") into a readable label. */
function humanizeKind(kind: string): string {
  return kind
    .toLowerCase()
    .split(/[._]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ActivityView() {
  const { address, isConnected, chainId } = useAccount();
  const query = useActivity(isConnected ? address : undefined);

  if (!isConnected || address === undefined) return <Disconnected />;
  if (chainId !== bscTestnet.id) return <WrongChain />;
  if (!isDeployed(bscTestnet.id)) return <NotDeployed />;
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <RpcUnavailable />;

  const { items } = query.data;
  if (items.length === 0) {
    return (
      <StatePanel
        title="No activity yet"
        body="Route executions and claim lifecycle events for your wallet will appear here."
        action={
          <Link href="/vaults" className={buttonVariants({ size: "default" })}>
            Browse vaults
          </Link>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-background">
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Event</TH>
            <TH numeric>Block</TH>
            <TH>Claim</TH>
            <TH numeric>Transaction</TH>
          </TR>
        </THead>
        <TBody>
          {items.map((event) => {
            const url = txExplorerUrl(event.txHash);
            return (
              <TR key={`${event.txHash}-${String(event.logIndex)}`}>
                <TD className="font-medium text-foreground">{humanizeKind(event.kind)}</TD>
                <TD numeric>{event.blockNumber}</TD>
                <TD className="font-mono text-xs text-muted-foreground">
                  {event.claimId !== null ? shortenHex(event.claimId) : "—"}
                </TD>
                <TD numeric>
                  {url !== null ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      {shortenHex(event.txHash)} ↗
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {shortenHex(event.txHash)}
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
