"use client";

import { Button } from "@matura/ui/components/button";
import { useAppKit } from "@reown/appkit/react";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";

import { StatePanel } from "./states";

/**
 * Wallet-connection gate for non-public routes (everything but /vaults). Until a wallet is
 * connected it blocks the route content and forces the connect flow; once connected it renders
 * children (which handle their own chain/sign-in states).
 */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { isConnected, address } = useAccount();
  const { open } = useAppKit();

  if (!isConnected || address === undefined) {
    return (
      <StatePanel
        title="Connect wallet first"
        body="This page needs a connected wallet. Connect to continue — Vaults is open to everyone, everything else lives behind your wallet."
        action={
          <Button size="lg" onClick={() => void open()}>
            Connect wallet first
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
}
