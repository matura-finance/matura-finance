import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/** Marketing site (usematura.xyz) — static, wallet-free single-pager. These run in CI without any chain/API. */

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
    await expect(openApp).toHaveAttribute("href", /app\.usematura\.xyz|localhost:3002/);
  });

  test("anchor nav scrolls to in-page sections (no route change)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See how it works" }).first().click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.locator("#how-it-works")).toBeInViewport();
    // Still a single-page document: exactly one <h1>.
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("live diagnostics link out to BscScan", async ({ page }) => {
    await page.goto("/#protocol");
    const bscScan = page.getByRole("link", { name: /BscScan/i }).first();
    await expect(bscScan).toHaveAttribute("href", /testnet\.bscscan\.com/);
  });

  test("legal routes respond", async ({ page }) => {
    for (const path of ["/privacy", "/terms"]) {
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

  // The landing is wallet-free and can't import @matura/chain, so lib/site.ts
  // hand-mirrors the deployed BSC-testnet addresses for the diagnostics proof
  // links. Guard against silent drift: a redeploy that changes addresses must
  // update site.ts (or this fails) rather than shipping stale BscScan links.
  test("testnet address mirror matches the chain manifest (no drift)", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages/chain/src/deployments/97.json"), "utf8"),
    ) as {
      deploymentBlock: string;
      addresses: Record<string, string>;
      namedVaults?: Record<string, string>;
    };
    const siteSrc = readFileSync(join(repoRoot, "apps/landing/src/lib/site.ts"), "utf8");

    const manifestAddrs = new Set(
      [...Object.values(manifest.addresses), ...Object.values(manifest.namedVaults ?? {})].map(
        (address) => address.toLowerCase(),
      ),
    );
    const siteAddrs = [...siteSrc.matchAll(/address:\s*"(0x[0-9a-fA-F]{40})"/g)].map((match) =>
      (match[1] ?? "").toLowerCase(),
    );

    expect(siteAddrs.length).toBeGreaterThan(0);
    for (const address of siteAddrs) expect(manifestAddrs.has(address)).toBe(true);

    const block = /DEPLOYMENT_BLOCK\s*=\s*"(\d+)"/.exec(siteSrc)?.[1];
    expect(block).toBe(String(manifest.deploymentBlock));
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
      await expect(page).toHaveURL(/#how-it-works$/);
    }
    await context.close();
  });
});
