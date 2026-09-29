import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import { APP_URL, NAV_LINKS } from "../lib/site";
import { MobileNav } from "./mobile-nav";

/**
 * Top-level site navigation for the single-page site. Server component; the
 * hamburger is the sole client island ({@link MobileNav}). Sticky, Mist-light,
 * dark focus rings. Section links are in-page anchors; `external` links
 * (Docs → GitHub) leave the site.
 */
export function SiteNav() {
  const linkClass =
    "rounded-sm text-sm font-medium capitalize text-midnight/70 transition-colors hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <header className="sticky top-0 z-40 border-b border-midnight/10 bg-mist/90 backdrop-blur supports-[backdrop-filter]:bg-mist/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-gutter">
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

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a href={APP_URL} className={cn(buttonVariants({ size: "sm" }))}>
            Open Matura
          </a>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
