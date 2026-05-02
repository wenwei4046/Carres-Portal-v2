import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dealer/, { timeout: 10_000 });
}

test.describe("dealer Phase 2B.2 — wizard shell + Step 1", () => {
  test("'+ New order' CTA on Dashboard opens wizard modal at Step 1", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");

    // Dashboard CTA visible + clickable
    const cta = page.getByRole("link", { name: /\+ New order/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    // Modal opens; URL has ?new=1
    await expect(page).toHaveURL(/[?&]new=1/);
    await expect(page.getByRole("dialog", { name: /New order/i })).toBeVisible();
    await expect(page.getByText(/Customer & delivery/i)).toBeVisible();
    await expect(page.getByText(/step 1 of 3/i)).toBeVisible();

    // Continue is disabled at start (no fields filled)
    const cont = page.getByRole("button", { name: /Continue/i });
    await expect(cont).toBeDisabled();
  });

  test("Continue enables once Step 1 is valid", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await expect(page.getByText(/Customer & delivery/i)).toBeVisible();

    // Wait for outlets/SPs to load
    await expect(page.getByRole("combobox").first()).toBeEnabled({ timeout: 10_000 });

    // Pick first outlet, then first SP
    const outletSel = page.locator("select").nth(0);
    const spSel = page.locator("select").nth(1);
    await outletSel.selectOption({ index: 1 });
    await spSel.selectOption({ index: 1 });

    // Customer fields
    await page.getByPlaceholder(/Tan Mei Ling/i).fill("E2E Tester");
    await page.getByPlaceholder("012-3456789").fill("012-1234567");
    await page.getByPlaceholder(/Street, postcode/i).fill("123 Jalan E2E, 50000 Kuala Lumpur");

    // Emergency contact
    await page.getByPlaceholder("Name").fill("E2E Spouse");
    await page.getByPlaceholder("012-9988776").fill("012-7654321");
    await page.locator("select").nth(2).selectOption("Spouse"); // relationship select

    // Delivery date
    await page.locator('input[type="date"]').fill("2026-06-15");

    // Continue should now be enabled
    const cont = page.getByRole("button", { name: /Continue/i });
    await expect(cont).toBeEnabled();

    // Click → advances to Step 2 placeholder
    await cont.click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible();
    await expect(page.getByText(/Step 2 ships in Phase 2B.3/i)).toBeVisible();
  });

  test("draft persists across X-close + reopen via sessionStorage", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");

    // Open modal, type a name
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await expect(page.getByText(/Customer & delivery/i)).toBeVisible();
    await page.getByPlaceholder(/Tan Mei Ling/i).fill("Draft Persister");

    // Soft-close via X header button (NOT footer Cancel) — draft kept
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(/Customer & delivery/i)).not.toBeVisible();
    await expect(page).not.toHaveURL(/[?&]new=1/);

    // Reopen wizard from Dashboard — draft restored
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await expect(page.getByText(/Customer & delivery/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Tan Mei Ling/i)).toHaveValue("Draft Persister");
  });

  test("draft survives a full page reload", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await page.getByPlaceholder(/Tan Mei Ling/i).fill("Reload Survivor");

    // F5-equivalent — sessionStorage survives reloads in same tab
    await page.reload();

    // After reload the modal isn't auto-open (URL still has ?new=1 actually,
    // since reload preserves URL). So we should land back in the wizard.
    await expect(page.getByText(/Customer & delivery/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/Tan Mei Ling/i)).toHaveValue("Reload Survivor");
  });

  test("Cancel button discards draft + closes modal", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await page.getByPlaceholder(/Tan Mei Ling/i).fill("Will Be Discarded");

    // Click Cancel (footer button)
    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(page.getByText(/Customer & delivery/i)).not.toBeVisible();
    await expect(page).not.toHaveURL(/[?&]new=1/);

    // Reopen → field is blank (draft was discarded)
    await page.getByRole("link", { name: /\+ New order/i }).first().click();
    await expect(page.getByPlaceholder(/Tan Mei Ling/i)).toHaveValue("");
  });
});
