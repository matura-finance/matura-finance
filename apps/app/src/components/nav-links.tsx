"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/vaults", label: "Vaults" },
  { href: "/portfolio", label: "Portfolio" },
] as const;

/**
 * Primary product nav. The active route gets a filled rounded box (neutral `accent`
 * surface — existing token, no new colors); the Issuer Demo link keeps its amber identity
 * and gets a tinted box when active.
 */
export function NavLinks() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Product" className="flex flex-wrap items-center gap-1">
      {NAV_LINKS.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <Link
        href="/issuer"
        aria-current={isActive("/issuer") ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-sm font-medium text-warning transition-colors ${
          isActive("/issuer") ? "bg-background shadow-sm" : "hover:bg-background/70"
        }`}
      >
        Issuer Demo
      </Link>
    </nav>
  );
}
