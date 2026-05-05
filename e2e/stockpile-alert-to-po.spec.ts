import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running. Un-fixme this test once those preconditions are met.
//
// Phase 4.5 Chunk 2 Sprint D shipped stockpile thresholds (migration 0053):
//   • stock_balances gains low_threshold + high_threshold int columns + CHECKs.
//   • RPC logistics_stock_alerts() returns rows where (qty - reserved) <
//     low_threshold (i.e. effective < low_threshold).
//   • Hono routes: GET /api/logistics/stock-alerts (list), POST
//     /api/logistics/warehouses/:warehouseId/skus/:sku/threshold (set).
//   • Frontend: StockAlertsTile on LogisticsDashboard, SetThresholdDialog
//     inline-edit on LogisticsWarehouse, "Suggest from alerts" button in
//     CreatePOModal that pre-populates lines with
//     qty = (high_threshold || low_threshold * 2) - effective.
//
// This spec walks the threshold-set → shortage → alert → PO creation loop.
test.fixme("phase-4.5-chunk-2: stockpile alert flow — threshold → shortage → alert → CreatePO suggest", async ({ page }) => {
  // 1. Login as logistics.
  await login(page, "logistics-test@x.com", "logistics-test-password");

  // 2. Navigate to LogisticsWarehouse, find a SKU row, set low_threshold = 50
  //    via SetThresholdDialog inline edit.
  await page.getByRole("link", { name: /warehouse/i }).click();
  await page.getByTestId("sku-row-NF-MAT-Q").getByRole("button", { name: /set threshold/i }).click();
  await page.getByLabel(/low threshold/i).fill("50");
  await page.getByRole("button", { name: /^save$/i }).click();
  // Threshold persists via POST /api/logistics/warehouses/:wh/skus/:sku/threshold
  // (Task 19). Red dot indicator should now appear on rows below threshold.

  // 3. Confirm the threshold persisted by re-opening the dialog.
  await page.getByTestId("sku-row-NF-MAT-Q").getByRole("button", { name: /edit threshold/i }).click();
  await expect(page.getByLabel(/low threshold/i)).toHaveValue("50");
  await page.getByRole("button", { name: /^cancel$/i }).click();

  // 4. Confirm a stock movement that drops `effective` below 50 (off-system
  //    seed sets effective = 30 so shortage = 50 - 30 = 20). Existing logistics
  //    receive/ship flow consumes stock; the test fixture seeds a movement
  //    that makes the SKU shortfall.
  //    (Production path: dealer order consumes reserved → effective drops.
  //    For E2E speed, fixture seed is preferred to walking a full dealer flow.)

  // 5. Navigate to LogisticsDashboard → StockAlertsTile shows count > 0
  //    + this SKU listed.
  await page.getByRole("link", { name: /dashboard/i }).click();
  const alertsTile = page.getByTestId("stock-alerts-tile");
  await expect(alertsTile).toBeVisible();
  await expect(alertsTile.getByText(/\b[1-9]\d*\s+alerts?\b/i)).toBeVisible();
  await expect(alertsTile.getByText(/NF-MAT-Q/)).toBeVisible();

  // 6. Click "Create PO" → CreatePOModal opens in stockpile mode.
  await page.getByRole("button", { name: /create po/i }).click();
  const dialog = page.getByRole("dialog", { name: /create po/i });
  await expect(dialog).toBeVisible();

  // 7. Click "Suggest from alerts" → lines pre-populated.
  await dialog.getByRole("button", { name: /suggest from alerts/i }).click();
  // qty = (high_threshold || low_threshold * 2) - effective
  //     = (null || 50 * 2) - 30 = 70
  const skuLine = dialog.getByTestId("po-line-NF-MAT-Q");
  await expect(skuLine).toBeVisible();
  await expect(skuLine.getByLabel(/qty/i)).toHaveValue("70");
  // Sprint E COGS: cost + cost_source must also be auto-filled when
  // "Suggest from alerts" is used. cost_source defaults to 'system_suggested'
  // (110% of recent cost via /api/logistics/skus/:sku/recent-cost).
  await expect(skuLine.getByLabel(/cost source/i)).toHaveValue("system_suggested");
  await expect(skuLine.getByLabel(/^cost$/i)).not.toHaveValue("");

  // 8. Save the PO → assert PO created with the suggested qty + cost filled.
  await dialog.getByRole("button", { name: /save|create/i }).click();
  await expect(page.getByText(/PO created/i)).toBeVisible();
  // The created PO surfaces in the Nice Future tab with qty=70 +
  // cost_source='system_suggested' on the line. Validation in
  // logistics_create_po (Task 26) rejects NULL cost/cost_source with
  // SQLSTATE 22023 DETAIL='cost_required', so a successful save proves
  // both fields persisted.
  await page.goto("/logistics/procurement/nice-future");
  await expect(page.getByText(/NF-MAT-Q/).first()).toBeVisible();
});
