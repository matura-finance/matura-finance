"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { env } from "../env";
import { useSession } from "../auth/session-provider";
import { ApiError } from "../api/client";
import {
  getActivity,
  getExecution,
  getIssuedClaims,
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
  issuedClaims: (issuer: string) => ["issued-claims", env.chainId, issuer] as const,
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
 * Claims the signed-in issuer has registered. Authed + issuer-scoped server-side, so it only
 * returns on a valid session. Polls on a short interval so newly created claims (and state
 * changes driven off-chain, e.g. mark-eligible/mark-matured) surface as the indexer projects them.
 */
export function useIssuedClaims(issuer: string | undefined) {
  const { token } = useSession();
  return useQuery({
    queryKey: queryKeys.issuedClaims(issuer ?? ""),
    enabled: issuer !== undefined && token !== null,
    queryFn: ({ signal }) => {
      if (token === null) throw new ApiError(401, "NO_SESSION", "Sign in to continue");
      return getIssuedClaims(token, signal);
    },
    refetchInterval: 6_000,
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
  const { refresh } = useSession();
  return useCallback(
    (error: unknown) => {
      // A 401 means the bearer token is dead — drop it and re-prompt SIWE automatically
      // (no manual disconnect/reconnect). `refresh` collapses concurrent 401s and loop-guards.
      if (error instanceof ApiError && error.status === 401) refresh();
    },
    [refresh],
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

/** Refetch the issuer's claim list after a create/settle/delay (the indexer catches up shortly). */
export function useInvalidateIssuedClaims() {
  const queryClient = useQueryClient();
  return useCallback(
    (issuer: string) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.issuedClaims(issuer) });
    },
    [queryClient],
  );
}
