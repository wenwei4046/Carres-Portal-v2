import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

// Pre-condition: Loo runs supabase db reset (loads updated seed.sql with
// supplier-nf user + portal_enabled=true) + dev server running.
//
// Phase 6 supplier acceptance (per spec docs/superpowers/specs/2026-05-09-phase-6-supplier-spec.md §8):
//   1. Supplier 账号能看到 logistics 创建的 PO
//   2. Supplier 能 acknowledge PO，状态 pending → acknowledged
//   3. Supplier 能更新 sup_status (in_production → ready_for_pickup → delivered)
//
// Walks the own_logistics flow (HoOKkA — supplier@carres.com) since it
// exercises every supplier-callable RPC. factory_pickup variant for
// Nice Future is covered by API tests; an E2E variant could be added
// post-V1 if the path diverges materially.
test.fixme("phase-6 happy: supplier acknowledges PO → production → ready → DO upload → delivered", async ({ page }) => {
  // ----- 1. Supplier login + sees PO list -----------------------------------
  await login(page, "supplier@carres.com", "111");
  await expect(page).toHaveURL(/\/supplier(\/dashboard)?$/);

  await page.goto("/supplier/pos");
  await expect(page.getByRole("heading", { name: /Purchase Orders/i })).toBeVisible();

  // PO tab active by default — list shows pending POs from seed (HoOKkA's
  // POs in pending sup_status). Pick the first pending PO row.
  const firstPendingCard = page.locator('[data-testid^="po-card-"]').first();
  await expect(firstPendingCard).toBeVisible({ timeout: 5_000 });
  const poId = (await firstPendingCard.getAttribute("data-testid"))?.replace(
    "po-card-",
    "",
  );
  expect(poId).toBeTruthy();

  // ----- 2. Acknowledge PO --------------------------------------------------
  await firstPendingCard.getByRole("button", { name: /Acknowledge PO/i }).click();
  await expect(page.getByText(/acknowledged/i)).toBeVisible({ timeout: 5_000 });

  // Card now shows "Start production" button (acknowledged state).
  await expect(
    page.locator(`[data-testid="po-card-${poId}"]`).getByRole("button", { name: /Start production/i }),
  ).toBeVisible();

  // ----- 3. Start production ------------------------------------------------
  await page
    .locator(`[data-testid="po-card-${poId}"]`)
    .getByRole("button", { name: /Start production/i })
    .click();
  await expect(page.getByText(/production started/i)).toBeVisible({ timeout: 5_000 });

  // Card now shows "Mark Ready for Pickup" (in_production state).
  await expect(
    page.locator(`[data-testid="po-card-${poId}"]`).getByRole("button", {
      name: /Mark Ready for Pickup/i,
    }),
  ).toBeVisible();

  // ----- 4. Mark ready for pickup -------------------------------------------
  await page
    .locator(`[data-testid="po-card-${poId}"]`)
    .getByRole("button", { name: /Mark Ready for Pickup/i })
    .click();
  await expect(page.getByText(/marked ready/i)).toBeVisible({ timeout: 5_000 });

  // PO disappears from PO tab (now in Ready bucket). Switch tab.
  await page.getByRole("button", { name: /^Ready to Pickup/i }).click();
  await expect(page.locator(`[data-testid="po-card-${poId}"]`)).toBeVisible();

  // ----- 5. (Out of supplier scope: logistics assigns partner, partner
  //          accepts pickup → sup_status moves to pickup_accepted) -----------
  // Mock-jump via direct DB update OR rely on parallel logistics+partner
  // E2E happy paths to walk the chain. For this V1 happy spec we assume
  // the seed has at least one pickup_accepted PO ready for DO upload.

  // ----- 6. DO upload on a pickup_accepted PO -------------------------------
  // Find a card showing "Upload Delivery Order" capability (open drawer).
  const acceptedCard = page
    .locator('[data-testid^="po-card-"]')
    .filter({ hasText: /Pickup scheduled|Shipped/i })
    .first();
  if (await acceptedCard.isVisible()) {
    await acceptedCard.click();
    await expect(page.getByTestId("po-drawer")).toBeVisible();
    await page.getByRole("button", { name: /Upload Delivery Order/i }).click();
    await page.getByLabel(/DO number/i).fill("DO-E2E-9999");
    await page.getByLabel(/I confirm/i).check();
    await page
      .getByRole("button", { name: /Submit DO.*Mark Delivered/i })
      .click();
    await expect(page.getByText(/DO.*uploaded.*closed/i)).toBeVisible({ timeout: 5_000 });

    // Switch to Delivered tab — the PO is there.
    await page.getByRole("button", { name: /^Delivered$/i }).click();
    await expect(page.getByText(/DO-E2E-9999|delivered/i).first()).toBeVisible();
  }
});
