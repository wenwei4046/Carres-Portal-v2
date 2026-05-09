import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures (creates
// finance-test@x.com + DL-9101..9104 aging-bucket orders).
//
// Phase 5 acceptance A3 (per spec §1.2): "AR aging report shows 30/60/90 day
// buckets." Q6=A locked: single-RPC payload returns rows + 4 bucket aggregates.
//
// 2026-05-09 rewrite: original spec used speculative aria-labels
// (getByLabel(/0-30.*aging/i)) that don't match AgingCard's plain text
// "0-30 days" markup. This rewrite asserts against real DOM:
//   • Dashboard AgingCard renders 4 bucket rows
//   • FinanceAR aging filter pills work (0-30 / 31-60 / 61-90 / 90+)
//   • Filtered AR page shows the corresponding seeded DL row
test("phase-5 A3: AR aging buckets — dashboard renders + AR filter pills work", async ({ browser }) => {
  const fpage = await (await browser.newContext()).newPage();
  await login(fpage, "finance-test@x.com", "finance-test-password");

  // ----- 1. Dashboard AgingCard renders the 4 bucket rows ------------------
  await fpage.goto("/finance/dashboard");

  await expect(fpage.getByText(/A\/R Aging/i)).toBeVisible({ timeout: 10_000 });
  await expect(fpage.getByText(/Outstanding by age/i)).toBeVisible();

  // Each bucket shows as "<bucket> days" inside the card. AgingCard.tsx:192
  // renders `<bucket> days` for each of 0-30 / 31-60 / 61-90 / 90+.
  for (const bucket of ["0-30", "31-60", "61-90", "90+"]) {
    await expect(fpage.getByText(`${bucket} days`)).toBeVisible();
  }

  // ----- 2. FinanceAR — switch to All status filter so seeded DL-9101..9104 -
  //          (proceed_order, paid=0) all surface. Default Open filter is fine
  //          but be explicit in case staging seed has extras.
  await fpage.goto("/finance/ar");

  // The "All" status pill is the third in the first Segmented (Open / Settled
  // / All). Use exact:true to disambiguate from "All ages".
  await fpage.getByRole("button", { name: "All", exact: true }).click();

  // Each seeded DL surfaces as INV-{YYYY}-{dl} on the AR page (invoice_no
  // is synthesized from dl by finance_ar_aging RPC even pre-issuance).
  // Verify all 4 are visible at once under no aging filter ("All ages").
  for (const dl of [9101, 9102, 9103, 9104]) {
    await expect(
      fpage.getByText(new RegExp(`INV-\\d{4}-${dl}\\b`)),
    ).toBeVisible({ timeout: 5_000 });
  }

  // ----- 3. Aging-filter pills — clicking each narrows to the right bucket --
  //          The aging Segmented is the second one, with options "All ages",
  //          "0-30", "31-60", "61-90", "90+". Filter by 90+ → only DL-9104.
  await fpage.getByRole("button", { name: "90+", exact: true }).click();
  await expect(fpage.getByText(/INV-\d{4}-9104\b/)).toBeVisible({ timeout: 5_000 });
  // 0-30 (DL-9101) should NOT be visible under 90+ filter.
  await expect(fpage.getByText(/INV-\d{4}-9101\b/)).toHaveCount(0);

  // Filter by 0-30 → only DL-9101. (Use exact match because 0-30 is also a
  // substring of "10-30"-style strings; here it's safe but defensive.)
  await fpage.getByRole("button", { name: "0-30", exact: true }).click();
  await expect(fpage.getByText(/INV-\d{4}-9101\b/)).toBeVisible({ timeout: 5_000 });
  await expect(fpage.getByText(/INV-\d{4}-9104\b/)).toHaveCount(0);
});
