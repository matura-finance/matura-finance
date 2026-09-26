"use client";

import { bscTestnet } from "@matura/chain/chains";
import { Badge } from "@matura/ui/components/badge";
import { Button } from "@matura/ui/components/button";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { shortenAddress } from "../../lib/chain/format";

/**
 * The wallet control in the shell header. Walks the states: disconnected (EIP-6963
 * connector list) → wrong network (switch) → connected-but-signed-out (SIWE) →
 * authenticated (address + disconnect). Injected/EIP-6963 discovery only.
 */
export function WalletControl() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { isAuthenticated, isSigningIn, signIn, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isConnected || address === undefined) {
    return (
      <div className="relative">
        <Button
          size="sm"
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
          aria-expanded={menuOpen}
        >
          Connect wallet
        </Button>
        {menuOpen && (
          <ul className="absolute right-0 z-20 mt-2 w-56 rounded-card border border-border bg-background p-1 shadow-md">
            {connectors.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No wallet detected</li>
            )}
            {connectors.map((connector) => (
              <li key={connector.uid}>
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => {
                    connect({ connector });
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  {connector.icon !== undefined && (
                    // eslint-disable-next-line @next/next/no-img-element -- wallet icons are data URIs from the connector, not optimizable assets
                    <img src={connector.icon} alt="" width={18} height={18} />
                  )}
                  {connector.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (chainId !== bscTestnet.id) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={isSwitching}
        onClick={() => {
          switchChain({ chainId: bscTestnet.id });
        }}
      >
        Switch to BNB Chain Testnet
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!isAuthenticated ? (
        <Button size="sm" disabled={isSigningIn} onClick={() => void signIn()}>
          {isSigningIn ? "Check your wallet…" : "Sign in"}
        </Button>
      ) : (
        <Badge variant="outline">{shortenAddress(address)}</Badge>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          signOut();
          disconnect();
        }}
      >
        Disconnect
      </Button>
    </div>
  );
}
