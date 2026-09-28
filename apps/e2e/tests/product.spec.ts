import { expect, MOCK_WALLET_NAME, test } from "../support/mock-wallet";

/**
 * Product happy paths (app.usematura.xyz). GATED behind `E2E_STACK=1` — requires a seeded
 * local hardhat node + the local API + a running indexer worker. Signing is handled by the
 * `mock-wallet` fixture: a Node-side viem signer exposed to an in-page EIP-6963 provider,
 * so connect + SIWE + EIP-712 run deterministically and popup-free with NO wallet code in
 * the app bundle. The signer key's address MUST be the seeded claim beneficiary (set
 * `E2E_PRIVATE_KEY`) or optimize returns NOT_OWNED_BY_WALLET.
 *
 * Run: `E2E_STACK=1 pnpm --filter @matura/e2e test:e2e`
 */

async function connectAndSignIn(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: MOCK_WALLET_NAME }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("product happy path", () => {
  test("Request A — a partial slice of a single payroll claim", async ({ page }) => {
    await page.goto("/request");
    await connectAndSignIn(page);

    await page.getByLabel(/Amount needed/i).fill("4800");
    await page.getByRole("button", { name: "Find my best route" }).click();

    await expect(page.getByRole("heading", { name: "Your best executable route" })).toBeVisible();
    // A single leg + a "You retain" remainder proves partial slicing.
    await expect(page.getByText("You retain")).toBeVisible();

    await page.getByRole("button", { name: "Confirm and receive liquidity" }).click();
    await expect(page.getByText("Liquidity received")).toBeVisible({ timeout: 120_000 });
  });

  test("Request B — combines at least two claims", async ({ page }) => {
    await page.goto("/request");
    await connectAndSignIn(page);

    await page.getByLabel(/Amount needed/i).fill("24000");
    await page.getByRole("button", { name: "Find my best route" }).click();

    await expect(page.getByRole("heading", { name: "Your best executable route" })).toBeVisible();
    // ≥2 leg rows in the breakdown table (header row + 2 data rows).
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);

    await page.getByRole("button", { name: "Confirm and receive liquidity" }).click();
    await expect(page.getByText("Liquidity received")).toBeVisible({ timeout: 120_000 });

    // The execution shows up on the activity timeline.
    await page.goto("/activity");
    await expect(page.getByText(/Route|Executed/i).first()).toBeVisible();
  });
});
