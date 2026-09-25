import { rmSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// LOCAL-ONLY reset. Operates purely on local artifacts — the `matura-local` Ignition journal and
// the committed 31337 manifest — so it is structurally incapable of touching testnet/mainnet state
// (there is no network connection). Run this, then restart `hardhat node`, then `pnpm demo:local`.
// This is a plain Node script (no `.ts` module imports) so it runs via bare `node` even with the
// local chain down — which is exactly when you reset.

const HERE = dirname(fileURLToPath(import.meta.url));
const JOURNAL_DIR = join(HERE, "../ignition/deployments/matura-local");
const MANIFEST_PATH = join(HERE, "../../chain/src/deployments/31337.json");
const ZERO = "0x0000000000000000000000000000000000000000";

const zeroManifest = {
  chainId: 31337,
  deploymentBlock: "0",
  abiBuildId: "",
  addresses: {
    mockUsdt: ZERO,
    issuerRegistry: ZERO,
    claimRegistry: ZERO,
    vaultRegistry: ZERO,
    router: ZERO,
    settlementManager: ZERO,
  },
  namedVaults: { stableVault: ZERO, flexVault: ZERO },
  sources: { payroll: ZERO, freelance: ZERO, stream: ZERO },
};

rmSync(JOURNAL_DIR, { recursive: true, force: true });
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(zeroManifest, null, 2) + "\n", "utf8");
execFileSync("pnpm", ["--filter", "@matura/chain", "gen:deployments"], { stdio: "inherit" });

console.log(
  "Local demo reset: cleared the matura-local Ignition journal and zero-seeded 31337.json.\n" +
    "Restart `hardhat node` (fresh chain), then run `pnpm demo:local`.",
);
