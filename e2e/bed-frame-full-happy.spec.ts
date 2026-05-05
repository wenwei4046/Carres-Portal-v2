import { test, expect } from "@playwright/test";

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running. Un-fixme this test once those preconditions are met.
//
// This spec covers the Bed Frame happy path which mirrors Mattress (Task 39)
// but exercises the RFD path for customer-leg dispatch (NOT Force).
// HoOKkA Bedframe self-delivers to HQ warehouse (no procurement-leg LP), so
// the procurement portion is off-system — Receive directly transitions
// the thread to ready_to_dispatch. Then DispatchPartnerDialog with Force OFF
// sends an RFD to the customer-leg LP, who must Accept before dispatch.
test.fixme("Bed Frame full happy (RFD path)", async ({ page, browser }) => {
  // 1-4. Dealer order → Logistics confirm → auto-fill HoOKkA PO →
  //      HoOKkA self-delivers (off-system, no procurement LP).
  //      Pattern matches dealer-new-order.spec.ts but pick a HoOKkA Bedframe
  //      variant in Step 2.

  // 5. Logistics Receive
  await page.getByRole("button", { name: /receive/i }).click();
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/test-do.pdf");
  await page.getByRole("button", { name: /submit receive/i }).click();
  // SOP_BEDFRAME_STANDARD: Receive transitions thread directly to
  // ready_to_dispatch. Order rolls up to ready_to_dispatch.

  // 6. Logistics opens DispatchPartnerDialog with RFD (Force OFF)
  await page.getByRole("button", { name: /^dispatch$/i }).click();
  await page.getByLabel(/lp-test alpha/i).click();
  await page.getByLabel(/confirm delivery date/i).fill("2026-05-20");
  await page.getByRole("button", { name: /send rfd/i }).click();
  // RFD path: PO sup_status='rfd_pending', confirm_delivery_date set,
  // partner_dispatched_at=NULL until LP accepts.

  // 7. LP logs in, sees RFD pending, accepts
  const lpCtx = await browser.newContext();
  const lpPage = await lpCtx.newPage();
  await lpPage.goto("/login");
  await lpPage.getByLabel(/email/i).fill("lp-test@x.com");
  await lpPage.getByLabel(/password/i).fill("lp-test-password");
  await lpPage.getByRole("button", { name: /sign in/i }).click();
  await lpPage.getByRole("link", { name: /pickups/i }).click();
  await expect(lpPage.getByText(/rfd pending/i)).toBeVisible();
  await lpPage.getByRole("button", { name: /accept.*reject/i }).first().click();
  await lpPage.getByRole("button", { name: /^accept$/i }).click();
  // partner_accept_dispatch RPC sets partner_accepted_at + transitions
  // PO sup_status='dispatched' atomically; thread rolls to dispatched.

  // 8. Order should now be dispatched
  await expect(page.getByText(/dispatched/i)).toBeVisible();
});
