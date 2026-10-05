"use client";

import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import type { State } from "wagmi";

import { DocumentTitle } from "../components/document-title";
import { SessionProvider } from "../lib/auth/session-provider";
import { networks, projectId, wagmiAdapter, wagmiConfig } from "../lib/appkit-config";
import { env } from "../lib/env";

/**
 * Initialise the Reown AppKit modal once, at module scope (never inside render).
 * It binds the modal to the shared wagmi adapter, so every wagmi hook in the app
 * (`useAccount`, `useSwitchChain`, …) reflects the same connection the modal drives.
 *
 * Features are kept wallet-only: no email/social login and no analytics, which
 * keeps the bundle and the CSP/connect-src surface minimal. WalletConnect's QR
 * path needs a real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; injected/EIP-6963
 * wallets connect regardless.
 */
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "Matura",
    description: "Matura product app — accounts, liquidity requests, and vault mandates.",
    url: env.appUrl,
    icons: [`${env.appUrl}/apple-touch-icon.png`],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  // The Coinbase Wallet connector pulls the Coinbase SDK, which fires telemetry to
  // cca-lite.coinbase.com (CSP-blocked) and registers a deprecated `unload` handler. We don't
  // target Coinbase Wallet on BSC testnet, so disable it: removes the console noise and trims
  // the Coinbase/@base-org/@x402 dependency surface. Injected/EIP-6963 + WalletConnect remain.
  enableCoinbase: false,
});

/**
 * The frozen provider tree: Wagmi → React Query → SIWE session. `QueryClient`
 * defaults are set here (not per-hook): reads are not refetched on window focus and
 * stay fresh briefly, so switching tabs doesn't hammer the API/RPC. The indexing poll
 * overrides these per-query (see `useExecutionPoll`).
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <DocumentTitle />
          {children}
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
