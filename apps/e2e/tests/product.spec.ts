import { expect, test } from "@playwright/test";

/**
 * Product happy paths (app.matura.xyz). GATED behind `E2E_STACK=1` — requires a seeded
 * local hardhat node + the local API + a running indexer worker, AND a mock EIP-1193
 * provider injected into the page (via `page.addInitScript` announcing an EIP-6963
 * provider backed by the seeded beneficiary key) so connect + signing are deterministic
 * and popup-free. That injection is a documented follow-up — see README. The connected
 * account must be the seeded claim beneficiary or optimize returns NOT_OWNED_BY_WALLET.
 *
 * Run (once the injection + stack are in place): `E2E_STACK=1 pnpm --filter @matura/e2e test:e2e`
 */

async function connectAndSignIn(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Connect wallet" }).click();
  // The mock connector shows up in the EIP-6963 list.
  await page
    .getByRole("button", { name: /Mock|E2E/i })
    .first()
    .click();
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
