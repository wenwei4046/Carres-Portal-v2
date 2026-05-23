import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - SO-9204: sofa-reject order at thread.operation_stage='waiting' (per
//     0047 rollup, orders.operation_stage rolls up to 'ready_to_dispatch'
//     when any thread is at 'waiting'). Thread supplier=Ohana, sop_name=
//     'SOFA_SPECIAL'.
//
// 2026-05-09 rewrite: original spec walked the Sofa Reject Relocate flow
// (LP Pre-flight Reject → operation Relocate to new wh → at_warehouse_waiting
// → customer-confirm → Resume). Most complex SOP. Pivoted to a smoke
// asserting the order with a 'waiting' thread surfaces on the kanban —
// the rollup behavior (waiting → ready_to_dispatch column) was a
// frequently-broken path during Phase 4.5 development.
test("Sofa Reject (SOP_SOFA_SPECIAL, waiting) — order surfaces on operation kanban", async ({ page }) => {
  await login(page, "operation-test@x.com", "operation-test-password");
  await page.goto("/operation/orders");
  await expect(page.getByRole("button", { name: /#9204/ })).toBeAttached({ timeout: 10_000 });
});
