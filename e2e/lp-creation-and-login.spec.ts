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

// Cross-tenant leak regression: migration 0046 adds RLS policies on
// purchase_orders that scope LP visibility by delivery_partner_id =
// auth.app_partner_id(). LP-A must NOT see LP-B's POs in their Pickups page.
// Pre-condition: 2 LP test users seeded (lp-a@x, lp-b@x), each with one PO.
test.fixme("Cross-tenant leak: LP-A cannot see LP-B's POs", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/login");
  await pageA.getByLabel(/email/i).fill("lp-a@x.com");
  await pageA.getByLabel(/password/i).fill("lp-a-password");
  await pageA.getByRole("button", { name: /sign in/i }).click();

  await pageA.getByRole("link", { name: /pickups/i }).click();
  await expect(pageA.getByText("PO-LP-A-1")).toBeVisible();
  await expect(pageA.getByText("PO-LP-B-1")).not.toBeVisible();
});
