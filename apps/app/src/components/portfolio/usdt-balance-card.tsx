"use client";

import { mockUSDTAbi } from "@matura/chain/abis";
import { bscTestnet } from "@matura/chain/chains";
import { getDeployment } from "@matura/chain/deployments";
import { Card } from "@matura/ui/components/card";
import { useReadContract } from "wagmi";

import { toAddress } from "../../lib/chain/bridge";
import { formatAmount } from "../../lib/chain/format";

/**
 * Hero card showing the wallet's MockUSDT balance, read straight from the token contract and
 * polled so an advance from Get Liquidity (or a settlement) shows up without a manual refresh.
 * Mirrors the "Your deposits" summary on comparable dashboards, adapted to the testnet mock token.
 */
export function UsdtBalanceCard({ address }: { address: string }) {
  const usdt = getDeployment(bscTestnet.id).mockUsdt;
  const { data } = useReadContract({
    address: toAddress(usdt),
    abi: mockUSDTAbi,
    functionName: "balanceOf",
    args: [toAddress(address)],
    query: { refetchInterval: 10_000 },
  });

  const loaded = data !== undefined;

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Wallet balance
        </p>
        <p className="font-heading text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
          {loaded ? formatAmount(data.toString()) : "—"}
          {loaded && (
            <span className="ml-2 text-xl font-medium text-muted-foreground sm:text-2xl">USDT</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">MockUSDT · BNB Chain Testnet</p>
      </div>
    </Card>
  );
}
