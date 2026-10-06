import type { Metadata } from "next";

import { PortfolioView } from "../../components/portfolio/portfolio-view";
import { RequireConnected } from "../../components/require-connected";
import { Screen } from "../../components/screen";

export const metadata: Metadata = {
  title: "Matura Portfolio",
};

export default function PortfolioPage() {
  return (
    <RequireConnected>
      <Screen>
        <PortfolioView />
      </Screen>
    </RequireConnected>
  );
}
