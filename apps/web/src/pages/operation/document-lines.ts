/**
 * Reports → the three document line listings (Houzs detail-listing port, row 15).
 *
 * One row per document LINE, the document repeated on every line. Each listing
 * reads the SAME read its Register reads and stores nothing:
 *   Sales Order lines    → the Sales Orders Register's orders (rentals left out, as there)
 *                          — add-ons follow the goods as their own priced lines
 *   Delivery Order lines → the Delivery Orders Register's documents, THIS trip's
 *                          lines through `tripLinesOf` (cancelled documents left out)
 *   Sales Invoice lines  → the Invoices Register; an issued Sales Invoice's lines
 *                          are ITS OWN, frozen in its issue snapshot. Follows
 *                          Houzs backend/src/scm/routes/reports.ts:396,502-528
 *                          and lib/si-from-do.ts:206 (`sales_invoice_items`) per
 *                          Weisiang's ruling (2026-10-22): clear Carres rules,
 *                          implement Houzs; YH chose this (2026-10-26).
 *                          When the snapshot holds none (dispatch-issued or
 *                          pre-0429 invoices) the order's live lines stand in
 *                          and each such row says `linesFrom: "order"`.
 *                          Drafts, voided and storage invoices left out.
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
  /** Sales invoice lines only: "invoice" = the invoice's own snapshot line;
   *  "order" = the order's line as it is today (no snapshot line exists). */
  linesFrom?: "invoice" | "order";
}

type NameOf = (sku: string) => string | undefined;
type Line = { sku: string; qty: number | string; unit_price?: number | string | null; label?: string | null; name?: string };
type Addon = { addon_key?: string | null; qty: number | string; unit_price?: number | string | null };

/** Each add-on as its own priced line after the goods, as Houzs prints every
 *  charge as a document line — so Amount totals what the document asks for. */
const addonLines = (addons: readonly Addon[] | null | undefined, addonName: NameOf): Line[] =>
  (addons ?? []).map((a) => {
    const key = a.addon_key ?? "";
    return { sku: key, qty: a.qty, unit_price: a.unit_price, name: addonName(key) ?? key };
  });

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
      item: l.name ?? nameOf(l.sku) ?? lineName(l),
      qty: Number(l.qty),
      unitPrice,
      amount: unitPrice == null ? null : Math.round(unitPrice * Number(l.qty) * 100) / 100,
    };
  });
}

export function salesOrderLinesOf(orders: readonly operationOrderListRow[], nameOf: NameOf, addonName: NameOf): DocumentLine[] {
  return orders.filter((o) => !isRental(o)).flatMap((o) =>
    linesOf(
      { date: o.proceeded_at ?? null, docNo: `SO-${o.so}`, orderId: o.id, so: o.so, customer: displayCustomerName(o.customer_name) },
      o.id, [...(o.order_lines ?? []), ...addonLines(o.order_addons, addonName)], nameOf, true,
    ));
}

export function deliveryOrderLinesOf(docs: readonly DeliveryOrderRow[], nameOf: NameOf): DocumentLine[] {
  return docs.filter((d) => !d.voided_at).flatMap((d) =>
    linesOf(
      { date: d.issued_at, docNo: d.do_number, orderId: d.orders.id, so: d.orders.so, customer: displayCustomerName(d.orders.customer_name ?? "") },
      d.id, tripLinesOf(d.orders.order_lines ?? [], d.trip_groups), nameOf, false,
    ));
}

export function salesInvoiceLinesOf(invoices: readonly InvoiceRegisterRow[], nameOf: NameOf, addonName: NameOf): DocumentLine[] {
  return invoices.flatMap((r) => {
    const o = r.orders;
    if (r.kind !== "sales" || r.status !== "issued" || r.voided_at || !o) return [];
    const snapGoods = Array.isArray(r.snapshot_lines) ? r.snapshot_lines : null;
    // 0712 office invoices always freeze their add-ons (possibly none); a
    // whole-order snapshot (0429/0476) froze goods only, so its add-ons are live.
    const snapAddons = Array.isArray(r.snapshot_addons) ? r.snapshot_addons
      : r.snapshot_from === "office" ? [] : null;
    const tag = (from: "invoice" | "order") => (l: Line) => ({ line: l, from });
    const tagged = [
      ...(snapGoods ?? o.order_lines ?? []).map((l) => ({ ...l, sku: l.sku ?? "" })).map(tag(snapGoods ? "invoice" : "order")),
      ...addonLines(snapAddons ?? o.order_addons, addonName).map(tag(snapAddons ? "invoice" : "order")),
    ];
    const rows = linesOf(
      { date: r.issued_at, docNo: r.invoice_no ?? "", orderId: r.order_id, so: o.so, customer: displayCustomerName(o.customer_name) },
      r.id, tagged.map((t) => t.line), nameOf, true,
    );
    return rows.map((row, i) => ({ ...row, linesFrom: tagged[i]!.from }));
  });
}
