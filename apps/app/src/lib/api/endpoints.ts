import { apiRequest } from "./client";
import {
  ActivityPage,
  ExecutionResponse,
  IssuedClaimsResponse,
  NonceResponse,
  OptimizeResponse,
  PortfolioResponse,
  PrepareResponse,
  SessionResponse,
  VaultsResponse,
  type AttestationPrepareRequest,
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

export const getVaults = (signal?: AbortSignal) =>
  apiRequest({ path: "/vaults", schema: VaultsResponse, signal });

export const getActivity = (wallet: string, limit: number, signal?: AbortSignal) => {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest({
    path: `/activity/${wallet}?${params.toString()}`,
    schema: ActivityPage,
    signal,
  });
};

export const getExecution = (executionId: string, signal?: AbortSignal) =>
  apiRequest({ path: `/executions/${executionId}`, schema: ExecutionResponse, signal });

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

// Issuer simulator (demo-signing): both return `kind:"transaction"` calldata steps.
export const postClaimRegistrationPrepare = (
  body: AttestationPrepareRequest,
  token: string,
  signal?: AbortSignal,
) =>
  apiRequest({
    method: "POST",
    path: "/claims/registration/prepare",
    schema: PrepareResponse,
    body,
    token,
    signal,
  });

export const postSettlementPrepare = (claimId: string, token: string, signal?: AbortSignal) =>
  apiRequest({
    method: "POST",
    path: `/settlements/${claimId}/prepare`,
    schema: PrepareResponse,
    token,
    signal,
  });

// Claims the authenticated issuer has registered (authed, issuer-scoped server-side).
export const getIssuedClaims = (token: string, signal?: AbortSignal) =>
  apiRequest({ path: "/claims/issued", schema: IssuedClaimsResponse, token, signal });
