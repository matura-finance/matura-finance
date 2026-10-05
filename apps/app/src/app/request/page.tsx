import type { Metadata } from "next";

import { RequestView } from "../../components/request/request-view";
import { RequireConnected } from "../../components/require-connected";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura Get Liquidity",
};

export default function RequestPage() {
  return (
    <RequireConnected>
      <Screen
        title="How much do you need today?"
        description="Matura will compare eligible claims and vaults, then assign only what is needed to fund your request."
      >
        <RequestView />
      </Screen>
    </RequireConnected>
  );
}
