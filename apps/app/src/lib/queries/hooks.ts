"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { env } from "../env";
import { useSession } from "../auth/session-provider";
import { ApiError } from "../api/client";
import {
  getActivity,
  getExecution,
  getPortfolio,
  getVaults,
  postOptimize,
  postPrepareExecution,
} from "../api/endpoints";
import type { ExecutionResponse, OptimizeRequest } from "../api/schemas";

/** Hierarchical query keys — scoped by chain + address so switching account refetches. */
export const queryKeys = {
  portfolio: (wallet: string) => ["portfolio", env.chainId, wallet] as const,
  vaults: () => ["vaults", env.chainId] as const,
  activity: (wallet: string) => ["activity", env.chainId, wallet] as const,
  execution: (executionId: string) => ["execution", env.chainId, executionId] as const,
};

const POLL_INTERVAL_MS = 2_500;
const POLL_MAX_TICKS = 30; // ~75s ceiling, then stop and show "taking longer than expected".

export function useAccountPortfolio(wallet: string | undefined) {
  return useQuery({
    queryKey: queryKeys.portfolio(wallet ?? ""),
    enabled: wallet !== undefined,
    queryFn: ({ signal }) => getPortfolio(wallet ?? "", signal),
  });
}

export function useVaults() {
  return useQuery({
    queryKey: queryKeys.vaults(),
    queryFn: ({ signal }) => getVaults(signal),
    staleTime: 60_000,
  });
}

export function useActivity(wallet: string | undefined, limit = 25) {
  return useQuery({
    // `limit` is part of the key so changing it produces a distinct cache entry; invalidation
    // by the `activity(wallet)` prefix still matches all limits.
    queryKey: [...queryKeys.activity(wallet ?? ""), limit],
    enabled: wallet !== undefined,
    queryFn: ({ signal }) => getActivity(wallet ?? "", limit, signal),
  });
}

/**
 * Poll a prepared execution until the indexer projects it. A 404 is the EXPECTED
 * "not yet indexed" state (indexer writes EXECUTED rows only), so we model it as a
 * `null` pending result — never an error — and keep polling within a bounded window.
 */
export function useExecutionPoll(executionId: string | undefined, active: boolean) {
  return useQuery<ExecutionResponse | null>({
    queryKey: queryKeys.execution(executionId ?? ""),
    enabled: active && executionId !== undefined,
    retry: false,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      try {
        return await getExecution(executionId ?? "", signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null; // still indexing
        throw e;
      }
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "EXECUTED" || status === "FAILED") return false;
      if (query.state.dataUpdateCount >= POLL_MAX_TICKS) return false;
      return POLL_INTERVAL_MS;
    },
  });
}

/** A 401 means the bearer token is dead (expired/revoked) — clear the session so the UI
 *  drops back to the sign-in state instead of retrying with a dead token. */
function useClearSessionOn401() {
  const { signOut } = useSession();
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) signOut();
    },
    [signOut],
  );
}

export function useOptimize() {
  const { token } = useSession();
  const onError = useClearSessionOn401();
  return useMutation({
    mutationFn: (body: OptimizeRequest) => {
      if (token === null) throw new ApiError(401, "NO_SESSION", "Sign in to continue");
      return postOptimize(body, token);
    },
    onError,
  });
}

export function usePrepareExecution() {
  const { token } = useSession();
  const onError = useClearSessionOn401();
  return useMutation({
    mutationFn: (routeId: string) => {
      if (token === null) throw new ApiError(401, "NO_SESSION", "Sign in to continue");
      return postPrepareExecution(routeId, token);
    },
    onError,
  });
}

/** Invalidate the account + activity reads after a confirmed, indexed execution.
 *  Memoized so effects depending on it don't re-run every render (see get-liquidity-dialog). */
export function useInvalidateOnSettled() {
  const queryClient = useQueryClient();
  return useCallback(
    (wallet: string) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio(wallet) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(wallet) });
    },
    [queryClient],
  );
}
