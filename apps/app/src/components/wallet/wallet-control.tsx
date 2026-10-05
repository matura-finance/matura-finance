"use client";

import { bscTestnet } from "@matura/chain/chains";
import { Button } from "@matura/ui/components/button";
import { useAppKit } from "@reown/appkit/react";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";

import { useSession } from "../../lib/auth/session-provider";
import { shortenAddress } from "../../lib/chain/format";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending "copied" reset timer on unmount.
  useEffect(
    () => () => {
      if (copyResetRef.current !== null) clearTimeout(copyResetRef.current);
    },
    [],
  );

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
              <button
                type="button"
                aria-label={copied ? "Address copied" : "Copy address"}
                title={copied ? "Copied" : "Copy address"}
                onClick={() => {
                  void navigator.clipboard.writeText(address);
                  setCopied(true);
                  if (copyResetRef.current !== null) clearTimeout(copyResetRef.current);
                  copyResetRef.current = setTimeout(() => {
                    setCopied(false);
                  }, 1500);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              </button>
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
                  signOut();
                  disconnect();
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

/**
 * Deterministic blockie-style identicon derived from the address — no dependency, matches the
 * pixelated avatar wallets render. A 5-column, left-right-symmetric grid seeded by the address.
 */
function WalletBlockie({ address, size = 22 }: { address: string; size?: number }) {
  const rand = seededRandom(address.toLowerCase());
  const hue = Math.floor(rand() * 360);
  const background = `hsl(${String(hue)} 65% 55%)`;
  const foreground = `hsl(${String((hue + 150) % 360)} 70% 40%)`;
  const spot = `hsl(${String((hue + 60) % 360)} 75% 72%)`;

  const columns = 5;
  const half = Math.ceil(columns / 2);
  const cell = size / columns;
  const rects: { x: number; y: number; fill: string }[] = [];
  for (let y = 0; y < columns; y++) {
    for (let x = 0; x < half; x++) {
      const r = rand();
      if (r <= 0.43) continue; // transparent → shows the background
      const fill = r > 0.72 ? spot : foreground;
      rects.push({ x, y, fill });
      if (x !== columns - 1 - x) rects.push({ x: columns - 1 - x, y, fill });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      aria-hidden
      className="shrink-0 rounded-full"
    >
      <rect width={size} height={size} fill={background} />
      {rects.map((r) => (
        <rect
          key={`${String(r.x)}-${String(r.y)}`}
          x={r.x * cell}
          y={r.y * cell}
          width={cell}
          height={cell}
          fill={r.fill}
        />
      ))}
    </svg>
  );
}

/** xmur3-seeded mulberry32 PRNG — deterministic per address, no crypto needed for an avatar. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

/** Copy glyph (lucide "copy") — copies the address to the clipboard. */
function CopyIcon({ size = 15 }: { size?: number }) {
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
      <rect width={14} height={14} x={8} y={8} rx={2} ry={2} />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/** Check glyph (lucide "check") — shown briefly after a successful copy. */
function CheckIcon({ size = 15 }: { size?: number }) {
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
      className="text-primary"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
