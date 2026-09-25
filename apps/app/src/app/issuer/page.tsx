import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Issuer — Matura",
};

export default function IssuerPage() {
  return (
    <Screen
      eyebrow="Attestations"
      title="Issuer attestations"
      description="Review the issuers behind your claims: their registered signer, active status, and the attestations they have published on-chain."
    >
      <Stack
        gap="md"
        className="rounded-card border border-border bg-mist/60 p-gutter text-sm text-muted-foreground dark:bg-secondary"
      >
        <p className="font-medium text-foreground">Prototype — this screen will show:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>Issuer registry entries with signer address and active flag.</li>
          <li>Published attestations and the claims they back.</li>
          <li>Last synced block per issuer projection.</li>
        </ul>
      </Stack>
    </Screen>
  );
}
