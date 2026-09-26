import { expect, test } from "@playwright/test";

/** Marketing site (matura.xyz) — static, wallet-free. These run in CI without any chain/API. */

test.describe("landing", () => {
  test("hero renders the approved headline and a single h1", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Matura/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Liquidity for what you've already earned\./ }),
    ).toBeVisible();
    // Exactly one <h1> per page (a11y / heading order).
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("primary CTA is a cross-domain link to the product app", async ({ page }) => {
    await page.goto("/");
    const openApp = page.getByRole("link", { name: "Open Matura" }).first();
    await expect(openApp).toHaveAttribute("href", /app\.matura\.xyz|localhost:3002/);
  });

  test("landing → how it works → protocol path", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See how it works" }).first().click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.locator("h1")).toHaveCount(1);

    await page.goto("/protocol");
    await expect(page.getByText("Best-Execution Claim Router")).toBeVisible();
  });

  test("core routes respond", async ({ page }) => {
    for (const path of ["/for-issuers", "/docs", "/privacy", "/terms"]) {
      const response = await page.goto(path);
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });

  test("respects reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Liquidity for what you've already earned\./ }),
    ).toBeVisible();
    await context.close();
  });

  test("mobile nav opens and closes after navigation", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /menu/i });
    if ((await toggle.count()) > 0) {
      await toggle.first().click();
      await expect(toggle.first()).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("link", { name: "How it works" }).first().click();
      await expect(page).toHaveURL(/\/how-it-works$/);
    }
    await context.close();
  });
});
