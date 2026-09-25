import { buttonVariants } from "@matura/ui/components/button";
import { Container } from "@matura/ui/components/container";
import { Stack } from "@matura/ui/components/stack";
import Link from "next/link";

import { WalletStatus } from "./wallet-status";

const NAV_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/request", label: "Request" },
  { href: "/activity", label: "Activity" },
  { href: "/issuer", label: "Issuer" },
  { href: "/vaults", label: "Vaults" },
] as const;

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "https://matura.xyz";

/**
 * Top navigation across the five product routes. Server component — no wallet
 * hooks here; the client-only connection indicator is delegated to
 * <WalletStatus />.
 */
export function AppNav() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <Container>
        <Stack direction="horizontal" gap="lg" className="h-16 items-center justify-between">
          <Stack direction="horizontal" gap="lg" className="items-center">
            <Link href="/" className="font-heading text-lg font-semibold text-foreground">
              Matura
            </Link>
            <Stack direction="horizontal" gap="md" className="items-center">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </Stack>
          </Stack>

          <Stack direction="horizontal" gap="md" className="items-center">
            <WalletStatus />
            <a href={LANDING_URL} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to matura.xyz
            </a>
          </Stack>
        </Stack>
      </Container>
    </header>
  );
}
