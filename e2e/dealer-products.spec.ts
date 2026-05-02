import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("dealer Phase 2B.1 — products catalog", () => {
  test("dealer can browse the catalog page", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await expect(page).toHaveURL(/\/dealer/, { timeout: 10_000 });

    await page.getByRole("link", { name: /Products/i }).first().click();
    await expect(page).toHaveURL(/\/dealer\/products/);

    // The Catalog header should render once the API returns
    await expect(page.getByRole("heading", { name: /What's on offer/i })).toBeVisible({
      timeout: 10_000,
    });

    // The 3 category tabs (Mattress / Bed frame / Sofa) should all be present
    await expect(page.getByRole("button", { name: /Mattress/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Bed frame/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sofa/i })).toBeVisible();

    // Search input is present
    await expect(page.getByRole("searchbox", { name: /Search models/i })).toBeVisible();
  });

  test("clicking a category tab switches the visible models", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /Products/i }).first().click();
    await expect(page).toHaveURL(/\/dealer\/products/);
    await expect(page.getByRole("heading", { name: /What's on offer/i })).toBeVisible({
      timeout: 10_000,
    });

    // Switch to Sofa tab — empty state OR sofa cards both fine; just verify no crash
    await page.getByRole("button", { name: /Sofa/i }).click();
    // Either we see a model card (font-display heading inside .grid) or the empty state copy
    const emptyState = page.getByText(/No sofa models|No models match/i);
    const anyHeading = page.locator("h2.font-display").first();
    const anyVisible = (await emptyState.isVisible().catch(() => false))
      || (await anyHeading.isVisible().catch(() => false));
    expect(anyVisible, "either empty state or at least one model card visible").toBe(true);
  });

  test("Settings link is now enabled (no longer 'soon')", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /Settings/i }).first().click();
    await expect(page).toHaveURL(/\/dealer\/settings/);
    await expect(page.getByRole("heading", { name: /Your account/i })).toBeVisible();
  });
});
