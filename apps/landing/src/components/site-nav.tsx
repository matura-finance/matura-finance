import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import { APP_URL, DOCS_URL, NAV_LINKS } from "../lib/site";
import { MobileNav } from "./mobile-nav";

/**
 * Top-level site navigation for the single-page site. Server component; the
 * hamburger is the sole client island ({@link MobileNav}). A sticky, floating
 * pill card — Mist-light, glass-blurred, with a gap on all sides. Section links
 * are in-page anchors; `external` links (Docs → GitHub) leave the site.
 */
export function SiteNav() {
  const linkClass =
    "rounded-sm text-sm font-medium capitalize text-midnight/70 transition-colors hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <header className="sticky top-0 z-50 px-gutter pt-3 sm:pt-4">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 rounded-2xl border border-midnight/10 bg-background/80 px-4 shadow-lg shadow-midnight/5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 sm:h-[4.5rem] sm:px-6">
        <Link
          href="/"
          aria-label="Matura — home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/logos/matura-logo.png"
            alt="Matura"
            width={108}
            height={36}
            priority
            unoptimized
          />
        </Link>

        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <a href={DOCS_URL} className={linkClass}>
            Docs
          </a>
          <a href={APP_URL} className={cn(buttonVariants({ size: "sm" }))}>
            Open Matura
          </a>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
