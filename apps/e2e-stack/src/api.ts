import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Account,
  type Hex,
  type PublicClient,
} from "viem";
import { createSiweMessage } from "viem/siwe";
import { EXECUTION_ROUTE_TYPES, contractAbis, hardhatLocal, routerDomain } from "@matura/chain";
import type { z } from "zod";
import { API_BASE_URL, CHAIN_ID, RPC_URL, SIWE_DOMAIN } from "./env.js";
import {
  ClaimDetail,
  NonceResponse,
  OptimizeResponse,
  PrepareResponse,
  SessionResponse,
  type ExecutionRouteMessage,
} from "./schemas.js";

/// OZ Nonces getter on the router (read the live per-user route nonce).
const NONCES_ABI = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface ApiRequestOptions<T> {
  method?: "GET" | "POST";
  path: string;
  schema: z.ZodType<T>;
  body?: unknown;
  token?: string;
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 5;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/// A single Zod-validating HTTP wrapper — every response is parsed at the boundary, so nothing
/// downstream ever touches an `any`/unknown body. Fails fast on a wedged API (fetch timeout) and
/// backs off on 429 (the `optimize` endpoint is throttled to 5/min per wallet) rather than throwing
/// the throttle error straight into the scenario.
export async function apiRequest<T>(opts: ApiRequestOptions<T>): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE_URL}${opts.path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "");
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1),
      );
      continue;
    }
    if (!res.ok) {
      throw new Error(`API ${opts.method ?? "GET"} ${opts.path} → ${String(res.status)}: ${text}`);
    }
    return opts.schema.parse(JSON.parse(text) as unknown);
  }
}

/// SIWE sign-in for `account`, returning a bearer token. Builds the message with viem's
/// `createSiweMessage` (standard SIWE the API's `verifySiweMessage` accepts) and signs it.
export async function siweLogin(account: Account): Promise<string> {
  const { nonce } = await apiRequest({ path: "/auth/nonce", schema: NonceResponse });
  const message = createSiweMessage({
    domain: SIWE_DOMAIN,
    address: getAddress(account.address),
    statement: "Sign in to Matura (e2e-stack).",
    uri: `http://${SIWE_DOMAIN}`,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date(),
  });
  if (account.signMessage === undefined) throw new Error("account cannot sign messages");
  const signature = await account.signMessage({ message });
  const session = await apiRequest({
    method: "POST",
    path: "/auth/verify",
    schema: SessionResponse,
    body: { message, signature },
  });
  return session.token;
}

export function optimize(
  body: {
    claimIds: Hex[];
    targetAdvance: string;
    maxTotalFace?: string;
    routeDeadlineSeconds?: number;
  },
  token: string,
): Promise<OptimizeResponse> {
  return apiRequest({
    method: "POST",
    path: "/routes/optimize",
    schema: OptimizeResponse,
    body,
    token,
  });
}

export function prepareExecution(routeId: string, token: string): Promise<PrepareResponse> {
  return apiRequest({
    method: "POST",
    path: `/routes/${routeId}/prepare-execution`,
    schema: PrepareResponse,
    token,
  });
}

export function getClaim(claimId: Hex): Promise<ClaimDetail> {
  return apiRequest({ path: `/claims/${claimId}`, schema: ClaimDetail });
}

/// Coerce the validated (string-typed) ExecutionRoute message into the bigint-typed struct viem
/// signs + the router expects.
function coerceRoute(m: ExecutionRouteMessage) {
  return {
    user: getAddress(m.user),
    targetAdvance: BigInt(m.targetAdvance),
    maxTotalFace: BigInt(m.maxTotalFace),
    deadline: BigInt(m.deadline),
    nonce: BigInt(m.nonce),
    legs: m.legs.map((l) => ({
      claimId: l.claimId, // Hex-validated at the schema boundary
      vault: getAddress(l.vault),
      faceAmount: BigInt(l.faceAmount),
      minimumAdvanceAmount: BigInt(l.minimumAdvanceAmount),
    })),
  };
}

/// Sign the ExecutionRoute from the prepare step using the typed @matura/chain EIP-712 types +
/// router domain (never coercing the server's `types` blob), then submit `executeRoute` on-chain.
/// Returns the settlement-relevant execution block number.
export async function signAndExecuteRoute(
  prepare: PrepareResponse,
  account: Account,
  publicClient: PublicClient,
): Promise<bigint> {
  const step = prepare.steps.find((s) => s.kind === "typed-data" && s.typedData !== undefined);
  if (step?.typedData === undefined) throw new Error("prepare returned no typed-data step");
  const router = getAddress(step.typedData.domain.verifyingContract);
  const route = coerceRoute(step.typedData.message);

  // Correct the router nonce to the CURRENT on-chain value before signing. The API prepares the
  // nonce from its (head - 1) frontier, which lags on an instant-mine local chain (on a real chain
  // block time hides this); a real wallet signs against the live nonce, so we do the same. We sign
  // the message ourselves, so overriding the nonce keeps the signature valid and matches the router.
  route.nonce = await publicClient.readContract({
    address: router,
    abi: NONCES_ABI,
    functionName: "nonces",
    args: [getAddress(account.address)],
  });

  if (account.signTypedData === undefined) throw new Error("account cannot sign typed data");
  const signature = await account.signTypedData({
    domain: routerDomain(CHAIN_ID, router),
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message: route,
  });

  const wallet = createWalletClient({ account, chain: hardhatLocal, transport: http(RPC_URL) });
  const hash = await wallet.writeContract({
    address: router,
    abi: contractAbis.router,
    functionName: "executeRoute",
    args: [route, signature],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`executeRoute reverted (tx ${hash})`);
  return receipt.blockNumber;
}

export function makePublicClient(): PublicClient {
  return createPublicClient({ chain: hardhatLocal, transport: http(RPC_URL) });
}
