import { Badge } from "@matura/ui/components/badge";
import { Container } from "@matura/ui/components/container";
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
            <Link href="/" className="font-heading text-lg font-semibold text-foreground">
              Matura
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
            <Badge variant="warning" aria-label="Environment: BNB Chain Testnet">
              BNB Chain Testnet
            </Badge>
            <WalletControl />
          </div>
        </div>
      </Container>
    </header>
  );
}
