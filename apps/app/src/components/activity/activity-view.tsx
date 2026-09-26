"use client";

import { bscTestnet } from "@matura/chain/chains";
import { isDeployed } from "@matura/chain/deployments";
import { Card, CardContent } from "@matura/ui/components/card";
import { Skeleton } from "@matura/ui/components/skeleton";
import { Stack } from "@matura/ui/components/stack";
import { useAccount } from "wagmi";

import { useActivity } from "../../lib/api/hooks";
import { shortenAddress, txExplorerUrl } from "../../lib/chain/format";
import { Disconnected, NotDeployed, RpcUnavailable, WrongChain } from "../states";

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
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground">
            No activity yet. Route executions and claim lifecycle events will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      {items.map((event) => {
        const url = txExplorerUrl(event.txHash);
        return (
          <Card key={`${event.txHash}-${String(event.logIndex)}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
              <div>
                <p className="font-medium text-foreground">{humanizeKind(event.kind)}</p>
                <p className="text-xs text-muted-foreground">
                  Block {event.blockNumber}
                  {event.claimId !== null && ` · claim ${shortenAddress(event.claimId)}`}
                </p>
              </div>
              {url !== null ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-foreground underline underline-offset-2 hover:opacity-80"
                >
                  {shortenAddress(event.txHash)} ↗
                </a>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">
                  {shortenAddress(event.txHash)}
                </span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
