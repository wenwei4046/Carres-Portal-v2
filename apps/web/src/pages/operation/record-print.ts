/**
 * RECORD PRINT — the ONE print flow per document, shared by its document page
 * and its register row menu (`documentRowMenu` → `Print`, owner ruling
 * 2026-10-05).
 *
 * Each function is the existing flow moved here unchanged: the same server
 * read, the same governed renderer, the same bytes, opened in a new tab where
 * the browser prints it. READ-ONLY — nothing is recorded: printing a PO here
 * is not `PO sent to supplier`, printing a DO is not a delivery result.
 */
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { fetchReceivingSessionDetail, type ReceivingSessionDetail } from "@/lib/queries";
import {
  renderCombinedSalesOrderPdf,
  renderDoPdf,
  renderGrnPdf,
  renderPoPdf,
} from "@/lib/pdf/render";
import type { DoTemplateData, PoTemplateData, SalesOrderTemplateData } from "@/lib/pdf/types";
import { grnTemplateDataOf } from "./components/grn-template-data";

/** Open a rendered document in a new tab; the tab is where it is printed. */
export function openPdfForPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Sales Orders — one governed page per order, in one PDF. Each order's data is
 * assembled server-side under RLS exactly as the single-order print does, so
 * a row the user may not read cannot enter the file.
 */
export async function printSalesOrders(rows: ReadonlyArray<{ id: string }>): Promise<void> {
  if (rows.length === 0) return;
  const bundles: SalesOrderTemplateData[] = [];
  for (const r of rows) {
    bundles.push(await apiFetch<SalesOrderTemplateData>(`/api/orders/${r.id}/sales-order-data`));
  }
  openPdfForPrint(await renderCombinedSalesOrderPdf(bundles));
}

/** The register doors (`Print N sales orders`, the row menu's `Print`): the
 *  same flow, and a failure said in words instead of thrown. */
export async function printSalesOrdersOrSay(rows: ReadonlyArray<{ id: string }>): Promise<void> {
  if (rows.length === 0) return;
  try {
    await printSalesOrders(rows);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    toast.error(`Printing ${rows.length} sales order${rows.length === 1 ? "" : "s"} failed: ${message}`);
  }
}

/** Delivery Order — a reprint carries the SAME number. */
export async function printDeliveryOrder(orderId: string, doNumber: string): Promise<void> {
  const payload = await apiFetch<DoTemplateData>(
    `/api/operation/orders/${orderId}/print-do-data?do_number=${encodeURIComponent(doNumber)}`,
  );
  openPdfForPrint(await renderDoPdf(payload));
}

/**
 * Purchase Order — the official document, the same bytes `Download PDF`
 * saves. The server refuses a cancelled PO (`po_not_printable`); the caller
 * shows that refusal in its own words, as the object page does.
 */
export async function printPurchaseOrder(poId: string): Promise<void> {
  const data = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);
  openPdfForPrint(await renderPoPdf(data));
}

/** A receiving session has paper only once it is a GRN (posted, or voided). */
export function receivingHasGrn(status: string | null | undefined): boolean {
  return status === "posted" || status === "voided";
}

/** GRN — rendered from the SAVED record, never an amend draft. */
export async function printGrn(
  sessionId: string,
  read: (id: string) => Promise<ReceivingSessionDetail> = fetchReceivingSessionDetail,
): Promise<void> {
  const detail = await read(sessionId);
  openPdfForPrint(await renderGrnPdf(grnTemplateDataOf(detail)));
}
