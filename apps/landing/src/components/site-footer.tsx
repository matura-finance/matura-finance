import Link from "next/link";

import { APP_URL, GITHUB_URL } from "../lib/site";

type FooterLink = { label: string; href: string; external?: boolean };

const GROUPS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Open app", href: APP_URL, external: true },
      { label: "How it works", href: "/how-it-works" },
    ],
  },
  {
    heading: "Protocol",
    links: [
      { label: "Contracts", href: "/protocol" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  {
    heading: "Resources",
    links: [{ label: "GitHub", href: GITHUB_URL, external: true }],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

/** Deep-Night footer. Mint is contrast-legal here (dark surface). */
export function SiteFooter() {
  const linkClass =
    "text-sm text-mist/70 transition-colors hover:text-liquid-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-deep-night rounded-sm";

  return (
    <footer className="dark bg-deep-night text-mist">
      <div className="mx-auto w-full max-w-6xl px-gutter py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-3">
            <span className="font-heading text-lg font-bold tracking-tight text-mist">Matura</span>
            <p className="max-w-[30ch] text-sm text-mist/60">
              Future Income Liquidity powered by best-execution routing.
            </p>
          </div>

          {GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-mist/50">
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

        <p className="mt-14 max-w-[70ch] border-t border-mist/10 pt-8 text-xs leading-relaxed text-mist/50">
          Matura is a BNB Chain testnet prototype. It does not provide a production financial
          service or legal, investment, or lending advice.
        </p>
      </div>
    </footer>
  );
}
