import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Request — Matura",
};

export default function RequestPage() {
  return (
    <Screen
      eyebrow="Liquidity"
      title="Request liquidity"
      description="Turn a future claim into liquidity today. Select a held claim, choose an amount, and route the request to vaults that quote against your maturity profile."
    >
      <Stack
        gap="md"
        className="rounded-card border border-border bg-mist/60 p-gutter text-sm text-muted-foreground dark:bg-secondary"
      >
        <p className="font-medium text-foreground">Prototype — this flow will let you:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Pick a claim and specify the base-unit amount to finance.</li>
          <li>Preview indicative quotes and fees before submitting on-chain.</li>
          <li>Sign and broadcast the request from your connected wallet.</li>
        </ul>
      </Stack>
    </Screen>
  );
}
