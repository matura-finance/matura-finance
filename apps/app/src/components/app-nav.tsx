import { Badge } from "@matura/ui/components/badge";
import Image from "next/image";

import { env } from "../lib/env";
import { NavLinks } from "./nav-links";
import { WalletControl } from "./wallet/wallet-control";

/**
 * Product shell header. Near full-width (small side gap), with the primary nav on the left and
 * a persistent "BNB Chain Testnet" badge + wallet control on the right. The logo links out to
 * the marketing landing site. Server component — the active-nav and wallet pieces are the only
 * client parts (`<NavLinks />`, `<WalletControl />`).
 */
export function AppNav() {
  return (
    <header className="bg-muted/80 backdrop-blur">
      <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-8">
        <div className="flex h-16 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a
              href={env.landingUrl}
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
            </a>
            <NavLinks />
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
      </div>
    </header>
  );
}
