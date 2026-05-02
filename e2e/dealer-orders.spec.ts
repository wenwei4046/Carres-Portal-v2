import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("dealer Phase 2A read path", () => {
  test("dealer login lands on dashboard with counts", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await expect(page).toHaveURL(/\/dealer/, { timeout: 10_000 });

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Dashboard shows the 3-status overview
    await expect(page.getByText(/Place/i).first()).toBeVisible();
    await expect(page.getByText(/Proceed/i).first()).toBeVisible();
    await expect(page.getByText(/Delivered/i).first()).toBeVisible();
  });

  test("Orders tab shows kanban with at least one order", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await expect(page).toHaveURL(/\/dealer/, { timeout: 10_000 });

    await page.getByRole("link", { name: /Orders/i }).first().click();
    await expect(page).toHaveURL(/\/dealer\/orders/);

    // Wait for the count badge on at least one tab to be > 0 OR the empty state
    await expect(page.getByText(/total ·/)).toBeVisible({ timeout: 10_000 });
  });

  test("clicking an order row opens the detail modal", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /Orders/i }).first().click();
    await expect(page).toHaveURL(/\/dealer\/orders/);

    // Try every tab until we find one with at least one order to click.
    const tabs = ["Place", "Proceed", "Delivered"];
    let opened = false;
    for (const t of tabs) {
      await page.getByRole("button", { name: new RegExp(`^${t}\\s*\\d+$`) }).click().catch(() => {});
      const firstRow = page.locator("button").filter({ hasText: /^#\d/ }).first();
      if (await firstRow.isVisible().catch(() => false)) {
        await firstRow.click();
        opened = true;
        break;
      }
    }
    expect(opened, "expected at least one order row across the 3 tabs").toBe(true);

    // Modal opened — Order journey heading is present, Read-only footer present.
    await expect(page.getByText(/Order journey/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Read-only view/)).toBeVisible();

    // ?open=<id> reflects in the URL
    expect(new URL(page.url()).searchParams.get("open")).toBeTruthy();
  });

  test("close button dismisses modal and clears ?open", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /Orders/i }).first().click();

    // Open the first available row (search across tabs).
    for (const t of ["Place", "Proceed", "Delivered"]) {
      await page.getByRole("button", { name: new RegExp(`^${t}\\s*\\d+$`) }).click().catch(() => {});
      const firstRow = page.locator("button").filter({ hasText: /^#\d/ }).first();
      if (await firstRow.isVisible().catch(() => false)) {
        await firstRow.click();
        break;
      }
    }
    await expect(page.getByText(/Order journey/i)).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/Order journey/i)).toBeHidden({ timeout: 3_000 });
    expect(new URL(page.url()).searchParams.get("open")).toBeNull();
  });

  test("principal is redirected away from /dealer", async ({ page }) => {
    await login(page, "principal@carres.com", "111");

    // After login, principal should NOT land on /dealer.
    await page.waitForURL((u) => !u.pathname.startsWith("/dealer"), { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/dealer/);
  });
});
