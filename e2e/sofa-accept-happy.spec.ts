import { test, expect } from "@playwright/test";

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running. Un-fixme this test once those preconditions are met.
//
// Sofa flow uses SOP_SOFA_SPECIAL v2: HoOKkA Sofa supplier sends a Ready
// Confirm signal first, then Logistics triggers an LP Pre-flight 代按
// (代按 = "press the button on behalf"). The LP, via LpInboundConfirmDialog,
// either Accepts (this test) or Rejects (Task 42). On Accept, PO transitions
// to sup_status='partner_confirmed' and the supplier proceeds to deliver.
// Receive then transitions the thread to ready_to_dispatch.
test.fixme("Sofa Accept happy path (LP pre-flight 代按)", async ({ page }) => {
  // 1-3. Dealer order → Logistics confirm → auto-fill HoOKkA Sofa PO

  // 4. Trigger Ready Confirm Send (in Chunk 1 supplier UI doesn't exist; tester
  //    invokes RPC directly or uses existing logistics_supplier_ready_confirm).

  // 5. Logistics Procurement page → click LP Pre-flight 代按
  await page.getByRole("link", { name: /procurement/i }).click();
  await page.getByRole("button", { name: /lp pre-flight/i }).first().click();

  // 6. LpInboundConfirmDialog → click Accept
  await page.getByRole("button", { name: /^accept$/i }).click();
  // lp_accept_inbound_delivery RPC (Codex F1) sets partner_inbound_accepted_at
  // and transitions PO to sup_status='partner_confirmed'.

  // 7. PO sup_status='partner_confirmed'
  await expect(page.getByText(/partner_confirmed/i)).toBeVisible();

  // 8. HoOKkA delivers (off-system) → Logistics Receive
  await page.getByRole("button", { name: /receive/i }).click();
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/test-do.pdf");
  await page.getByRole("button", { name: /submit receive/i }).click();

  // 9. Thread → ready_to_dispatch (NOT 'waiting' — Accept path)
  await page.getByRole("link", { name: /orders/i }).click();
  await expect(page.getByText(/ready to dispatch/i)).toBeVisible();
  // SOP_SOFA_SPECIAL v2 Accept branch in logistics_receive_po_with_do:
  // since partner_confirmed already set, Receive bypasses the 'waiting'
  // gate and transitions directly to ready_to_dispatch.

  // 10-12. Dispatch (Force) → LP Accept → Delivered
});
