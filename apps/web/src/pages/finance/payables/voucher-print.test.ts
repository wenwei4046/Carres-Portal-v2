import { describe, expect, it } from "vitest";
import type { PaymentVoucherDocument } from "@carres/shared/schemas/finance-ap";
import { paymentVoucherPrint } from "./voucher-print";

// Names are invented.
function doc(over: Partial<PaymentVoucherDocument["voucher"]> = {}): PaymentVoucherDocument {
  return {
    voucher: {
      id: "v1", voucher_no: "PV-9M3Q", status: "approved", purpose: "SUPPLIER_BILLS", supplier_id: "s1",
      supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", payee_name: "Lumen Sofa Works",
      voucher_date: "2026-09-11", amount: "1726.50", advance_amount: "500.00", ap_account_code: "2110",
      ap_account_name: "Trade payables", pay_method: "BANK_TRANSFER", pay_reference: "TRX-1",
      pay_from_account_code: "1120", pay_from_name: "Bank", narration: null, created_at: "2026-09-11T01:00:00Z",
      created_by_name: "Aina", prepared_at: "2026-09-11T02:00:00Z", prepared_by_name: "Aina",
      checked_at: "2026-09-12T03:00:00Z", checked_by_name: "Boon", approved_at: null, approved_by_name: null,
      rejected_at: null, rejected_by_name: null, reject_reason: null, cancelled_at: null, cancelled_by_name: null,
      cancel_reason: null, entry_no: null, reversal_entry_no: null, ...over,
    },
    lines: [{ line_no: 1, account_code: "6500", account_name: "Bank charges", description: "Transfer fee", amount: "1.50" }],
    allocations: [{ bill_id: "b1", bill_no: "BILL-4XK2", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10",
      due_date: null, bill_total: "1225.00", ap_account_code: "2110", amount_applied: "1225.00" }],
    advance: null, files: [], events: [], go_live_on: null, you_prepared: false,
    can: { edit: false, prepare: false, check: false, approve: false, reject: false, cancel: false, add_file: false,
      apply_advance: false, take_advance_off: false, money_back: false, cancel_money_back: false },
  } as PaymentVoucherDocument;
}

describe("paymentVoucherPrint", () => {
  it("a draft has no number, so nothing to print", () => {
    expect(paymentVoucherPrint(doc({ voucher_no: null, status: "draft" }))).toBeNull();
  });

  it("prints a line per bill, the advance and each direct line, and the three signers", () => {
    const p = paymentVoucherPrint(doc())!;
    expect(p.lines).toEqual([
      { description: "BILL-4XK2 · Supplier invoice LSW-901", amount: 1225 },
      { description: "Advance", amount: 500 },
      { description: "Transfer fee · 6500 Bank charges", amount: 1.5 },
    ]);
    expect(p.total).toBe(1726.5);
    expect(p.pay_from).toBe("1120 Bank");
    expect(p.pay_method).toBe("Bank transfer");
    expect(p.signatures).toEqual([
      { label: "Prepared By", name: "Aina", at: "2026-09-11T02:00:00Z" },
      { label: "Checked By", name: "Boon", at: "2026-09-12T03:00:00Z" },
      { label: "Approved By", name: null, at: null },
    ]);
    expect(p.cancelled).toBe(false);
  });

  it("a cancelled voucher prints marked, with its reason; no advance means no advance line", () => {
    const p = paymentVoucherPrint(doc({ status: "cancelled", cancel_reason: "Paid twice", advance_amount: "0.00" }))!;
    expect(p.cancelled).toBe(true);
    expect(p.cancel_reason).toBe("Paid twice");
    expect(p.lines.map((l) => l.description)).not.toContain("Advance");
  });
});
