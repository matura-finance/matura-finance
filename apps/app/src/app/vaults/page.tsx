import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Vaults — Matura",
};

export default function VaultsPage() {
  return (
    <Screen
      eyebrow="Mandates"
      title="Vault mandates & quotes"
      description="Browse the vaults financing liquidity requests: their mandates, the maturity profiles they accept, and the quotes they are streaming right now."
    >
      <Stack
        gap="md"
        className="rounded-card border border-border bg-mist/60 p-gutter text-sm text-muted-foreground dark:bg-secondary"
      >
        <p className="font-medium text-foreground">Prototype — this screen will show:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Vault mandates and the issuer/maturity ranges they cover.</li>
          <li>Live quotes with implied rates against open requests.</li>
          <li>Capacity and utilization per vault.</li>
        </ul>
      </Stack>
    </Screen>
  );
}
