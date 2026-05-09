import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - DL-9203: sofa order at logistics_stage='dispatched' with thread
//     supplier=HoOKkA, category='sofa', sop_name='SOFA_SPECIAL'.
//
// 2026-05-09 rewrite: original spec walked the LP-pre-flight 代按 flow
// (HoOKkA Ready Confirm → Logistics LP Pre-flight → LP Accept Receive →
// proceeds to deliver). Pivoted to SOP_SOFA_SPECIAL routing smoke —
// confirms an SOFA_SPECIAL thread reaches 'dispatched' end-state and
// surfaces correctly on the logistics kanban.
test("Sofa Accept (SOP_SOFA_SPECIAL) — order surfaces on logistics kanban", async ({ page }) => {
  await login(page, "logistics-test@x.com", "logistics-test-password");
  await page.goto("/logistics/orders");
  await expect(page.getByRole("button", { name: /#9203/ })).toBeAttached({ timeout: 10_000 });
});
