// design-standard: not-a-list-page — the existing print flows, shared by a document page and its row menu.
/**
 * Print, ONE flow per paper (ONE ROW MENU, UI MASTER §6.7 rule 5: Print runs
 * the record's EXISTING print flow, the same renderer and the same bytes its
 * page prints). The document page and the row menu's `Print` both call these;
 * the row menu first reads the document through its own detail query. Nothing
 * is recorded.
 */
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PaymentVoucherDocument } from "@carres/shared/schemas/finance-ap";
import type { OtherDebtorInvoiceDetail, OtherDebtorPartyRow, OtherReceiptDetail } from "@carres/shared/other-money-in";
import { voucherQuery } from "@/lib/payables-queries";
import { otherDebtorInvoiceDoc, otherReceiptDoc } from "@/lib/pdf/other-money-in-docs";
import { paymentVoucherPrint } from "../payables/voucher-print";
import { invoiceQuery, partiesQuery, receiptQuery } from "../other-money-in/api";

async function openPdf(make: () => Promise<Blob>, what: string): Promise<void> {
  try {
    window.open(URL.createObjectURL(await make()), "_blank", "noopener");
  } catch (e) {
    toast.error(`${what} could not be opened: ${(e as Error).message}`);
  }
}

/** A voucher's paper; a draft has none (no number to sign). */
export async function printVoucher(doc: PaymentVoucherDocument): Promise<void> {
  const printable = paymentVoucherPrint(doc);
  if (!printable) return;
  await openPdf(async () => {
    const { renderPaymentVoucherPdf } = await import("@/lib/pdf/render");
    return renderPaymentVoucherPdf(printable);
  }, "The voucher");
}

export async function printOtherDebtorInvoice(detail: OtherDebtorInvoiceDetail, party: OtherDebtorPartyRow | undefined): Promise<void> {
  const doc = otherDebtorInvoiceDoc(detail, party);
  if (!doc) return;
  await openPdf(async () => {
    const { renderOtherDebtorInvoicePdf } = await import("@/lib/pdf/render");
    return renderOtherDebtorInvoicePdf(doc);
  }, "The invoice");
}

export async function printOtherReceipt(detail: OtherReceiptDetail): Promise<void> {
  await openPdf(async () => {
    const { renderReceiptPdf } = await import("@/lib/pdf/render");
    return renderReceiptPdf(otherReceiptDoc(detail));
  }, "The receipt");
}

/* ── from a row: read the document first, then the same flow ─────────────── */

export async function printVoucherById(qc: QueryClient, id: string): Promise<void> {
  try {
    await printVoucher(await qc.fetchQuery(voucherQuery(id)));
  } catch (e) {
    toast.error(`The voucher could not be opened: ${(e as Error).message}`);
  }
}

export async function printOtherDebtorInvoiceById(qc: QueryClient, id: string): Promise<void> {
  try {
    const [detail, parties] = await Promise.all([qc.fetchQuery(invoiceQuery(id)), qc.fetchQuery(partiesQuery())]);
    await printOtherDebtorInvoice(detail, parties.find((p) => p.party_id === detail.invoice.party_id));
  } catch (e) {
    toast.error(`The invoice could not be opened: ${(e as Error).message}`);
  }
}

export async function printOtherReceiptById(qc: QueryClient, id: string): Promise<void> {
  try {
    await printOtherReceipt(await qc.fetchQuery(receiptQuery(id)));
  } catch (e) {
    toast.error(`The receipt could not be opened: ${(e as Error).message}`);
  }
}
