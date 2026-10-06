/**
 * Turns the "other money in" reads (migration 0478) into PDF payloads.
 * The invoice prints from its detail read plus the party record it bills;
 * the receipt prints from its detail read on the shared receipt template.
 */
import type { OtherDebtorInvoiceDetail, OtherDebtorPartyRow, OtherReceiptDetail } from "@carres/shared/other-money-in";
import type { OtherDebtorInvoiceTemplateData, ReceiptTemplateData } from "./types";

/** Null for a draft: it has no number, so there is nothing final to print. */
export function otherDebtorInvoiceDoc(
  detail: OtherDebtorInvoiceDetail,
  party: Pick<OtherDebtorPartyRow, "name" | "address" | "phone" | "registration_no"> | undefined,
): OtherDebtorInvoiceTemplateData | null {
  const inv = detail.invoice;
  if (inv.status === "draft" || !inv.invoice_no) return null;
  return {
    invoice_no: inv.invoice_no,
    issue_date: inv.invoice_date,
    due_date: inv.due_date,
    reference: inv.reference,
    narration: inv.narration,
    party: {
      name: party?.name ?? inv.party_name,
      address: party?.address ?? null,
      phone: party?.phone ?? null,
      registration_no: party?.registration_no ?? null,
    },
    lines: detail.lines.map((l) => ({ description: l.description ?? l.account_name, amount: Number(l.amount) })),
    total: Number(inv.total_amount),
    currency: "RM",
    cancelled: inv.status === "cancelled",
    cancel_reason: inv.cancel_reason,
    issued_by: inv.issued_by_name,
  };
}

export function otherReceiptDoc(detail: OtherReceiptDetail): ReceiptTemplateData {
  const r = detail.receipt;
  return {
    receipt_no: r.receipt_no,
    issue_date: r.receipt_date,
    order_code: null,
    customer: { name: r.party_name ?? r.payer_name },
    amount: Number(r.total_amount),
    method: r.money_account_name,
    kind: r.what ?? detail.lines.map((l) => l.account_name).join(", "),
    reference: r.reference,
    note: r.narration,
    currency: "RM",
    voided: r.status === "voided",
    void_reason: r.void_reason,
    payer_sign_label: "Payer signature",
  };
}
