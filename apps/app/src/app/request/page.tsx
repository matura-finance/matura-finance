import type { Metadata } from "next";

import { ConnectGate } from "../../components/connect-gate";
import { RequestView } from "../../components/request/request-view";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura Get Liquidity",
};

export default function RequestPage() {
  return (
    <Screen
      eyebrow="Get liquidity"
      title="How much do you need today?"
      description="Matura will compare eligible claims and vaults, then assign only what is needed to fund your request."
    >
      <ConnectGate>
        <RequestView />
      </ConnectGate>
    </Screen>
  );
}
