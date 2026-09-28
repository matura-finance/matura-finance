import { defineConfig, devices } from "@playwright/test";

/**
 * Matura REMOTE smoke harness — points Playwright at ALREADY-DEPLOYED origins.
 *
 * Unlike `playwright.config.ts` (which boots local servers via `webServer`), this config has
 * **no `webServer` block**: it never builds or starts anything. It drives the live
 * `matura.xyz` / `app.matura.xyz` deployments (Track B, step 10) over their public HTTPS URLs.
 *
 * Both `E2E_LANDING_URL` and `E2E_APP_URL` are **required** and must be `https://` — we fail fast
 * at config load rather than silently smoking `http://localhost` defaults against production.
 *
 * The **landing** project always runs (static, wallet-free). The **product** project runs only
 * when `E2E_STACK=1` — the product happy-path signs + executes on-chain via the `mock-wallet`
 * fixture (a Node-side viem signer, key `E2E_PRIVATE_KEY` = the seeded claim beneficiary), so it is
 * opt-in even against remote origins.
 *
 * Run: `E2E_LANDING_URL=https://matura.xyz E2E_APP_URL=https://app.matura.xyz \
 *        pnpm --filter @matura/e2e test:e2e:remote`
 */

/** Require an env var that must be a set, `https://` URL — throw at load so the run aborts fast. */
function requireHttpsUrl(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`[playwright.remote] ${name} is required (a public https:// origin to smoke).`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[playwright.remote] ${name} is not a valid URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `[playwright.remote] ${name} must be https:// (got ${parsed.protocol}//): ${value}`,
    );
  }
  return value;
}

const LANDING_URL = requireHttpsUrl("E2E_LANDING_URL");
const APP_URL = requireHttpsUrl("E2E_APP_URL");
const withStack = process.env.E2E_STACK === "1";
const isCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: "list",
  use: { trace: "on-first-retry" },
  // NO `webServer`: remote origins are already deployed; this harness must never boot servers.
  projects: [
    {
      name: "landing",
      testMatch: /landing\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: LANDING_URL },
    },
    ...(withStack
      ? [
          {
            name: "product",
            testMatch: /product\.spec\.ts$/,
            use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
          },
        ]
      : []),
  ],
});
