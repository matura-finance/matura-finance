import { buttonVariants } from "@matura/ui/components/button";
import { cn } from "@matura/ui/lib/utils";
import Link from "next/link";

import { APP_URL, NAV_LINKS } from "../lib/site";
import { MobileNav } from "./mobile-nav";

/**
 * Top-level site navigation. Server component; the hamburger is the sole client
 * island ({@link MobileNav}). Sticky, Mist-light, dark focus rings.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-midnight/10 bg-mist/90 backdrop-blur supports-[backdrop-filter]:bg-mist/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-gutter">
        <Link
          href="/"
          className="rounded-sm font-heading text-lg font-bold tracking-tight text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Matura
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-midnight/70 transition-colors hover:text-midnight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/protocol" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Explore the protocol
          </Link>
          <a href={APP_URL} className={cn(buttonVariants({ size: "sm" }))}>
            Open Matura
          </a>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
