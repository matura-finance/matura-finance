import { test as base } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Chain,
  type Hex,
  type TypedData,
  type TypedDataDomain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Playwright-layer mock wallet. viem signs/sends in Node (this fixture); the page gets a
 * thin EIP-1193 provider that delegates every `request` to an exposed Node binding and
 * announces itself over EIP-6963, so the app's default wagmi discovery lists it as a
 * connector — with NO wallet code shipped in the app bundle.
 *
 * Config (all optional): E2E_PRIVATE_KEY (default Hardhat #0), E2E_CHAIN_ID (default 97,
 * the app's only chain), E2E_RPC_URL (default local node). The key's address MUST be the
 * seeded claim beneficiary, or optimize returns NOT_OWNED_BY_WALLET.
 */
const PRIVATE_KEY = (process.env.E2E_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as Hex;
const CHAIN_ID = Number(process.env.E2E_CHAIN_ID ?? "97");
const RPC_URL = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";

const WALLET_NAME = "Matura E2E Wallet";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
interface TypedField {
  name: string;
  type: string;
}
interface TypedMessage {
  domain: TypedDataDomain;
  types: Record<string, TypedField[]>;
  primaryType: string;
  message: Record<string, JsonValue>;
}

/** Coerce an EIP-712 JSON message (numeric strings) into the bigint-typed shape viem needs. */
function coerceValue(type: string, value: JsonValue, types: Record<string, TypedField[]>): unknown {
  if (type.endsWith("[]")) {
    const base = type.slice(0, -2);
    return Array.isArray(value) ? value.map((v) => coerceValue(base, v, types)) : value;
  }
  if (/^u?int/.test(type)) return BigInt(value as string);
  if (
    types[type] !== undefined &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return coerceStruct(type, value, types);
  }
  return value;
}

function coerceStruct(
  typeName: string,
  value: Record<string, JsonValue>,
  types: Record<string, TypedField[]>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of types[typeName] ?? []) {
    out[field.name] = coerceValue(field.type, value[field.name] ?? null, types);
  }
  return out;
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
  page: async ({ page }, use) => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const chain: Chain = defineChain({
      id: CHAIN_ID,
      name: "e2e",
      nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] } },
    });
    const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });
    const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

    // Mimic a real wallet: not authorized until the user explicitly connects, so wagmi does
    // NOT auto-reconnect on mount and the connect flow stays explicit + deterministic.
    let authorized = false;

    await page.exposeFunction(
      "__maturaMockRpc",
      async (method: string, params: JsonValue[]): Promise<unknown> => {
        switch (method) {
          case "eth_requestAccounts":
            authorized = true;
            return [account.address];
          case "eth_accounts":
            return authorized ? [account.address] : [];
          case "eth_chainId":
            return `0x${CHAIN_ID.toString(16)}`;
          case "net_version":
            return String(CHAIN_ID);
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
          case "wallet_requestPermissions":
            return null;
          case "personal_sign": {
            const [a, b] = params as [string, string];
            const message = isAddress(a) ? b : a; // the non-address arg is the message payload
            return account.signMessage({ message: { raw: message as Hex } });
          }
          case "eth_signTypedData_v4": {
            const [, json] = params as [string, string];
            const typed = JSON.parse(json) as TypedMessage;
            return account.signTypedData({
              domain: typed.domain,
              types: typed.types as unknown as TypedData,
              primaryType: typed.primaryType,
              message: coerceStruct(typed.primaryType, typed.message, typed.types),
            });
          }
          case "eth_sendTransaction": {
            const [tx] = params as [{ to?: string; data?: string; value?: string }];
            return walletClient.sendTransaction({
              account,
              chain,
              to: tx.to as Hex | undefined,
              data: tx.data as Hex | undefined,
              value: tx.value !== undefined ? BigInt(tx.value) : undefined,
            });
          }
          default: {
            const request = publicClient.request as (args: {
              method: string;
              params: JsonValue[];
            }) => Promise<unknown>;
            return request({ method, params });
          }
        }
      },
    );

    await page.addInitScript((walletName: string) => {
      const bridge = window as unknown as {
        __maturaMockRpc: (method: string, params: unknown[]) => Promise<unknown>;
        ethereum?: unknown;
      };
      const provider = {
        isMetaMask: true,
        request: (args: { method: string; params?: unknown[] }) =>
          bridge.__maturaMockRpc(args.method, args.params ?? []),
        on: () => undefined,
        removeListener: () => undefined,
        removeAllListeners: () => undefined,
      };
      bridge.ethereum = provider;
      const info = {
        uuid: crypto.randomUUID(),
        name: walletName,
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        rdns: "xyz.matura.e2e",
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: Object.freeze({ info, provider }),
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    }, WALLET_NAME);

    await use(page);
  },
});

export { expect } from "@playwright/test";
export const MOCK_WALLET_NAME = WALLET_NAME;
