import type { Metadata } from "next";

import { IssuerView } from "../../components/issuer/issuer-view";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Issuer simulator — Matura",
};

export default function IssuerPage() {
  return (
    <Screen
      eyebrow="Demo · admin"
      title="Issuer simulator"
      description="Create synthetic testnet claims, settle them, or mark a claim delayed. This is a demo surface — nothing here represents a real financial obligation."
    >
      <IssuerView />
    </Screen>
  );
}
