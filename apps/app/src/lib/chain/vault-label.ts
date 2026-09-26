"use client";

import { bscTestnet } from "@matura/chain/chains";
import { getNamedVaults, isDeployed } from "@matura/chain/deployments";
import { useMemo } from "react";

import { shortenAddress } from "./format";

/**
 * Single source of truth for address→vault-name resolution, shared by the vaults list and
 * the route breakdown (previously duplicated and drifted). Returns "Stable Vault"/"Flex
 * Vault" for the named manifest vaults, else a shortened address label.
 */
export function useVaultLabel(): (address: string) => string {
  return useMemo(() => {
    const named = isDeployed(bscTestnet.id) ? getNamedVaults(bscTestnet.id) : null;
    return (address: string): string => {
      if (named === null) return `Vault ${shortenAddress(address)}`;
      const lower = address.toLowerCase();
      if (named.stableVault.toLowerCase() === lower) return "Stable Vault";
      if (named.flexVault.toLowerCase() === lower) return "Flex Vault";
      return `Vault ${shortenAddress(address)}`;
    };
  }, []);
}
