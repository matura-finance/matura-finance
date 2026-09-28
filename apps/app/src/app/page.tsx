import { buttonVariants } from "@matura/ui/components/button";
import { Stack } from "@matura/ui/components/stack";
import Link from "next/link";

import { Screen } from "../components/screen";

const SECTIONS = [
  { href: "/account", label: "Account", blurb: "Portfolio & balances" },
  { href: "/request", label: "Request", blurb: "Turn claims into liquidity" },
  { href: "/activity", label: "Activity", blurb: "Requests & settlement" },
  { href: "/issuer", label: "Issuer", blurb: "Attestations & registry" },
  { href: "/vaults", label: "Vaults", blurb: "Mandates & quotes" },
] as const;

export default function HomePage() {
  return (
    <Screen
      eyebrow="Overview"
      title="Matura product app"
      description="A prototype workspace for connected wallets. Jump into any of the five product surfaces below."
    >
      <Stack direction="horizontal" gap="md" className="flex-wrap">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-card border border-border bg-mist/60 p-gutter transition-colors hover:border-primary dark:bg-secondary"
          >
            <span className="block font-heading text-lg font-semibold text-foreground">
              {section.label}
            </span>
            <span className="block text-sm text-muted-foreground">{section.blurb}</span>
          </Link>
        ))}
      </Stack>
      <a
        href={process.env.NEXT_PUBLIC_LANDING_URL ?? "https://usematura.xyz"}
        className={buttonVariants({ variant: "outline", size: "default" })}
      >
        Learn more at usematura.xyz
      </a>
    </Screen>
  );
}
