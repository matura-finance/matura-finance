import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DeploymentManifest, zeroManifest } from "../manifest.js";

// Resolve the committed manifests via fs + JSON.parse (mirroring
// `scripts/gen-deployments.ts`), so this guard reads the exact bytes the codegen
// consumes rather than a re-serialized import.
const here = dirname(fileURLToPath(import.meta.url));
const deploymentsDir = join(here, "../deployments");

function readCommittedManifest(chainId: number): unknown {
  return JSON.parse(readFileSync(join(deploymentsDir, `${String(chainId)}.json`), "utf8"));
}

describe("committed deployment manifests", () => {
  it("31337.json parses against the DeploymentManifest schema", () => {
    expect(() => DeploymentManifest.parse(readCommittedManifest(31337))).not.toThrow();
  });

  it("97.json parses against the DeploymentManifest schema", () => {
    expect(() => DeploymentManifest.parse(readCommittedManifest(97))).not.toThrow();
  });

  it("31337.json deep-equals zeroManifest(31337)", () => {
    expect(DeploymentManifest.parse(readCommittedManifest(31337))).toEqual(zeroManifest(31337));
  });

  it("97.json is a deployed manifest (BSC Testnet is live — not the zero manifest)", () => {
    expect(DeploymentManifest.parse(readCommittedManifest(97))).not.toEqual(zeroManifest(97));
  });
});

describe("DeploymentManifest rejects malformed committed shapes", () => {
  it("rejects a bad address in namedVaults", () => {
    const manifest: Record<string, unknown> = { ...zeroManifest(97) };
    manifest.namedVaults = { stableVault: "0xnope", flexVault: "0xnope" };
    expect(() => DeploymentManifest.parse(manifest)).toThrow();
  });

  it("rejects a manifest missing the sources field", () => {
    const manifest: Record<string, unknown> = { ...zeroManifest(97) };
    delete manifest.sources;
    expect(() => DeploymentManifest.parse(manifest)).toThrow();
  });
});
