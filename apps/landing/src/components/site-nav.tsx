import { Container } from "@matura/ui/components/container";
import { buttonVariants } from "@matura/ui/components/button";
import Link from "next/link";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.matura.xyz";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/protocol", label: "Protocol" },
  { href: "/for-issuers", label: "For issuers" },
  { href: "/docs", label: "Docs" },
  { href: "/privacy", label: "Privacy" },
] as const;

/**
 * Top-level site navigation. Server component — no client state, no wallet.
 * Renders the wordmark, the five section links, and the CTA into the app.
 */
export function SiteNav() {
  return (
    <header className="border-b border-white/10 bg-deep-night">
      <Container>
        <nav className="flex h-16 items-center justify-between gap-6">
          <Link href="/" className="font-heading text-lg font-semibold tracking-tight text-mist">
            Matura
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-mist/70 transition-colors hover:text-liquid-mint"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <a href={APP_URL} className={buttonVariants({ size: "sm" })} rel="noreferrer">
            Open the app
          </a>
        </nav>
      </Container>
    </header>
  );
}
