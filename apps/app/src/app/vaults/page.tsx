import type { Metadata } from "next";

import { Screen } from "../../components/screen";
import { VaultsHowItWorks } from "../../components/vaults/vaults-how-it-works";
import { VaultsView } from "../../components/vaults/vaults-view";

export const metadata: Metadata = {
  title: "Matura Vaults",
};

export default function VaultsPage() {
  return (
    <Screen
      title="Matura Vaults"
      titleAccessory={<VaultsHowItWorks />}
      description="Compare the mandates and pricing policies that compete to fund eligible Matura Claims."
    >
      <VaultsView />
    </Screen>
  );
}
