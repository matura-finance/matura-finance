import type { Metadata } from "next";

import { IssuerView } from "../../components/issuer/issuer-view";
import { RequireConnected } from "../../components/require-connected";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura Issuer Demo",
};

export default function IssuerPage() {
  return (
    <RequireConnected>
      <Screen
        eyebrow="Demo · Admin"
        eyebrowVariant="warning"
        title="Issuer Simulator"
        description="Stand in for an issuer to drive the demo end to end: create a claim for your wallet, finance it on Portfolio, then come back to settle or delay it. Everything here uses synthetic testnet claims and mock USDT — nothing represents a real financial obligation."
      >
        <IssuerView />
      </Screen>
    </RequireConnected>
  );
}
