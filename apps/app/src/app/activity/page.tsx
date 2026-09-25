import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Activity — Matura",
};

export default function ActivityPage() {
  return (
    <Screen
      eyebrow="Settlement"
      title="Activity & settlement"
      description="A live ledger of every request, quote, and settlement touching your wallet, with each row's on-chain state and the block it was confirmed in."
    >
      <Stack
        gap="md"
        className="rounded-card border border-border bg-mist/60 p-gutter text-sm text-muted-foreground dark:bg-secondary"
      >
        <p className="font-medium text-foreground">Prototype — this screen will show:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>A chronological feed of requests, fills, and redemptions.</li>
          <li>Per-event settlement state (pending, confirmed, failed) and tx links.</li>
          <li>Block number and log index for each projected event.</li>
        </ul>
      </Stack>
    </Screen>
  );
}
