import { apiRequest } from "./client";
import {
  ActivityPage,
  ClaimDetailResponse,
  ExecutionResponse,
  NonceResponse,
  OptimizeResponse,
  PortfolioResponse,
  PrepareResponse,
  QuotesResponse,
  SessionResponse,
  VaultsResponse,
  type OptimizeRequest,
} from "./schemas";

/** Thin endpoint bindings over {@link apiRequest}. Authed calls take a `token`. */

// Auth
export const getNonce = (signal?: AbortSignal) =>
  apiRequest({ path: "/auth/nonce", schema: NonceResponse, signal });

export const postVerify = (message: string, signature: string, signal?: AbortSignal) =>
  apiRequest({
    method: "POST",
    path: "/auth/verify",
    schema: SessionResponse,
    body: { message, signature },
    signal,
  });

// Public reads
export const getPortfolio = (wallet: string, signal?: AbortSignal) =>
  apiRequest({ path: `/account/${wallet}`, schema: PortfolioResponse, signal });

export const getClaim = (claimId: string, signal?: AbortSignal) =>
  apiRequest({ path: `/claims/${claimId}`, schema: ClaimDetailResponse, signal });

export const getVaults = (signal?: AbortSignal) =>
  apiRequest({ path: "/vaults", schema: VaultsResponse, signal });

export const getActivity = (
  wallet: string,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) params.set("cursor", cursor);
  return apiRequest({
    path: `/activity/${wallet}?${params.toString()}`,
    schema: ActivityPage,
    signal,
  });
};

export const getExecution = (executionId: string, signal?: AbortSignal) =>
  apiRequest({ path: `/executions/${executionId}`, schema: ExecutionResponse, signal });

export const postQuotePreview = (
  body: { issuer: string; claimType: string; faceValue: string; dueAt: string },
  signal?: AbortSignal,
) => apiRequest({ method: "POST", path: "/quotes/preview", schema: QuotesResponse, body, signal });

// Authed writes (route flow)
export const postOptimize = (body: OptimizeRequest, token: string, signal?: AbortSignal) =>
  apiRequest({
    method: "POST",
    path: "/routes/optimize",
    schema: OptimizeResponse,
    body,
    token,
    signal,
  });

export const postPrepareExecution = (routeId: string, token: string, signal?: AbortSignal) =>
  apiRequest({
    method: "POST",
    path: `/routes/${routeId}/prepare-execution`,
    schema: PrepareResponse,
    token,
    signal,
  });
