import { defineConfig, devices } from "@playwright/test";

/**
 * Matura e2e harness.
 *
 * The **landing** project always runs — the marketing site is static and needs no
 * chain/API. The **product** project runs only when `E2E_STACK=1` is set, because the
 * product happy-path requires a seeded local hardhat node + the local API + a running
 * indexer worker. Signing is handled by the `support/mock-wallet` fixture (a Node-side viem
 * signer exposed to an in-page EIP-6963 provider) — no wallet code ships in the app. See README.
 */
const LANDING_URL = process.env.E2E_LANDING_URL ?? "http://localhost:3001";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3002";
const withStack = process.env.E2E_STACK === "1";
const isCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: "list",
  use: { trace: "on-first-retry" },
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
  webServer: [
    {
      command: "pnpm --filter @matura/landing build && pnpm --filter @matura/landing start",
      url: LANDING_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
    ...(withStack
      ? [
          {
            command: "pnpm --filter @matura/app build && pnpm --filter @matura/app start",
            url: APP_URL,
            reuseExistingServer: !isCI,
            timeout: 180_000,
          },
        ]
      : []),
  ],
});
