"use client";

import { bscTestnet } from "@matura/chain/chains";
import { Button } from "@matura/ui/components/button";
import { useAppKit } from "@reown/appkit/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { shortenAddress } from "../../lib/chain/format";
import { clearPendingRedirect } from "../../lib/pending-redirect";
import { WalletBlockie } from "./blockie";
import { CopyAddressButton } from "./copy-address-button";

/**
 * The wallet control in the shell header. States: disconnected ("Connect" → Reown modal) →
 * wrong network (switch) → connected (an avatar+address chip; SIWE is prompted automatically).
 *
 * Clicking the connected chip opens a small custom popover with just the address, a wallet
 * button (opens the Reown account modal) and a disconnect button — no "Sign in"/"Disconnect"
 * buttons in the header itself.
 */
export function WalletControl() {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { isAuthenticated, isSigningIn, signIn, signOut } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // After a successful connect on the right chain, prompt SIWE automatically — once per
  // address, so a rejected/dismissed signature doesn't loop the wallet prompt. Switching
  // accounts re-arms the attempt; disconnecting clears it.
  const attemptedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isConnected || address === undefined) {
      attemptedFor.current = undefined;
      return;
    }
    if (chainId !== bscTestnet.id || isAuthenticated || isSigningIn) return;
    if (attemptedFor.current === address) return;
    attemptedFor.current = address;
    void signIn();
  }, [isConnected, address, chainId, isAuthenticated, isSigningIn, signIn]);

  // Close the popover on an outside click. A document listener (not a fixed backdrop) is used
  // because the header's `backdrop-blur` makes it a containing block for fixed positioning.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  if (!isConnected || address === undefined) {
    return (
      <Button size="lg" onClick={() => void open()}>
        Connect
      </Button>
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
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setMenuOpen((v) => !v);
        }}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-full px-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <WalletBlockie address={address} size={22} />
        <span>{isSigningIn ? "Check your wallet…" : shortenAddress(address)}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 rounded-card border border-border bg-background p-3 shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <WalletBlockie address={address} size={28} />
              <span className="truncate text-sm font-medium">{shortenAddress(address)}</span>
              <CopyAddressButton address={address} />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Wallet details"
                title="Wallet details"
                onClick={() => {
                  setMenuOpen(false);
                  void open({ view: "Account" });
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WalletIcon />
              </button>
              <button
                type="button"
                aria-label="Disconnect"
                title="Disconnect"
                onClick={() => {
                  setMenuOpen(false);
                  clearPendingRedirect();
                  signOut();
                  disconnect();
                  router.replace("/vaults");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PowerIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wallet glyph (lucide "wallet" paths) — opens the Reown account modal. */
function WalletIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
      <path d="M3 5a2 2 0 0 0 2 2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-4a2 2 0 0 1 0-4h6" />
    </svg>
  );
}

/** Power glyph (lucide "power" paths) — disconnects the wallet. */
function PowerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v10" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  );
}
