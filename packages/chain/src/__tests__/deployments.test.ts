import { describe, expect, it } from "vitest";

import {
  getManifest,
  getDeployment,
  isDeployed,
  getNamedVaults,
  getSources,
  getDeploymentBlock,
} from "../deployments.js";
import { ZERO_ADDRESS } from "../addresses.js";
import { BSC_TESTNET_CHAIN_ID, LOCAL_CHAIN_ID } from "../chains.js";

const UNKNOWN_CHAIN_ID = 999999;

describe("getManifest", () => {
  it("returns the committed manifest for a seeded chain", () => {
    const manifest = getManifest(BSC_TESTNET_CHAIN_ID);
    expect(manifest.chainId).toBe(BSC_TESTNET_CHAIN_ID);
  });

  it("cross-checks that the manifest chainId matches the lookup key", () => {
    expect(getManifest(LOCAL_CHAIN_ID).chainId).toBe(LOCAL_CHAIN_ID);
  });

  it("throws for a chain with no manifest", () => {
    expect(() => getManifest(UNKNOWN_CHAIN_ID)).toThrow();
  });
});

describe("isDeployed", () => {
  it("is true for a deployed chain (BSC Testnet is live)", () => {
    expect(isDeployed(BSC_TESTNET_CHAIN_ID)).toBe(true);
  });

  it("is false for a zero-seeded chain", () => {
    expect(isDeployed(LOCAL_CHAIN_ID)).toBe(false);
  });

  it("is false for an unknown chain", () => {
    expect(isDeployed(UNKNOWN_CHAIN_ID)).toBe(false);
  });
});

describe("getDeployment", () => {
  it("returns the deployment for a deployed chain", () => {
    expect(() => getDeployment(BSC_TESTNET_CHAIN_ID)).not.toThrow();
  });

  it("throws for a zero-seeded chain (not yet deployed)", () => {
    expect(() => getDeployment(LOCAL_CHAIN_ID)).toThrow(/zero-seeded/);
  });

  it("throws for a chain with no manifest", () => {
    expect(() => getDeployment(UNKNOWN_CHAIN_ID)).toThrow();
  });
});

describe("getNamedVaults / getSources", () => {
  it("resolve zero-seed sub-maps without enforcing the deployed check", () => {
    expect(getNamedVaults(LOCAL_CHAIN_ID).stableVault).toBe(ZERO_ADDRESS);
    expect(getSources(LOCAL_CHAIN_ID).payroll).toBe(ZERO_ADDRESS);
  });

  it("resolve real addresses for a deployed chain", () => {
    expect(getNamedVaults(BSC_TESTNET_CHAIN_ID).stableVault).not.toBe(ZERO_ADDRESS);
    expect(getSources(BSC_TESTNET_CHAIN_ID).payroll).not.toBe(ZERO_ADDRESS);
  });
});

describe("getDeploymentBlock", () => {
  it("returns the zero-seed block as a bigint", () => {
    expect(getDeploymentBlock(LOCAL_CHAIN_ID)).toBe(0n);
  });

  it("returns a positive deployment block for a deployed chain", () => {
    expect(getDeploymentBlock(BSC_TESTNET_CHAIN_ID)).toBeGreaterThan(0n);
  });

  it("throws for a chain with no manifest", () => {
    expect(() => getDeploymentBlock(UNKNOWN_CHAIN_ID)).toThrow();
  });
});
