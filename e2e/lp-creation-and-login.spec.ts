import { test, expect } from "@playwright/test";

test.fixme("LP login lands at /delivery-partner/dashboard", async ({ page }) => {
  // Pre-condition: an LP test user exists (seed adds via Sprint 3 Task 23 once
  // CreateLpAccountForm lands; this fixme un-fixme'd in Task 45).
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("lp-test@x.com");
  await page.getByLabel(/password/i).fill("lp-test-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/delivery-partner\/dashboard/);
});
