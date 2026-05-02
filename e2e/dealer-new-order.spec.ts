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

    // Click → advances to Step 2 (real picker now, not placeholder)
    await cont.click();
    await expect(page.getByText(/step 2 of 3/i)).toBeVisible();
    await expect(page.getByText(/Products & add-ons/i)).toBeVisible();
    // Step 2 has 3 category tabs (Mattress / Bed frame / Sofa) inside the
    // dialog. Match by content rather than exact name to avoid icon-span
    // accessible-name quirks.
    const dialog = page.getByRole("dialog", { name: /New order/i });
    await expect(dialog.getByRole("button", { name: /Mattress/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Bed frame/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^.*Sofa$/ })).toBeVisible();
  });

  test("Step 2: picking a mattress + addon enables Continue", async ({ page }) => {
    await login(page, "dealer@carres.com", "111");
    await page.getByRole("link", { name: /\+ New order/i }).first().click();

    // Walk through Step 1 quickly
    await expect(page.getByRole("combobox").first()).toBeEnabled({ timeout: 10_000 });
    await page.locator("select").nth(0).selectOption({ index: 1 });
    await page.locator("select").nth(1).selectOption({ index: 1 });
    await page.getByPlaceholder(/Tan Mei Ling/i).fill("E2E Step2");
    await page.getByPlaceholder("012-3456789").fill("012-1234567");
    await page.getByPlaceholder(/Street, postcode/i).fill("123 Jalan E2E, KL");
    await page.getByPlaceholder("Name").fill("E2E Spouse");
    await page.getByPlaceholder("012-9988776").fill("012-7654321");
    await page.locator("select").nth(2).selectOption("Spouse");
    await page.locator('input[type="date"]').fill("2026-06-15");
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText(/Products & add-ons/i)).toBeVisible({ timeout: 10_000 });

    // Continue is disabled until at least one line is added
    await expect(page.getByRole("button", { name: /Continue/i })).toBeDisabled();

    // Open the first mattress model (already on the Mattress tab by default)
    const firstModelToggle = page
      .locator("button")
      .filter({ hasText: /\d+ variants?/ })
      .first();
    await firstModelToggle.click();

    // Pick the first size variant in that model's configurator (the inline
    // size <select> is the one that just appeared after toggling)
    const sizeSelect = page
      .locator('select[aria-label="Size"], select')
      .filter({ hasText: /pick size/i })
      .first();
    // Fallback to selecting whatever the first non-placeholder option is
    const allSelects = page.locator("select");
    const lastSelect = allSelects.nth(await allSelects.count() - 1);
    await sizeSelect.or(lastSelect).selectOption({ index: 1 });

    // Click the inline + Add button
    await page.getByRole("button", { name: /\+ Add/ }).first().click();

    // Order summary now has at least one line; Continue is enabled
    await expect(page.getByText(/^E2E Step2$|Order summary/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/i })).toBeEnabled();
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
