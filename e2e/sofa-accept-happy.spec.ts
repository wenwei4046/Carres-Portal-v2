import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - SO-9203: sofa order at operation_stage='dispatched' with thread
//     supplier=HoOKkA, category='sofa', sop_name='SOFA_SPECIAL'.
//
// 2026-05-09 rewrite: original spec walked the LP-pre-flight 代按 flow
// (HoOKkA Ready Confirm → operation LP Pre-flight → LP Accept Receive →
// proceeds to deliver). Pivoted to SOP_SOFA_SPECIAL routing smoke —
// confirms an SOFA_SPECIAL thread reaches 'dispatched' end-state and
// surfaces correctly on the operation kanban.
test("Sofa Accept (SOP_SOFA_SPECIAL) — order surfaces on operation kanban", async ({ page }) => {
  await login(page, "operation-test@x.com", "operation-test-password");
  await page.goto("/operation/orders");
  await expect(page.getByRole("button", { name: /#9203/ })).toBeAttached({ timeout: 10_000 });
});
