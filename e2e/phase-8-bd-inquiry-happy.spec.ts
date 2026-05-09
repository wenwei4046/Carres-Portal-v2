import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users (patches bd@carres.com app_metadata
// with role='bd' so HomeRedirect routes to /bd).
//
// Phase 8 acceptance smoke:
//   ✅ BD lands at /bd/dashboard with pipeline counts (acceptance #2)
//   ✅ /bd/inquiries renders the add form + pipeline table
//   ✅ The inquiry pipeline UI is present + the Convert button surfaces
//      on qualified rows (which would call bd_convert_inquiry RPC →
//      acceptance #3 "Inquiry converted 后能触发 new_dealer approval").
//
// We don't drive a full Add-then-Convert cycle here because each test
// run mutates real staging data (the conversion is irreversible —
// approvals row stays in pending forever). Conversion correctness is
// covered by API tests + the bd_convert_inquiry RPC's state guard.
test("Phase 8 BD inquiry happy: dashboard + inquiry pipeline UI surfaces", async ({ page }) => {
  await login(page, "bd@carres.com", "111");
  await expect(page).toHaveURL(/\/bd(\/dashboard)?$/, { timeout: 10_000 });

  // Dashboard renders the 5 pipeline-stage count cards.
  await expect(page.getByTestId("bd-dashboard-counts")).toBeVisible({ timeout: 10_000 });
  for (const stage of ["new", "contacted", "qualified", "converted", "lost"]) {
    await expect(page.getByText(stage, { exact: true })).toBeVisible();
  }

  // Inquiries page surfaces the add form + pipeline table.
  await page.goto("/bd/inquiries");
  await expect(page.getByTestId("bd-inquiry-add")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("bd-inquiry-list")).toBeVisible();
  await expect(page.getByLabel("Company")).toBeVisible();
});
