/**
 * Reports → the three document line listings (Houzs detail-listing port, row 15).
 *
 * One row per document LINE, the document repeated on every line. Each listing
 * reads the SAME read its Register reads and stores nothing:
 *   Sales Order lines    → the Sales Orders Register's orders (rentals left out, as there)
 *   Delivery Order lines → the Delivery Orders Register's documents, THIS trip's
 *                          lines through `tripLinesOf` (cancelled documents left out)
 *   Sales Invoice lines  → the Invoices Register; an issued Sales Invoice's lines
 *                          are its order's lines (drafts, voided and storage
 *                          invoices left out)
 */
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import { displayCustomerName } from "@/lib/customer-name";
import { isRental, lineName } from "./sales-order-facts";
import { tripLinesOf } from "./delivery-orders-register";

export interface DocumentLine {
  key: string;
  /** The document's own date: Proceed date · DO date · Invoice date. */
  date: string | null;
  docNo: string;
  orderId: string;
  so: number;
  customer: string;
  item: string;
  qty: number;
  /** null = no price recorded (and always null on a Delivery Order). */
  unitPrice: number | null;
  amount: number | null;
}

type NameOf = (sku: string) => string | undefined;
type Line = { sku: string; qty: number; unit_price?: number | string | null; label?: string | null };

function linesOf(
  head: Omit<DocumentLine, "key" | "item" | "qty" | "unitPrice" | "amount">,
  keyOf: string,
  lines: readonly Line[],
  nameOf: NameOf,
  priced: boolean,
): DocumentLine[] {
  return lines.map((l, i) => {
    const unitPrice = priced && l.unit_price != null && l.unit_price !== "" ? Number(l.unit_price) : null;
    return {
      key: `${keyOf}:${i}`,
      ...head,
      item: nameOf(l.sku) ?? lineName(l),
      qty: l.qty,
      unitPrice,
      amount: unitPrice == null ? null : Math.round(unitPrice * l.qty * 100) / 100,
    };
  });
}

export function salesOrderLinesOf(orders: readonly operationOrderListRow[], nameOf: NameOf): DocumentLine[] {
  return orders.filter((o) => !isRental(o)).flatMap((o) =>
    linesOf(
      { date: o.proceeded_at ?? null, docNo: `SO-${o.so}`, orderId: o.id, so: o.so, customer: displayCustomerName(o.customer_name) },
      o.id, o.order_lines ?? [], nameOf, true,
    ));
}

export function deliveryOrderLinesOf(docs: readonly DeliveryOrderRow[], nameOf: NameOf): DocumentLine[] {
  return docs.filter((d) => !d.voided_at).flatMap((d) =>
    linesOf(
      { date: d.issued_at, docNo: d.do_number, orderId: d.orders.id, so: d.orders.so, customer: displayCustomerName(d.orders.customer_name ?? "") },
      d.id, tripLinesOf(d.orders.order_lines ?? [], d.trip_groups), nameOf, false,
    ));
}

export function salesInvoiceLinesOf(invoices: readonly InvoiceRegisterRow[], nameOf: NameOf): DocumentLine[] {
  return invoices.flatMap((r) => {
    const o = r.orders;
    if (r.kind !== "sales" || r.status !== "issued" || r.voided_at || !o) return [];
    return linesOf(
      { date: r.issued_at, docNo: r.invoice_no ?? "", orderId: r.order_id, so: o.so, customer: displayCustomerName(o.customer_name) },
      r.id, (o.order_lines ?? []).map((l) => ({ ...l, sku: l.sku ?? "" })), nameOf, true,
    );
  });
}
