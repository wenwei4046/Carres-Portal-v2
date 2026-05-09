import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server is running.
// Un-fixme this test once those preconditions are met.
//
// This spec covers the full happy path for a Mattress order:
// dealer creates order → logistics auto-fills procurement PO → LP picks up
// from supplier (procurement leg) → logistics receives at warehouse with DO
// upload → logistics force-dispatches customer-leg → POD upload → delivered.
//
// Mattress flows go through Nice Future and use the SOP_MATTRESS_STANDARD
// pattern: no Sofa-style Ready Confirm, no LP pre-flight 代按.
test.fixme("Mattress full happy path", async ({ page, browser }) => {
  // 1. Dealer creates Nice Future Mattress order
  await login(page, "dealer-test@x.com", "dealer-test-password");
  // ... use existing dealer-new-order.spec.ts pattern to create a Nice Future Mattress order.
  // Wizard: Step 1 customer + delivery; Step 2 pick a Nice Future mattress
  // variant + Add; Step 3 confirm + Submit. Order arrives at logistics
  // queue at logistics_stage='awaiting_logistics_action'.

  // 2. Logistics confirm proceed → auto-fills procurement PO
  const logisticsCtx = await browser.newContext();
  const lpage = await logisticsCtx.newPage();
  await login(lpage, "logistics-test@x.com", "logistics-test-password");
  await lpage.getByRole("link", { name: /orders/i }).click();
  await lpage.getByRole("button", { name: /confirm proceed/i }).first().click();
  // Auto-fill scans stock; if stock-insufficient, creates PO via
  // logistics_create_po (single-supplier auto-fill path) and the order_supplier_thread
  // is claimed by 0037 batch RPC. Thread enters 'pickup_required'.

  // 3. Logistics auto-fill PO + dispatch procurement-leg LP via existing
  //    0034 logistics_assign_partner_and_dispatch (procurement leg → LP picks up
  //    from supplier and brings to HQ warehouse).
  // ... AssignPickupDialog: pick LP partner + warehouse + Send RFD ...
  await lpage.getByRole("button", { name: /assign pickup/i }).first().click();
  await lpage.getByLabel(/lp-test alpha/i).click();
  await lpage.getByLabel(/own wh kl/i).click();
  await lpage.getByRole("button", { name: /send rfd/i }).click();

  // 4. LP Accept procurement RFD via /delivery-partner/pickups
  //    (procurement leg uses partner_confirm_receive — Phase 4 RPC).
  const lpCtx = await browser.newContext();
  const lpPage = await lpCtx.newPage();
  await login(lpPage, "lp-test@x.com", "lp-test-password");
  await lpPage.getByRole("link", { name: /pickups/i }).click();
  await lpPage.getByRole("button", { name: /accept.*reject/i }).first().click();
  await lpPage.getByRole("button", { name: /^accept$/i }).click();

  // 5. Logistics Receive at warehouse → DO upload via DOFileUploadField → ready_to_dispatch
  await lpage.getByRole("button", { name: /receive/i }).click();
  await lpage.setInputFiles('input[type="file"]', "e2e/fixtures/test-do.pdf");
  // ... submit receive ...
  await lpage.getByRole("button", { name: /submit receive/i }).click();
  // Mattress thread transitions: pickup_required → received_in_transit
  // → ready_to_dispatch (since SOP_MATTRESS_STANDARD doesn't gate on
  // partner_confirmed). Order rolls up to ready_to_dispatch.

  // 6. Logistics Dispatch customer-leg (Force) via DispatchPartnerDialog
  await lpage.getByRole("button", { name: /^dispatch$/i }).click();
  await lpage.getByLabel(/force dispatch/i).click();
  await lpage.getByRole("button", { name: /force dispatch/i }).click();
  // Force path skips RFD + LP Accept gate; goes straight to dispatched.

  // 7. Verify order rolls up to dispatched
  await expect(lpage.getByText(/dispatched/i)).toBeVisible();

  // 8. POD upload + delivered (existing logistics_attach_pod_do flow from Phase 4)
  // ... opens POD upload modal, attaches signed POD PDF, marks delivered ...
});
