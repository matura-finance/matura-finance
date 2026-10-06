"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

import { shortenAddress } from "../lib/chain/format";

// Route → browser-tab base title. Longest matching prefix wins so nested routes keep the
// section name. Falls back to "Matura".
const PAGE_TITLES: Record<string, string> = {
  "/vaults": "Matura Vaults",
  "/portfolio": "Matura Portfolio",
  "/request": "Matura Get Liquidity",
  "/issuer": "Matura Issuer Demo",
};

function baseTitle(pathname: string): string {
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return title;
  }
  return "Matura";
}

/**
 * Keeps the document title in sync with the open page. On the Portfolio page only, it appends the
 * connected wallet address (e.g. "Matura Portfolio | 0x04be…3812"); every other page stays as just
 * its name. Client-only — the address lives in wagmi. Rendered once inside the provider tree.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();

  useEffect(() => {
    const base = baseTitle(pathname);
    const onPortfolio = pathname === "/portfolio" || pathname.startsWith("/portfolio/");
    document.title =
      onPortfolio && isConnected && address !== undefined
        ? `${base} | ${shortenAddress(address)}`
        : base;
  }, [pathname, isConnected, address]);

  return null;
}
