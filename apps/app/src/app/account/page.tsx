import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Account — Matura",
};

export default function AccountPage() {
  return (
    <Screen
      eyebrow="Portfolio"
      title="Your Matura Account"
      description="A consolidated view of the positions held by your connected wallet: outstanding claims, redeemable balances, and settlement history across every issuer you hold exposure to."
    >
      <Stack
        gap="md"
        className="rounded-card border border-border bg-mist/60 p-gutter text-sm text-muted-foreground dark:bg-secondary"
      >
        <p className="font-medium text-foreground">Prototype — this screen will show:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Total portfolio value in base units, grouped by issuer and maturity.</li>
          <li>Redeemable vs. locked balances with per-claim due dates.</li>
          <li>A quick link into the liquidity Request flow for any held claim.</li>
        </ul>
      </Stack>
    </Screen>
  );
}
