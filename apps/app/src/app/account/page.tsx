import type { Metadata } from "next";

import { AccountView } from "../../components/account/account-view";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura",
};

export default function AccountPage() {
  return (
    <Screen
      eyebrow="Matura Account"
      title="Your future income, in one place."
      description="A consolidated view of the verified future payments held by your connected wallet — what is available to route now, what remains yours, and when each is expected to settle."
    >
      <AccountView />
    </Screen>
  );
}
