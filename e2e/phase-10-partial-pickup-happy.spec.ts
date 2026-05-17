import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 10 — partial pickup happy path (3 + 4 + 3 across 10 sales orders).
 *
 * Scaffolded 2026-05-15 (Task 14) — written as `test.fixme()` per the
 * existing convention for specs whose seed data isn't in
 * `scripts/seed-e2e-fixtures.sql` yet. Un-fixme after Loo seeds the matching
 * fixtures locally and confirms the staging Supabase is at migration 0107+.
 *
 * What this spec exercises (migration 0107 + 0108 acceptance):
 *   • Per-thread `supplier_ready_at` + `pickup_event_id` are independently
 *     toggled by the supplier (Task 10 UI) + partner (Task 11 batch RPC).
 *   • PO `sup_status` cycles: in_production → partially_shipped (twice) →
 *     delivered, NOT the legacy single-step jump to delivered.
 *   • Three `po_pickup_events` rows persist with thread_counts 3 / 4 / 3
 *     (Task 13 supplier history list).
 *   • Reprint DO button works for each event (Task 13 reprint endpoint).
 *
 * Cross-references:
 *   • Filter audit (Task 14) — supplier/products.ts OPEN_SUP_STATUSES,
 *     supplier/pos.ts PIPELINE_BUCKETS.ready, partner/dashboard.ts,
 *     operation/badges.ts all include `partially_shipped`. This spec is the
 *     end-to-end proof that the partial PO stays surfaced to every role
 *     through the in-between state.
 *
 * Required pre-seed in `scripts/seed-e2e-fixtures.sql` (NOT YET LANDED — this
 * is the un-fixme blocker):
 *
 *   • 10 dealer orders for the Carres KL Showroom dealer:
 *       - 3 sofa orders → HoOKkA sofa threads
 *       - 3 mattress+bedframe orders → NiceFuture mattress threads +
 *                                       HoOKkA bedframe threads
 *       - 4 mattress-only orders → NiceFuture mattress threads
 *   • `operation_create_pos_batch` bundles them into 2 POs:
 *       - PO-FIX-NF-PARTIAL (NiceFuture mattress, 10 threads total = 3+3+4)
 *       - PO-FIX-HK-COMBINED (HoOKkA sofa + bedframe, mixed-category)
 *   • Both POs advanced to `sup_status='in_production'` so the supplier-side
 *     `supplier_ready_thread` RPC is the first state-mutating call this spec
 *     drives. Per-thread state machine starts clean: supplier_ready_at NULL,
 *     pickup_event_id NULL on every linked thread.
 *
 * Required app users (already in seed-test-users.ts):
 *   • supplier-nicefuture@x.com (own_logistics, supplier_id=NiceFuture)
 *   • partner-nets@x.com (procurement partner for both POs)
 *   • supplier@carres.com (HoOKkA — touched lightly to verify cross-supplier
 *     RLS holds throughout)
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.fixme(
  "Phase 10 — partial pickup happy path (3 + 4 + 3 across 10 sales orders)",
  async ({ page }) => {
    const PO_ID = "PO-FIX-NF-PARTIAL";

    // ----- 1. Supplier login + open the NiceFuture PO -----------------------
    await login(page, "supplier-nicefuture@x.com", "111");
    await expect(page).toHaveURL(/\/supplier(\/dashboard)?$/);

    await page.goto("/supplier/pos");
    const poCard = page.locator(`[data-testid="po-card-${PO_ID}"]`);
    await expect(poCard).toBeVisible({ timeout: 10_000 });
    await poCard.click();
    await expect(page.getByTestId("po-drawer")).toBeVisible();

    // ~10 threads listed in the PODrawer thread checklist (Task 10).
    const threadRows = page.locator('[data-testid^="thread-row-"]');
    await expect(threadRows).toHaveCount(10);

    // ----- 2. Supplier ticks first 3 threads ready --------------------------
    for (let i = 0; i < 3; i++) {
      const checkbox = threadRows.nth(i).getByRole("checkbox");
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }
    // Close drawer; PO stays in `in_production` until the partner picks
    // (per-thread ready_at doesn't advance PO sup_status by itself).
    await page.getByRole("button", { name: /close/i }).click();

    // ----- 3. Switch to partner-nets — see 3 ready threads -----------------
    await login(page, "partner-nets@x.com", "111");
    await page.goto("/partner/factory-pickups");
    const awaitingCard = page
      .locator(`[data-testid="pickup-card-${PO_ID}"]`)
      .filter({ hasText: /3 ready/i });
    await expect(awaitingCard).toBeVisible({ timeout: 10_000 });
    await awaitingCard.click();

    const partnerThreadRows = page.locator('[data-testid^="partner-thread-row-"]');
    await expect(partnerThreadRows).toHaveCount(3);

    // ----- 4. Partner multi-selects all 3 + submits DO A --------------------
    await page.getByTestId("select-all-threads").check();
    await page.getByTestId("do-number-input").fill("DO-NF-A");
    await page.getByTestId("po-file-upload").setInputFiles("e2e/fixtures/test-do.pdf");
    await page.getByLabel(/I confirm/i).check();
    await page.getByRole("button", { name: /Pickup selected.*Submit DO/i }).click();
    await expect(page.getByText(/Picked up 3 thread/i)).toBeVisible({ timeout: 10_000 });

    // ----- 5. Assert PO state = partially_shipped --------------------------
    // Partner-side kanban: card stays in "Awaiting" column (filter audit
    // CORRECTLY routes partially_shipped → awaiting per Task 11).
    await page.goto("/partner/factory-pickups");
    await expect(
      page.locator(`[data-testid="pickup-card-${PO_ID}"]`)
        .filter({ hasText: /7 ready|partially picked/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ----- 6. Supplier ticks next 4 threads ready --------------------------
    await login(page, "supplier-nicefuture@x.com", "111");
    await page.goto("/supplier/pos");
    await page.locator(`[data-testid="po-card-${PO_ID}"]`).click();
    await expect(page.getByTestId("po-drawer")).toBeVisible();
    // Threads 0..2 are now disabled (pickup_event_id set). Threads 3..6 are
    // the next 4 to tick ready.
    for (let i = 3; i < 7; i++) {
      const checkbox = threadRows.nth(i).getByRole("checkbox");
      await checkbox.check();
    }
    await page.getByRole("button", { name: /close/i }).click();

    // ----- 7. Partner picks the next 4 with DO B ---------------------------
    await login(page, "partner-nets@x.com", "111");
    await page.goto("/partner/factory-pickups");
    await page
      .locator(`[data-testid="pickup-card-${PO_ID}"]`)
      .filter({ hasText: /4 ready/i })
      .click();
    await page.getByTestId("select-all-threads").check();
    await page.getByTestId("do-number-input").fill("DO-NF-B");
    await page.getByTestId("po-file-upload").setInputFiles("e2e/fixtures/test-do.pdf");
    await page.getByLabel(/I confirm/i).check();
    await page.getByRole("button", { name: /Pickup selected.*Submit DO/i }).click();
    await expect(page.getByText(/Picked up 4 thread/i)).toBeVisible({ timeout: 10_000 });

    // Still partially_shipped — 3 threads remain.
    await page.goto("/partner/factory-pickups");
    await expect(
      page.locator(`[data-testid="pickup-card-${PO_ID}"]`)
        .filter({ hasText: /3 ready|partially picked/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ----- 8. Supplier ticks last 3 threads ready --------------------------
    await login(page, "supplier-nicefuture@x.com", "111");
    await page.goto("/supplier/pos");
    await page.locator(`[data-testid="po-card-${PO_ID}"]`).click();
    for (let i = 7; i < 10; i++) {
      const checkbox = threadRows.nth(i).getByRole("checkbox");
      await checkbox.check();
    }
    await page.getByRole("button", { name: /close/i }).click();

    // ----- 9. Partner picks the final 3 with DO C → PO converges -----------
    await login(page, "partner-nets@x.com", "111");
    await page.goto("/partner/factory-pickups");
    await page
      .locator(`[data-testid="pickup-card-${PO_ID}"]`)
      .filter({ hasText: /3 ready/i })
      .click();
    await page.getByTestId("select-all-threads").check();
    await page.getByTestId("do-number-input").fill("DO-NF-C");
    await page.getByTestId("po-file-upload").setInputFiles("e2e/fixtures/test-do.pdf");
    await page.getByLabel(/I confirm/i).check();
    await page.getByRole("button", { name: /Pickup selected.*Submit DO/i }).click();
    await expect(page.getByText(/Picked up 3 thread/i)).toBeVisible({ timeout: 10_000 });

    // PO terminal state = delivered (migration 0108 F3: both branches converge
    // to `delivered`, not the legacy `picked_up`/`shipped`).
    await page.goto("/partner/factory-pickups");
    await expect(
      page.locator(`[data-testid="pickup-card-${PO_ID}"]`)
        .filter({ hasText: /Delivered|shipped|in transit/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ----- 10. Supplier PODrawer history shows 3 events with 3/4/3 counts --
    await login(page, "supplier-nicefuture@x.com", "111");
    await page.goto("/supplier/pos");
    // PO moved into Delivered bucket now.
    await page.getByRole("button", { name: /^Delivered/i }).click();
    await page.locator(`[data-testid="po-card-${PO_ID}"]`).click();
    const historyRows = page.locator('[data-testid^="pickup-event-"]');
    await expect(historyRows).toHaveCount(3);
    // Newest first — DO-NF-C with thread_count 3.
    await expect(historyRows.nth(0)).toContainText(/DO-NF-C/);
    await expect(historyRows.nth(0)).toContainText(/3 thread/);
    await expect(historyRows.nth(1)).toContainText(/DO-NF-B/);
    await expect(historyRows.nth(1)).toContainText(/4 thread/);
    await expect(historyRows.nth(2)).toContainText(/DO-NF-A/);
    await expect(historyRows.nth(2)).toContainText(/3 thread/);

    // ----- 11. Reprint DO works (Task 13 endpoint) -------------------------
    const reprintA = historyRows.nth(2).getByRole("button", { name: /Reprint DO/i });
    await expect(reprintA).toBeEnabled();
    // Don't assert PDF byte-level — just that the click triggers a network
    // request without erroring (the print payload lives at
    // /api/pickup-events/:id/print and is rendered client-side).
    const [req] = await Promise.all([
      page.waitForRequest(/\/api\/pickup-events\/.*\/print/),
      reprintA.click(),
    ]);
    expect(req.url()).toMatch(/\/api\/pickup-events\/[\w-]+\/print/);
  },
);
