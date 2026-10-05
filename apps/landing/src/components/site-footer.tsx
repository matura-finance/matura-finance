import Image from "next/image";
import Link from "next/link";

import { APP_URL, GITHUB_DOCS, GITHUB_URL } from "../lib/site";

type FooterLink = { label: string; href: string; external?: boolean };

const GROUPS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Open App", href: APP_URL, external: true },
      { label: "How It Works", href: "/#how-it-works" },
    ],
  },
  {
    heading: "Protocol",
    links: [
      { label: "Live Contracts", href: "/#protocol" },
      { label: "Documentation", href: GITHUB_DOCS.readme, external: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "For Issuers", href: "/#issuers" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

/** White footer. On light, Liquid Mint stays fill/tick-only (contrast law). */
export function SiteFooter() {
  const linkClass =
    "text-sm text-midnight/70 transition-colors hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";

  return (
    <footer className="border-t border-midnight/10 bg-background text-midnight">
      <div className="mx-auto w-full max-w-6xl px-gutter py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-3">
            <Image
              src="/logos/matura-logo.png"
              alt="Matura"
              width={120}
              height={40}
              unoptimized
              className="self-start"
            />
            <p className="max-w-[30ch] text-sm text-midnight/60">
              Future Income Liquidity powered by best-execution routing.
            </p>
          </div>

          {GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-midnight/50">
                {group.heading}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className={linkClass}
                        {...(link.href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-14 max-w-[70ch] border-t border-midnight/10 pt-8 text-xs leading-relaxed text-midnight/50">
          Matura is a BNB Chain testnet prototype. It does not provide a production financial
          service or legal, investment, or lending advice.
        </p>
      </div>
    </footer>
  );
}
