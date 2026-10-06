import { describe, expect, it } from "vitest";
import {
  DRAFT_DETAIL,
  INVOICES,
  OPEN_DETAIL,
  PARTIES,
  RECEIPTS,
  RECEIPT_DETAIL,
} from "@/pages/finance/other-money-in/fixtures.test-data";
import { otherDebtorInvoiceDoc, otherReceiptDoc } from "./other-money-in-docs";

describe("otherDebtorInvoiceDoc", () => {
  it("a draft has nothing final to print", () => {
    expect(otherDebtorInvoiceDoc(DRAFT_DETAIL, PARTIES[0])).toBeNull();
  });

  it("an issued invoice prints the stored party and its lines", () => {
    const doc = otherDebtorInvoiceDoc(OPEN_DETAIL, { ...PARTIES[0], address: "1 Jalan Contoh, KL", phone: "03-1234" })!;
    expect(doc.invoice_no).toBe("ARI-20260915-4821");
    expect(doc.party).toEqual({
      name: "Example Sister Sdn Bhd",
      address: "1 Jalan Contoh, KL",
      phone: "03-1234",
      registration_no: "202601000001",
    });
    expect(doc.lines).toEqual([
      { description: "Office rent September", amount: 1400 },
      { description: "Service charge", amount: 100 },
    ]);
    expect(doc.total).toBe(1500);
    expect(doc.cancelled).toBe(false);
    expect(doc.issued_by).toBe("Finance Tester");
  });

  it("a cancelled invoice prints marked, with its reason; a missing party falls back to the invoice's name", () => {
    const doc = otherDebtorInvoiceDoc(
      { ...OPEN_DETAIL, invoice: { ...OPEN_DETAIL.invoice, ...INVOICES[3] }, lines: [{ ...OPEN_DETAIL.lines[0], description: null }] },
      undefined,
    )!;
    expect(doc.cancelled).toBe(true);
    expect(doc.cancel_reason).toBe("Typed the wrong party");
    expect(doc.party.name).toBe("Example Sister Sdn Bhd");
    expect(doc.party.address).toBeNull();
    expect(doc.lines[0].description).toBe("Rent");
  });
});

describe("otherReceiptDoc", () => {
  it("maps a receipt against an invoice, with no order", () => {
    const doc = otherReceiptDoc(RECEIPT_DETAIL);
    expect(doc).toMatchObject({
      receipt_no: "RV-20260916-3390",
      order_code: null,
      customer: { name: "Example Sister Sdn Bhd" },
      amount: 600,
      method: "Bank — current account",
      kind: "ARI-20260915-4821",
      voided: false,
      payer_sign_label: "Payer signature",
    });
  });

  it("a loan in from a payer with no party prints the payer's name", () => {
    const doc = otherReceiptDoc({ ...RECEIPT_DETAIL, receipt: { ...RECEIPT_DETAIL.receipt, ...RECEIPTS[1] } });
    expect(doc.customer.name).toBe("Example Lender Bhd");
    expect(doc.kind).toBe("Loans received");
    expect(doc.amount).toBe(10000);
  });

  it("a voided receipt prints marked, with its reason", () => {
    const doc = otherReceiptDoc({ ...RECEIPT_DETAIL, receipt: { ...RECEIPT_DETAIL.receipt, ...RECEIPTS[2] } });
    expect(doc.voided).toBe(true);
    expect(doc.void_reason).toBe("Recorded twice");
  });
});
