import { describe, expect, it } from "vitest";

import { DeploymentManifest, zeroManifest } from "../manifest.js";
import { ZERO_ADDRESS } from "../addresses.js";

const VALID_ADDRESS = "0x1234567890abcdefABCDEF1234567890abcdef12";

function validManifest() {
  return {
    chainId: 97,
    deploymentBlock: "48211900",
    abiBuildId: "sha256:1a2b",
    addresses: {
      mockUsdt: VALID_ADDRESS,
      issuerRegistry: VALID_ADDRESS,
      claimRegistry: VALID_ADDRESS,
      vaultRegistry: VALID_ADDRESS,
      router: VALID_ADDRESS,
      settlementManager: VALID_ADDRESS,
    },
    namedVaults: {
      stableVault: VALID_ADDRESS,
      flexVault: VALID_ADDRESS,
    },
    sources: {
      payroll: VALID_ADDRESS,
      freelance: VALID_ADDRESS,
      stream: VALID_ADDRESS,
    },
  };
}

describe("DeploymentManifest", () => {
  it("parses a valid manifest", () => {
    const manifest = validManifest();
    expect(DeploymentManifest.parse(manifest)).toEqual(manifest);
  });

  it("accepts the zero-seed manifest for any chain id", () => {
    expect(() => DeploymentManifest.parse(zeroManifest(31337))).not.toThrow();
    expect(() => DeploymentManifest.parse(zeroManifest(97))).not.toThrow();
  });

  it("rejects a malformed address in a sub-map", () => {
    const manifest = validManifest();
    manifest.namedVaults.stableVault = "0x1234";
    expect(() => DeploymentManifest.parse(manifest)).toThrow();
  });

  it("rejects a non-numeric deploymentBlock", () => {
    const manifest = { ...validManifest(), deploymentBlock: "0x1a2b" };
    expect(() => DeploymentManifest.parse(manifest)).toThrow();
  });

  it("rejects a missing top-level field", () => {
    const manifest: Record<string, unknown> = validManifest();
    delete manifest.sources;
    expect(() => DeploymentManifest.parse(manifest)).toThrow();
  });

  it("allows an empty abiBuildId (advisory, never refined)", () => {
    const manifest = { ...validManifest(), abiBuildId: "" };
    expect(() => DeploymentManifest.parse(manifest)).not.toThrow();
  });
});

describe("zeroManifest", () => {
  it("seeds every address with the zero address", () => {
    const manifest = zeroManifest(31337);
    expect(manifest.chainId).toBe(31337);
    expect(manifest.deploymentBlock).toBe("0");
    expect(manifest.abiBuildId).toBe("");
    for (const address of Object.values(manifest.addresses)) {
      expect(address).toBe(ZERO_ADDRESS);
    }
    expect(manifest.namedVaults.stableVault).toBe(ZERO_ADDRESS);
    expect(manifest.sources.payroll).toBe(ZERO_ADDRESS);
  });
});
