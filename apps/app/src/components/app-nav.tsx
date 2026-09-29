import { Badge } from "@matura/ui/components/badge";
import { Container } from "@matura/ui/components/container";
import Image from "next/image";
import Link from "next/link";

import { WalletControl } from "./wallet/wallet-control";

const NAV_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/request", label: "Get liquidity" },
  { href: "/activity", label: "Activity" },
  { href: "/vaults", label: "Vaults" },
] as const;

/**
 * Product shell header. Primary product routes on the left; the Issuer simulator is
 * visibly separated as a demo/admin surface (amber). A persistent "BNB Chain Testnet"
 * badge and the wallet control sit on the right. Server component — the wallet-aware
 * pieces are delegated to the client-only <WalletControl />.
 */
export function AppNav() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <Container>
        <div className="flex h-16 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/"
              aria-label="Matura — home"
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Image
                src="/logos/matura-logo.png"
                alt="Matura"
                width={120}
                height={40}
                priority
                unoptimized
              />
            </Link>
            <nav aria-label="Product" className="flex flex-wrap items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <span aria-hidden className="h-4 w-px bg-border" />
              <Link
                href="/issuer"
                className="text-sm font-medium text-warning transition-opacity hover:opacity-80"
              >
                Issuer
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <Image
                src="/logos/bnb/bnb-chain-black.png"
                alt="BNB Chain"
                width={91}
                height={16}
                unoptimized
                className="hidden dark:invert sm:block"
              />
              <Badge variant="warning" aria-label="Environment: BNB Chain Testnet">
                Testnet
              </Badge>
            </span>
            <WalletControl />
          </div>
        </div>
      </Container>
    </header>
  );
}
