import type { PaymentVoucherDocument } from "@carres/shared/schemas/finance-ap";
import type { PaymentVoucherTemplateData } from "@/lib/pdf/types";
import { PAY_METHOD_WORD, num, word } from "./payables-words";

/**
 * The payment voucher's PDF payload, from `payment_voucher_document`. Null for
 * a draft: it has no number yet, so there is nothing to sign. One printed line
 * per bill paid, one for the advance, one per direct line.
 */
export function paymentVoucherPrint(doc: PaymentVoucherDocument): PaymentVoucherTemplateData | null {
  const v = doc.voucher;
  if (!v.voucher_no) return null;
  const advance = num(v.advance_amount) ?? 0;
  const day = (at: string | null) => (at ? at.slice(0, 10) : null);
  return {
    voucher_no: v.voucher_no,
    voucher_date: v.voucher_date,
    payee: v.payee_name,
    supplier: v.supplier_name,
    pay_from: `${v.pay_from_account_code} ${v.pay_from_name ?? ""}`.trim(),
    pay_method: word(PAY_METHOD_WORD, v.pay_method),
    reference: v.pay_reference,
    narration: v.narration,
    lines: [
      ...doc.allocations.map((a) => ({
        description: `${a.bill_no ?? "Draft bill"} · Supplier invoice ${a.supplier_invoice_no}`,
        amount: num(a.amount_applied) ?? 0,
      })),
      ...(advance > 0 ? [{ description: "Advance", amount: advance }] : []),
      ...doc.lines.map((l) => ({
        description: `${l.description ?? "No description"} · ${l.account_code} ${l.account_name ?? ""}`.trim(),
        amount: num(l.amount) ?? 0,
      })),
    ],
    total: num(v.amount) ?? 0,
    cancelled: v.status === "cancelled",
    cancel_reason: v.cancel_reason,
    signatures: [
      { label: "Prepared By", name: v.prepared_by_name, at: day(v.prepared_at) },
      { label: "Checked By", name: v.checked_by_name, at: day(v.checked_at) },
      { label: "Approved By", name: v.approved_by_name, at: day(v.approved_at) },
    ],
  };
}
