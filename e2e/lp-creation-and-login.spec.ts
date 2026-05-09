import { test, expect } from "@playwright/test";

test("LP login lands at /delivery-partner/dashboard", async ({ page }) => {
  // Pre-condition: an LP test user exists (seed adds via Sprint 3 Task 23 once
  // CreateLpAccountForm lands; this fixme un-fixme'd in Task 45).
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("lp-test@x.com");
  await page.getByLabel(/password/i).fill("lp-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/delivery-partner\/dashboard/);
});

// Cross-tenant leak regression: migration 0046 + 0052 (which renamed
// delivery_partner_id → procurement_partner_id) scope LP visibility on
// purchase_orders to procurement_partner_id = auth.app_partner_id().
// LP-A must NOT see LP-B's POs in their Pickups page.
//
// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - lp-a@x.com / lp-b@x.com seeded with their own delivery_partner rows
//   - PO-LP-A-1 and PO-LP-B-1 seeded with the matching procurement_partner_id
test("Cross-tenant leak: LP-A cannot see LP-B's POs", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/login");
  await pageA.getByLabel(/email/i).fill("lp-a@x.com");
  await pageA.getByLabel(/password/i).fill("lp-a-password");
  await pageA.getByRole("button", { name: /sign in/i }).click();
  await pageA.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });

  // The partner sidebar uses "Pickups" link → /delivery-partner/pickups.
  // Use first() to disambiguate if multiple links match.
  await pageA.getByRole("link", { name: /pickups/i }).first().click();
  await pageA.waitForURL(/\/delivery-partner\/pickups/, { timeout: 10_000 });

  // PO-LP-A-1 visible (procurement_partner_id matches LP-A); PO-LP-B-1 hidden.
  await expect(pageA.getByText("PO-LP-A-1")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByText("PO-LP-B-1")).toHaveCount(0);
});
