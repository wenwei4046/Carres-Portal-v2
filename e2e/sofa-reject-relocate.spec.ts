import { test, expect } from "@playwright/test";

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running. Un-fixme this test once those preconditions are met.
//
// Sofa Reject branch of SOP_SOFA_SPECIAL v2 — the most complex flow in
// Phase 4.5 Chunk 1. When the LP Rejects the pre-flight, the order needs
// to be relocated to a different warehouse. After relocation, when the
// supplier delivers there, the thread enters at_warehouse_waiting (NOT
// ready_to_dispatch — buyer/operator must explicitly resume).
test.fixme("Sofa Reject → Relocate → at_warehouse_waiting → Resume", async ({ page }) => {
  // 1-4. Dealer order → Logistics confirm → auto-fill HoOKkA Sofa PO →
  //      HoOKkA Ready Confirm

  // 5. Logistics LP Pre-flight → Reject
  await page.getByRole("link", { name: /procurement/i }).click();
  await page.getByRole("button", { name: /lp pre-flight/i }).first().click();
  await page.getByRole("button", { name: /reject receive/i }).click();
  // partner_reject_customer / lp_reject_inbound_delivery RPC sets
  // partner_inbound_rejected_at; PO needs reassignment.

  // 6. Reassignment indicator visible
  await expect(page.getByText(/request for reassignment/i)).toBeVisible();

  // 7. Click Relocate → WarehouseRelocateDialog
  await page.getByRole("button", { name: /relocate/i }).click();
  await page.getByLabel(/own wh kl|lp-b wh/i).first().click();
  await page.getByRole("button", { name: /^relocate$/i }).click();
  // logistics_relocate_warehouse RPC (extended in Task 13) updates
  // PO warehouse_id + sup_status='relocated'.

  // 8. PO sup_status='relocated'
  await expect(page.getByText(/relocated/i)).toBeVisible();

  // 9. HoOKkA delivers to new wh (off-system) → Logistics Receive
  await page.getByRole("button", { name: /receive/i }).click();
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/test-do.pdf");
  await page.getByRole("button", { name: /submit receive/i }).click();

  // 10. PO sup_status='at_warehouse_waiting'; thread='waiting'
  await expect(page.getByText(/at_warehouse_waiting/i)).toBeVisible();
  // SOP_SOFA_SPECIAL v2 Reject branch: relocate path forces an explicit
  // resume gate. Receive transitions to 'at_warehouse_waiting' instead
  // of straight to ready_to_dispatch.

  // 11. Logistics Orders → at_warehouse_waiting filter chip
  await page.getByRole("link", { name: /orders/i }).click();
  await page.getByRole("button", { name: /at warehouse waiting/i }).click();
  await expect(page.getByRole("row").nth(1)).toBeVisible();

  // 12. Click order row → ResumeFromWaitingDialog → Resume to Dispatch
  await page.getByRole("row").nth(1).click();
  await page.getByRole("button", { name: /resume to dispatch/i }).click();
  // logistics_resume_from_waiting RPC (Task 14) transitions thread
  // from 'waiting' to 'ready_to_dispatch'.

  // 13. Thread='ready_to_dispatch'
  await page.getByRole("button", { name: /at warehouse waiting/i }).click();  // toggle filter off
  await expect(page.getByText(/ready to dispatch/i)).toBeVisible();

  // 14-16. Dispatch (Force) → Delivered
});
