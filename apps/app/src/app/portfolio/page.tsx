import { Stack } from "@matura/ui/components/stack";
import type { Metadata } from "next";

import { AccountView } from "../../components/account/account-view";
import { ActivityView } from "../../components/activity/activity-view";
import { RequireConnected } from "../../components/require-connected";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura Portfolio",
};

export default function PortfolioPage() {
  return (
    <RequireConnected>
      <Screen
        eyebrow="Portfolio"
        title="Your portfolio"
        description="Your verified future payments and the on-chain activity across your connected wallet, in one place."
      >
        <Stack gap="xl">
          <AccountView />
          <section className="space-y-4">
            <h2 className="font-heading text-xl font-semibold text-foreground">Activity</h2>
            <ActivityView />
          </section>
        </Stack>
      </Screen>
    </RequireConnected>
  );
}
