import { bscTestnet as canonicalBscTestnet } from "@matura/chain/chains";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bscTestnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { cookieStorage, createStorage, http } from "wagmi";

import { env } from "./env";

// The connection stack (Reown's bscTestnet) and the signing/switch stack (@matura/chain's
// bscTestnet, the canonical source alongside manifests/ABIs) reference independent chain objects.
// They must agree on the chain id — assert at boot so any drift fails loudly instead of surfacing
// as subtle wrong-network bugs. (Widened to `number` because today both are the same literal, which
// the type-checker would otherwise flag as an always-false comparison.)
if ((bscTestnet.id as number) !== (canonicalBscTestnet.id as number)) {
  throw new Error(
    `Chain id mismatch: Reown bscTestnet (${String(bscTestnet.id)}) != @matura/chain bscTestnet (${String(canonicalBscTestnet.id)})`,
  );
}

/**
 * Reown AppKit + wagmi wiring for the product app. Wallet/network infrastructure
 * lives only in this app (the landing site stays wallet-free).
 *
 * A single `WagmiAdapter` instance is the source of truth for the wagmi config,
 * shared by the server (SSR cookie hydration in the root layout) and the client
 * (the provider tree). `ssr: true` + cookie storage lets the server serialize
 * wallet state into the initial render, avoiding a hydration mismatch.
 *
 * The browser transport reads the public `NEXT_PUBLIC_RPC_URL` when set; when
 * unset, `http(undefined)` falls back to the network's public seed RPC. A keyed
 * RPC must never be exposed as `NEXT_PUBLIC_*`.
 *
 * Reown's `bscTestnet` (chain id 97) is the same network the manifest targets;
 * we only override its transport so reads honour `NEXT_PUBLIC_RPC_URL`.
 */
export const projectId = env.walletConnectProjectId;

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [bscTestnet];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [bscTestnet.id]: http(env.rpcUrl),
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
