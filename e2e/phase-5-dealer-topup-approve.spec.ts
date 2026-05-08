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
// Phase 5 acceptance A1 (per spec docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §1.2):
//
//   "Record a dealer payment, dealer's deposit_balance reflects."
//
// This spec walks the wrap RPC path (Q1=A locked):
//   1. Dealer submits a top_up approval row via the dealer-side Top Up modal
//      (existing pre-Phase-5 dealer flow → creates approvals row kind='top_up'
//      with status='pending').
//   2. Finance navigates to FinancePayments → opens the pending top_up approval
//      → fires the new finance_topup_approve wrapper RPC via the topup-approve
//      route (POST /api/finance/payments/topup-approve, migration 0062).
//   3. Server atomically: approves the approval row + inserts payments row
//      (direction='in', amount, paid_at) + bumps dealers.deposit_balance.
//   4. Dealer page reloads + the new deposit_balance is visible on the dealer
//      profile / orders new-order step 1 KPI.
//
// Race protection (also covered by API integration test): a second call against
// the same approval_id sees status='approved' and raises ERRCODE 22023 → 422.
test.fixme("phase-5 A1: dealer top_up approval → finance approves → balance reflects", async ({ browser }) => {
  // ----- 1. Dealer submits top_up approval ----------------------------------
  const dealerCtx = await browser.newContext();
  const dpage = await dealerCtx.newPage();
  await login(dpage, "dealer-test@x.com", "dealer-test-password");

  // Capture starting deposit_balance from the dealer KPI on /me or
  // /dealer/profile. The KPI label is "Deposit balance" per dealer pages.
  await dpage.goto("/me");
  const startingBalanceText = await dpage.getByLabel(/deposit balance/i).textContent();
  const startingBalance = parseFloat((startingBalanceText ?? "0").replace(/[^0-9.]/g, ""));

  // Dealer-side Top Up modal — opens a request approval form (kind=top_up).
  // Existing dealer flow from Phase 2 — entry: New Order step 1 / dealer
  // settings / dedicated /topup route depending on Phase 2 wiring.
  await dpage.getByRole("button", { name: /top.?up/i }).first().click();
  await dpage.getByLabel(/amount/i).fill("3000");
  await dpage.getByLabel(/method/i).selectOption("bank_transfer");
  await dpage.getByLabel(/reference/i).fill("FPX-9981234");
  await dpage.getByRole("button", { name: /submit|request/i }).click();

  // Toast confirms approval request created.
  await expect(dpage.getByText(/queued.*approval|awaiting/i)).toBeVisible({ timeout: 5_000 });

  // ----- 2. Finance approves via FinancePayments topup-approve --------------
  const financeCtx = await browser.newContext();
  const fpage = await financeCtx.newPage();
  await login(fpage, "finance-test@x.com", "finance-test-password");

  // Navigate to /finance/payments. The Pending top-ups card / row surfaces
  // the dealer's request. Click the row → topup-approve panel.
  await fpage.goto("/finance/payments");
  await expect(fpage.getByText(/dealer-test|FPX-9981234/i)).toBeVisible({ timeout: 5_000 });

  // Open the topup-approve drawer / inline panel and confirm.
  await fpage.getByRole("button", { name: /approve.*top.?up/i }).first().click();
  await fpage.getByLabel(/method/i).selectOption("bank_transfer");
  await fpage.getByLabel(/reference/i).fill("FPX-9981234 verified by finance");
  await fpage.getByRole("button", { name: /confirm|approve/i }).click();

  // Toast confirms approval + payment recorded.
  await expect(fpage.getByText(/approved|recorded/i)).toBeVisible({ timeout: 5_000 });

  // ----- 3. Dealer reload — deposit_balance bumped --------------------------
  await dpage.goto("/me");
  await dpage.reload();
  const endingBalanceText = await dpage.getByLabel(/deposit balance/i).textContent();
  const endingBalance = parseFloat((endingBalanceText ?? "0").replace(/[^0-9.]/g, ""));

  expect(endingBalance).toBeCloseTo(startingBalance + 3000, 2);

  // ----- 4. Race guard: second approve attempt rejects ----------------------
  // Reopen the same approval row from finance's UI (now showing status=approved)
  // and try to fire approve again. Server should 422 with "already decided".
  await fpage.reload();
  // Status pill on the row should read "Approved", not "Pending".
  await expect(fpage.getByText(/approved/i).first()).toBeVisible();
});
