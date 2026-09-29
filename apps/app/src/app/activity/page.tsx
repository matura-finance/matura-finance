import type { Metadata } from "next";

import { ActivityView } from "../../components/activity/activity-view";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura",
};

export default function ActivityPage() {
  return (
    <Screen
      eyebrow="Activity"
      title="Activity and settlement"
      description="Route executions and claim lifecycle events for your connected wallet, with exact amounts and BNB Chain Testnet explorer links."
    >
      <ActivityView />
    </Screen>
  );
}
