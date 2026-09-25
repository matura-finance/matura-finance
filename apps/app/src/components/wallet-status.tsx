"use client";

import { Badge } from "@matura/ui/components/badge";
import { useAccount } from "wagmi";

/**
 * Minimal wallet-status indicator. Confirms the wagmi provider is mounted and
 * reflects connection state. Full connect/disconnect UX lands in a later slice.
 */
export function WalletStatus() {
  const { address, isConnected } = useAccount();

  if (isConnected && address) {
    return (
      <Badge variant="default">
        {address.slice(0, 6)}…{address.slice(-4)}
      </Badge>
    );
  }

  return <Badge variant="outline">Wallet not connected</Badge>;
}
