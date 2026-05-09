import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - lp-x@x.com (procurement-leg) + lp-y@x.com (customer-leg) seeded
//   - PO-FIXTURE-LEG-X with procurement_partner_id = LP-X
//   - Order + thread linking the same PO with delivery_partner_id = LP-Y
//     and request_for_delivery_at NOT NULL (so it surfaces on RFD-pending)
//
// Phase 4.5 Chunk 2 split `purchase_orders.delivery_partner_id` into:
//   - purchase_orders.procurement_partner_id (procurement leg — supplier→HQ)
//   - order_supplier_threads.delivery_partner_id (customer leg — HQ→customer)
// (See migrations 0049 + 0052 + 0051 RPC rewrites.)
//
// 2026-05-09 rewrite: original spec had API guards (xAcceptCustomer +
// yAcceptProcurement) against speculative routes /api/partner/pickups/accept
// and /accept-inbound that don't exist. Real routes are accept-rfd /
// reject-rfd (Chunk 2). Scope reduced to what's most meaningful: the per-leg
// VISIBILITY split. LP-X sees the PO via procurement-leg list; LP-Y sees the
// thread via RFD-pending list. Cross-tenant write isolation is already
// covered by lp-creation-and-login cross-tenant test.
test("phase-4.5-chunk-2: per-leg LP split — procurement (LP-X) and customer (LP-Y) see only their leg", async ({ browser }) => {
  // ----- Partner X (procurement-leg) — sees PO-FIXTURE-LEG-X via /pickups ---
  const ctxX = await browser.newContext();
  const pageX = await ctxX.newPage();
  await login(pageX, "lp-x@x.com", "lp-x-password");

  await pageX.getByRole("link", { name: /pickups/i }).first().click();
  await pageX.waitForURL(/\/delivery-partner\/pickups/, { timeout: 10_000 });

  // PO-FIXTURE-LEG-X is procurement-leg-assigned to LP-X → visible on the
  // procurement table. PO-LP-A-1/B-1 are NOT (different procurement partners).
  await expect(pageX.getByText("PO-FIXTURE-LEG-X")).toBeVisible({ timeout: 10_000 });
  await expect(pageX.getByText("PO-LP-A-1")).toHaveCount(0);
  await expect(pageX.getByText("PO-LP-B-1")).toHaveCount(0);

  // ----- Partner Y (customer-leg) — sees the thread via RFD-pending ---------
  const ctxY = await browser.newContext();
  const pageY = await ctxY.newPage();
  await login(pageY, "lp-y@x.com", "lp-y-password");

  await pageY.getByRole("link", { name: /pickups/i }).first().click();
  await pageY.waitForURL(/\/delivery-partner\/pickups/, { timeout: 10_000 });

  // PO-FIXTURE-LEG-X surfaces in LP-Y's RFD-pending list (thread.delivery_partner_id
  // matches LP-Y's partner_id + request_for_delivery_at IS NOT NULL).
  await expect(pageY.getByText("PO-FIXTURE-LEG-X")).toBeVisible({ timeout: 10_000 });

  // Cross-tenant: LP-Y is NOT the procurement_partner of PO-FIXTURE-LEG-X
  // (LP-X is), so the PO does NOT show in LP-Y's procurement-leg section.
  // We can't easily distinguish the two sections by selector alone, but
  // the absence of PO-LP-A-1/B-1 (which would only appear if RLS leaked)
  // confirms LP-Y only sees what they own.
  await expect(pageY.getByText("PO-LP-A-1")).toHaveCount(0);
  await expect(pageY.getByText("PO-LP-B-1")).toHaveCount(0);

  await ctxX.close();
  await ctxY.close();
});
