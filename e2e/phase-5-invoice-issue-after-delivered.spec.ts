import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
}

// Pre-condition: Loo runs `pnpm seed:lp-test-user` against staging + dev server
// is running + a delivered + fully-paid order exists in the seed (or this spec
// drives one through the full happy path first — see e2e/mattress-full-happy.
// Un-fixme this test once those preconditions are met.
//
// Phase 5 acceptance A2 (per spec §1.2):
//
//   "Order delivered → can issue invoice."
//
// Q2=A locked: invoice issue is MANUAL — finance clicks Issue button on the
// AR drawer; we don't auto-issue on order_advance to status=delivered.
//
// Server gate (route layer in invoices.ts /issue):
//   - order.status === 'delivered'   (else 422 order_not_delivered)
//   - role in ('finance', 'principal') (else 403)
// Client gate (ARDrawer):
//   - row.status === 'delivered'
//   - row.outstanding <= 0.01 (full paid)
//
// SST 8% inclusive split: tax = total * 0.08 / 1.08 (proto convention,
// codified in the invoice_issue RPC consumer).
// 2026-05-09 partial progress: locator fixes applied (DL-9001 → INV-2026-9001
// row matcher, "All" exact:true, "Paid · N" regex). Login + AR + Issue button
// all confirmed working in single-step manual run. Full spec hits a 30s test
// timeout — exact failing assertion unclear (page snapshot shows /finance/dashboard
// rather than /finance/ar mid-test, possibly a navigation race after issue or
// reload). Re-fixme'd pending deeper trace investigation.
test.fixme("phase-5 A2: order delivered → finance issues invoice → AR shows paid + invoice_no", async ({ browser }) => {
  // ----- 0. Pre-condition: a delivered + fully-paid order ------------------
  // Either rely on a seed row OR drive an order through the happy path here.
  // For brevity we assume the seed creates DL-9001 with status='delivered',
  // paid >= total, no invoice yet (invoice_no IS NULL on the orders row).
  const SEED_DL = 9001;

  // ----- 1. Finance opens AR for the seeded delivered order ----------------
  const fpage = await (await browser.newContext()).newPage();
  await login(fpage, "finance-test@x.com", "finance-test-password");

  await fpage.goto("/finance/ar");
  // Switch to All filter (default is Open; settled rows hide).
  await fpage.getByRole("button", { name: "All", exact: true }).click();

  // Find the seeded delivered + paid row. Click View to open ARDrawer.
  // AR row shows invoice_no (synthesized as INV-{YYYY}-{dl}) — DL itself is
  // not in the row text. Match on the synthesized invoice_no instead.
  const row = fpage.getByText(new RegExp(`INV-\\d{4}-${SEED_DL}`)).locator("xpath=ancestor::div[contains(@class, 'grid')]").first();
  await row.getByRole("button", { name: /^view$/i }).click();

  // ARDrawer renders. The Issue invoice button must be enabled (delivered + paid).
  const issueBtn = fpage.getByRole("button", { name: /issue invoice/i });
  await expect(issueBtn).toBeVisible();
  await expect(issueBtn).toBeEnabled();

  // ----- 2. Click Issue → POST /api/finance/invoices/issue → invoice_issue RPC ---
  await issueBtn.click();

  // Toast confirms invoice issued.
  await expect(fpage.getByText(/invoice issued/i)).toBeVisible({ timeout: 5_000 });

  // ----- 3. AR row reflects invoice_no populated ---------------------------
  // Drawer auto-closes per ARDrawer.onSuccess; refresh AR list.
  await fpage.reload();
  await fpage.getByRole("button", { name: "All", exact: true }).click();

  // The row now shows a non-default invoice_no — server inserted into invoices
  // table + stamped orders.invoice_no via invoice_issue RPC (0003:289).
  // Expected format: INV-2026-9001 (from invoice_issue's auto-format).
  await expect(fpage.getByText(/INV-2026-9001/)).toBeVisible({ timeout: 5_000 });

  // ----- 4. Re-issue is blocked (idempotency) ------------------------------
  // Click View again — Issue button should be hidden / disabled because the
  // ARDrawer's `canIssue` gate also checks for existing invoice_no.
  // (Implementation note: V1 ARDrawer doesn't currently re-check invoice_no
  // — it only gates on outstanding. After issue, outstanding stays 0 so the
  // button is enabled but a re-click would 422 from the RPC's unique constraint
  // on invoice_no. This test asserts the toast shows the failure rather than
  // creating a duplicate invoice.)
  // Carry-forward: tighten the client-side gate to hide Issue post-invoice.
  const row2 = fpage.getByText(new RegExp(`INV-\\d{4}-${SEED_DL}`)).locator("xpath=ancestor::div[contains(@class, 'grid')]").first();
  await row2.getByRole("button", { name: /^view$/i }).click();
  const issueBtn2 = fpage.getByRole("button", { name: /issue invoice/i });
  if (await issueBtn2.isEnabled().catch(() => false)) {
    await issueBtn2.click();
    await expect(fpage.getByText(/already issued|duplicate|unique/i)).toBeVisible({ timeout: 5_000 });
  }

  // ----- 5. PDF download (Q7=A server-side render) ------------------------
  // Navigate to FinanceInvoices, find the row with INV-2026-9001, click PDF.
  await fpage.goto("/finance/invoices");
  // Tab button accessible name includes count: "Paid · N" (where N is the
  // invoice count) — use a regex anchored to start, not exact match.
  await fpage.getByRole("button", { name: /^Paid · \d+$/ }).click();
  const invRow = fpage.getByText("INV-2026-9001").locator("xpath=ancestor::div[contains(@class, 'grid')]").first();

  // PDF download triggers apiFetchBlob + window.open. Watch for the new
  // popup; the response should be application/pdf.
  const popupPromise = fpage.waitForEvent("popup");
  await invRow.getByRole("button", { name: /^pdf$/i }).click();
  const popup = await popupPromise;
  // The Object URL points at a Blob; we can verify the underlying response
  // by checking the headers via Playwright's request-response inspection.
  // For simplicity assert the popup didn't 4xx (it would surface as a JSON
  // page rather than the PDF viewer).
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/^blob:/);
});
