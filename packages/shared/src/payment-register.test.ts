import { describe, expect, it } from "vitest";
import {
  paymentExceptionWord,
  paymentInvoiceNumbers,
  type PaymentRegisterRow,
} from "./payment-register";

describe("§11 history axes — invoice and exception, derived once", () => {
  function row(over: Partial<PaymentRegisterRow> = {}): PaymentRegisterRow {
    return {
      id: "p1", order_id: "o1", amount: 500, paid_on: "2026-09-08", method: "bank",
      kind: "payment", reference: null, receipt_no: "RC-1", receipt_url: null, note: null,
      recorded_by: "u1", created_at: "2026-09-08T00:00:00Z", counted_in_paid: true,
      voided_at: null, voided_by: null, void_reason: null,
      orders: { id: "o1", so: 1, customer_name: "C" },
      payment_allocations: [],
      ...over,
    } as PaymentRegisterRow;
  }

  it("lists every live allocation's invoice, deduped and in order", () => {
    const r = row({ payment_allocations: [
      { id: "a1", order_id: "o1", invoice_id: "i1", amount: 200,
        allocated_at: "2026-09-08T00:00:00Z", voided_at: null, invoices: { invoice_no: "INV-1" } },
      { id: "a2", order_id: "o2", invoice_id: "i2", amount: 300,
        allocated_at: "2026-09-08T00:01:00Z", voided_at: null, invoices: { invoice_no: "INV-2" } },
      { id: "a3", order_id: "o1", invoice_id: "i1", amount: 0,
        allocated_at: "2026-09-08T00:02:00Z", voided_at: null, invoices: { invoice_no: "INV-1" } },
    ] });
    expect(paymentInvoiceNumbers(r)).toEqual(["INV-1", "INV-2"]);
  });

  /** A corrected allocation leaves a VOIDED row behind (0450). It is not where
   *  the money sits, so it is not where the history points. */
  it("ignores a voided allocation", () => {
    const r = row({ payment_allocations: [
      { id: "a1", order_id: "o1", invoice_id: "i1", amount: 500,
        allocated_at: "2026-09-08T00:00:00Z", voided_at: "2026-09-08T01:00:00Z",
        invoices: { invoice_no: "INV-OLD" } },
      { id: "a2", order_id: "o2", invoice_id: "i2", amount: 500,
        allocated_at: "2026-09-08T01:00:00Z", voided_at: null,
        invoices: { invoice_no: "INV-NEW" } },
    ] });
    expect(paymentInvoiceNumbers(r)).toEqual(["INV-NEW"]);
  });

  it("answers with none rather than a guess when no invoice is named", () => {
    expect(paymentInvoiceNumbers(row())).toEqual([]);
    expect(paymentInvoiceNumbers(row({ payment_allocations: [
      { id: "a1", order_id: "o1", invoice_id: null, amount: 500,
        allocated_at: "2026-09-08T00:00:00Z", voided_at: null, invoices: null },
    ] }))).toEqual([]);
  });

  it("names the two exceptions a payment row can carry, and nothing else", () => {
    expect(paymentExceptionWord(row())).toBe("None");
    expect(paymentExceptionWord(row({ duplicate_acknowledged: true }))).toBe("Duplicate checked");
    expect(paymentExceptionWord(row({ voided_at: "2026-09-08" }))).toBe("Voided");
    // A voided payment that was also acknowledged reads as VOIDED — the void
    // is the state that matters to anyone reading the history.
    expect(paymentExceptionWord(row({ voided_at: "2026-09-08", duplicate_acknowledged: true })))
      .toBe("Voided");
  });
});
