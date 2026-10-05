"use client";

import { Button } from "@matura/ui/components/button";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { shortenAddress } from "../../lib/chain/format";
import { AccountView } from "../account/account-view";
import { ActivityView } from "../activity/activity-view";
import { GetLiquidityDialog } from "../request/get-liquidity-dialog";
import { WalletBlockie } from "../wallet/blockie";
import { CopyAddressButton } from "../wallet/copy-address-button";

const TABS = ["positions", "activity"] as const;
type Tab = (typeof TABS)[number];

/**
 * Portfolio surface: a wallet identity header (avatar + address + copy + connected status) and
 * two tabs — Positions (verified claims) and Activity (on-chain events). Get Liquidity lives here
 * as a modal launched from the positions context (deep-linkable via ?request=1). Rendered behind
 * RequireConnected, so an address is always present.
 */
export function PortfolioView() {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>("positions");
  const [requestOpen, setRequestOpen] = useState(false);

  // Deep-link: /portfolio?request=1 (and the /request redirect) opens the Get Liquidity flow.
  // Read client-side to avoid a prerender Suspense boundary for useSearchParams.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("request") === "1") setRequestOpen(true);
  }, []);

  if (address === undefined) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <WalletBlockie address={address} size={64} />
        <div className="flex items-center gap-3">
          <span className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {shortenAddress(address)}
          </span>
          <CopyAddressButton address={address} size={18} />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Connected
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-border">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
              }}
              aria-current={tab === t ? "page" : undefined}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="mb-2"
          onClick={() => {
            setRequestOpen(true);
          }}
        >
          Get Liquidity
        </Button>
      </div>

      <div>{tab === "positions" ? <AccountView /> : <ActivityView />}</div>

      <GetLiquidityDialog
        open={requestOpen}
        onClose={() => {
          setRequestOpen(false);
        }}
      />
    </div>
  );
}
