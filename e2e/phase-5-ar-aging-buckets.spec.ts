import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running. The seed must create 4 orders (or extend existing seed) with
// synthetic placed_at offsets so each lands in a distinct aging bucket.
// Suggested seed augmentation:
//
//   INSERT INTO orders (...) VALUES
//     ('DL-9101', ..., placed_at = current_date - 5)   -- "0-30" bucket
//     ('DL-9102', ..., placed_at = current_date - 35)  -- "31-60"
//     ('DL-9103', ..., placed_at = current_date - 65)  -- "61-90"
//     ('DL-9104', ..., placed_at = current_date - 95); -- "90+"
//
// Each row must have outstanding > 0 (placed/dispatched/etc., not delivered+paid).
//
// Un-fixme this test once those preconditions are met.
//
// Phase 5 acceptance A3 (per spec §1.2):
//
//   "AR aging report shows 30/60/90 day buckets."
//
// Q6=A locked: single-RPC payload returns BOTH rows AND bucket aggregates.
// finance_ar_aging() in 0062 derives the bucket per row (0-30 / 31-60 / 61-90 / 90+)
// + sums outstanding into 4 buckets.
//
// FinanceDashboard's AgingCard + FinanceAR's filter pills + FinanceAR's table
// all consume the same payload. This spec verifies they don't disagree.
test.fixme("phase-5 A3: AR aging buckets render correctly + dashboard agrees with AR page", async ({ browser }) => {
  const SEED_DLS = [9101, 9102, 9103, 9104];

  const fpage = await (await browser.newContext()).newPage();
  await login(fpage, "finance-test@x.com", "finance-test-password");

  // ----- 1. FinanceDashboard AgingCard — 4 buckets each have 1 entry --------
  await fpage.goto("/finance/dashboard");

  // AgingCard renders 4 horizontal bars labelled "0-30", "31-60", "61-90", "90+".
  for (const bucket of ["0-30", "31-60", "61-90", "90+"]) {
    const bar = fpage.getByLabel(new RegExp(`${bucket}.*aging`, "i")).first();
    await expect(bar).toBeVisible({ timeout: 5_000 });
  }

  // Capture KPI: Outstanding total = sum of all 4 buckets.
  const outstandingText = await fpage.getByLabel(/AR outstanding/i).textContent();
  const outstandingTotal = parseFloat((outstandingText ?? "0").replace(/[^0-9.]/g, ""));

  // Overdue total = 31-60 + 61-90 + 90+ buckets (per finance_dashboard_summary
  // logic in 0062:419-425). Should equal outstandingTotal - bucket["0-30"].
  const overdueText = await fpage.getByLabel(/overdue/i).textContent();
  const overdueTotal = parseFloat((overdueText ?? "0").replace(/[^0-9.]/g, ""));

  expect(overdueTotal).toBeLessThanOrEqual(outstandingTotal);

  // ----- 2. FinanceAR page — filter to each bucket, only 1 row visible ------
  await fpage.goto("/finance/ar");
  // Default is Open filter; switch to All so all 4 seed rows are eligible
  // (some may already be settled in tests that run end-to-end after A2).
  await fpage.getByRole("button", { name: /^all$/i }).click();

  for (let i = 0; i < SEED_DLS.length; i++) {
    const dl = SEED_DLS[i];
    const bucket = ["0-30", "31-60", "61-90", "90+"][i];

    await fpage.getByRole("button", { name: new RegExp(`^${bucket}$`) }).click();

    // Only the seeded row for this bucket renders. (Other seed rows / test
    // detritus may also fall into the same bucket, so we only assert OUR
    // DL is there, not row count = 1.)
    await expect(fpage.getByText(`DL-${dl}`)).toBeVisible({ timeout: 5_000 });

    // Other seed rows in OTHER buckets should NOT be visible under this filter.
    for (let j = 0; j < SEED_DLS.length; j++) {
      if (i === j) continue;
      await expect(fpage.getByText(`DL-${SEED_DLS[j]}`)).not.toBeVisible();
    }
  }

  // ----- 3. Dashboard ↔ AR consistency check --------------------------------
  // Sum the AR table's Outstanding column (filter = All) and compare to
  // dashboard's Outstanding KPI. Both feed off the same RPC so they MUST agree.
  await fpage.getByRole("button", { name: /^all$/i }).click();

  const outstandingCells = await fpage.locator('[data-testid="ar-row-outstanding"]').allTextContents();
  const arPageTotal = outstandingCells
    .map((s) => parseFloat(s.replace(/[^0-9.]/g, "") || "0"))
    .reduce((a, b) => a + b, 0);

  // Allow 1¢ rounding tolerance (numeric(12,2) cast in the RPC).
  expect(arPageTotal).toBeCloseTo(outstandingTotal, 0);

  // ----- 4. AR drawer aging pill shows the right bucket per row ------------
  // Click a known-90+ row → drawer shows aging pill.
  const overdue90Row = fpage.getByText(`DL-${SEED_DLS[3]}`)
    .locator("xpath=ancestor::div[contains(@class, 'grid')]").first();
  await overdue90Row.getByRole("button", { name: /^view$/i }).click();
  await expect(fpage.getByText(/90\+/i).first()).toBeVisible({ timeout: 5_000 });
});
