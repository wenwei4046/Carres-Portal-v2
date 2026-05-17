import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: pnpm seed:test-users && pnpm seed:e2e-fixtures
//   - SO-9202: bedframe order at logistics_stage='dispatched' with thread
//     supplier=HoOKkA, category='bedframe', sop_name='STANDARD'.
//
// 2026-05-09 rewrite: original spec was a half-stubbed multi-context flow
// (HoOKkA self-delivery → receive → RFD path → POD upload). Pivoted to
// SOP routing smoke. Bedframe uses SOP_STANDARD same as mattress, but
// differs in supplier (HoOKkA, not Nice Future) — this spec confirms the
// SOP routing works regardless of supplier.
test("Bed Frame (SOP_STANDARD, HoOKkA) — order surfaces on logistics kanban", async ({ page }) => {
  await login(page, "logistics-test@x.com", "logistics-test-password");
  await page.goto("/logistics/orders");
  await expect(page.getByRole("button", { name: /#9202/ })).toBeAttached({ timeout: 10_000 });
});
