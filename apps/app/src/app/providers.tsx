"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import type { State } from "wagmi";

import { SessionProvider } from "../lib/auth/session-provider";
import { getConfig } from "../lib/wagmi";

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
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(makeQueryClient);

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
