import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
// (the latter sets low_threshold=50 on mattress:carres-cloud:Queen at
// warehouse c1, guaranteeing the StockAlertsTile shows this SKU).
//
// Phase 4.5 Chunk 2 Sprint D shipped stockpile thresholds (migration 0054):
//   • stock_balances.low_threshold + .high_threshold columns + CHECKs.
//   • RPC operation_stock_alerts() returns rows where (qty - reserved) <
//     low_threshold (i.e. effective < low_threshold).
//   • Frontend: StockAlertsTile on OperationDashboard, SetThresholdDialog
//     inline-edit on OperationWarehouse (only on the reserved-drilldown view,
//     so editing thresholds via UI requires a SKU with reservations — out
//     of scope for this spec).
//
// 2026-05-09 rewrite: original spec asserted on SKU code 'NF-MAT-Q' (doesn't
// exist) + speculative locators. Original full flow was threshold-set via UI →
// see alert → "Suggest from alerts" CreatePO; pivoted to threshold-set via
// fixture SQL because the threshold-edit UI is scoped to the reserved
// drilldown which needs reservations. The threshold-set UI flow is covered
// by SetThresholdDialog.test.tsx; this E2E covers the alert pipeline (RPC
// + tile rendering) end-to-end.
test("phase-4.5-chunk-2: stockpile alert tile shows below-threshold SKUs", async ({ page }) => {
  const TEST_SKU = "mattress:carres-cloud:Queen";

  await login(page, "operation-test@x.com", "operation-test-password");

  // ----- OperationDashboard renders StockAlertsTile -------------------------
  await page.goto("/operation");
  const tile = page.getByTestId("stock-alerts-tile");
  await expect(tile).toBeVisible({ timeout: 10_000 });

  // ----- Tile shows the seeded below-threshold SKU --------------------------
  // qty=4 (seed) < low_threshold=50 (fixture) → operation_stock_alerts() RPC
  // returns this row → tile renders <div data-testid="stock-alerts-row-{sku}">.
  await expect(
    page.getByTestId(`stock-alerts-row-${TEST_SKU}`),
  ).toBeVisible({ timeout: 5_000 });

  // ----- Tile shows a non-zero alert count ---------------------------------
  // The count testid is `stock-alerts-count` (StockAlertsTile.tsx:119). At
  // minimum this should equal 1 (our fixture row); other below-threshold
  // SKUs may also exist on staging.
  const countNode = page.getByTestId("stock-alerts-count");
  await expect(countNode).toBeVisible();
  const countText = (await countNode.textContent()) ?? "";
  const countNum = parseInt(countText.replace(/\D/g, ""), 10);
  expect(countNum).toBeGreaterThanOrEqual(1);
});
