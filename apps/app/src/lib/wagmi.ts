import { bscTestnet } from "@matura/chain/chains";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";

/**
 * Builds the wagmi config for the product app. Wallet/network infrastructure
 * lives only in this app.
 *
 * `ssr: true` + cookie storage lets the server serialize wallet state into the
 * initial render (see `cookieToInitialState` in the root layout), avoiding a
 * hydration mismatch.
 *
 * The browser transport reads the public `NEXT_PUBLIC_RPC_URL` when set; when
 * unset, `http(undefined)` falls back to the chain's public seed RPC. A keyed
 * RPC must never be exposed as `NEXT_PUBLIC_*`.
 */
export function getConfig() {
  return createConfig({
    chains: [bscTestnet],
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [bscTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
