import type { Metadata } from "next";

import { Screen } from "../../components/screen";
import { VaultsView } from "../../components/vaults/vaults-view";

export const metadata: Metadata = {
  title: "Vaults — Matura",
};

export default function VaultsPage() {
  return (
    <Screen
      eyebrow="Matura Vaults"
      title="Matura Vaults"
      description="Compare the mandates and pricing policies that compete to fund eligible Matura Claims."
    >
      <VaultsView />
    </Screen>
  );
}
