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
// Phase 4.5 Chunk 2 split `delivery_partner_id` into two distinct fields:
//   • purchase_orders.procurement_partner_id — LP that picks up FROM the
//     supplier and brings to HQ warehouse (procurement leg).
//   • order_supplier_threads.delivery_partner_id — LP that delivers the
//     final order TO the customer (customer leg).
// (See migrations 0049 + 0052 + 0051 RPC rewrites.)
//
// This spec asserts the two legs are tenant-isolated: Partner X (procurement)
// only sees the procurement-leg view; Partner Y (delivery) only sees the
// customer-leg view; cross-leg accept attempts are blocked by RLS + RPC
// guards (Codex R5 / migration 0046 LP column whitelist + RFD state guards).
test.fixme("phase-4.5-chunk-2: per-leg LP split — Partner X and Y see only their leg", async ({ browser }) => {
  // 1. Setup (off-system seed): a PO exists with
  //    purchase_orders.procurement_partner_id = Partner X, set via the
  //    rewritten logistics_assign_partner_and_dispatch RPC (Sprint B).
  //    The PO's order also has an order_supplier_threads row with
  //    delivery_partner_id = Partner Y, set via logistics_dispatch_customer_leg
  //    (which now takes p_thread_id, not p_po_id — see 0051).

  // 2. Partner X (procurement role) — should see the procurement leg only.
  const ctxX = await browser.newContext();
  const pageX = await ctxX.newPage();
  await login(pageX, "lp-x@x.com", "lp-x-password");
  await pageX.getByRole("link", { name: /pickups/i }).click();
  // Procurement-leg PO is visible to Partner X (auth.app_partner_id() ===
  // purchase_orders.procurement_partner_id RLS allow).
  await expect(pageX.getByText(/PO-FIXTURE-LEG-X/)).toBeVisible();
  // Customer-leg fields are NOT shown for Partner X — those live on
  // order_supplier_threads, scoped to Partner Y. The procurement view should
  // surface the supplier + warehouse + RFD-pending pickup state, not the
  // customer-leg request_for_delivery_at or confirm_delivery_date.
  await expect(pageX.getByTestId("customer-leg-confirm-delivery-date")).toHaveCount(0);
  await expect(pageX.getByTestId("customer-leg-request-for-delivery")).toHaveCount(0);

  // 3. Partner Y (delivery role) — should see the customer leg only.
  const ctxY = await browser.newContext();
  const pageY = await ctxY.newPage();
  await login(pageY, "lp-y@x.com", "lp-y-password");
  await pageY.getByRole("link", { name: /deliveries|pickups/i }).click();
  // Customer-leg thread is visible to Partner Y (auth.app_partner_id() ===
  // order_supplier_threads.delivery_partner_id RLS allow).
  await expect(pageY.getByText(/PO-FIXTURE-LEG-X/)).toBeVisible();
  // Procurement-leg fields are NOT shown for Partner Y — Partner Y never sees
  // the supplier-side pickup detail or partner_inbound_accepted_at column.
  await expect(pageY.getByTestId("procurement-leg-warehouse-id")).toHaveCount(0);
  await expect(pageY.getByTestId("procurement-leg-partner-inbound-accepted")).toHaveCount(0);

  // 4. Cross-tenant guards.
  //    Partner X cannot accept the customer-leg RFD (logistics_partner_accept_rfd
  //    takes p_thread_id, RLS scopes thread to delivery_partner_id; Partner X's
  //    JWT does not match → 403 from Hono or RLS denial).
  const xAcceptCustomer = await pageX.request.post("/api/partner/pickups/accept", {
    data: { threadId: "00000000-0000-0000-0000-000000000ff1" },
  });
  expect([403, 404]).toContain(xAcceptCustomer.status());

  //    Partner Y cannot accept the procurement-leg inbound (lp_accept_inbound_delivery
  //    reads procurement_partner_id; Partner Y's JWT does not match → 42501 from
  //    migration 0046 trigger or 403 from Hono guard).
  const yAcceptProcurement = await pageY.request.post("/api/partner/pickups/accept-inbound", {
    data: { poId: "PO-FIXTURE-LEG-X" },
  });
  expect([403, 404, 422]).toContain(yAcceptProcurement.status());
});
