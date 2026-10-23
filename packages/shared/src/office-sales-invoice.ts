/**
 * OFFICE NEW SALES INVOICE — what the dialog ticks and adds up.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * office staff open a Sales Invoice by hand, part invoices included, the Houzs
 * way (SalesInvoiceFromDo.tsx). Overturns Jess's payment/MASTER.md rules (no
 * manual Generate invoice; one live Sales Invoice per order); Jess was not
 * part of this decision. The database (0712) decides what may be billed; this
 * only prefills and previews.
 *
 * PURE: no I/O.
 */
import { deliveryGroupOf } from "./delivery-groups";

export type OfficeInvoiceLine = {
  order_line_id: string;
  sku: string;
  qty: number;
  unit_price: number;
  invoiced: number;
  left: number;
};
export type OfficeInvoiceAddon = { addon_key: string; qty: number; unit_price: number };
export type OfficeInvoicePick = { picked: boolean; qty: number };

/**
 * The first ticks. Found by a Delivery Order: the lines that DO carries (its
 * delivery groups; a whole-order DO carries every line). Found by a Sales
 * Order (`doGroups` undefined): every line. Each at what is left to invoice;
 * a line with nothing left is never ticked.
 */
export function officeInvoicePrefill(
  lines: readonly OfficeInvoiceLine[],
  doGroups?: readonly string[] | null,
): Record<string, OfficeInvoicePick> {
  const onDo = (sku: string) => {
    if (doGroups === undefined || doGroups === null || doGroups.length === 0) return true;
    const g = deliveryGroupOf(sku);
    return g !== null && doGroups.includes(g);
  };
  return Object.fromEntries(lines.map((l) => [
    l.order_line_id,
    { picked: l.left > 0 && onDo(l.sku), qty: Math.max(0, l.left) },
  ]));
}

/** The invoice total in sen: picked lines at their price, plus the order's
 *  add-ons when this is the order's first office invoice. */
export function officeInvoiceTotalSen(
  lines: readonly OfficeInvoiceLine[],
  picks: Record<string, OfficeInvoicePick>,
  addons: readonly OfficeInvoiceAddon[],
  addonsPending: boolean,
): number {
  const sen = (qty: number, price: number) => Math.round(qty * price * 100);
  const goods = lines.reduce((s, l) => {
    const p = picks[l.order_line_id];
    return p?.picked && p.qty > 0 ? s + sen(p.qty, l.unit_price) : s;
  }, 0);
  return goods + (addonsPending ? addons.reduce((s, a) => s + sen(a.qty, a.unit_price), 0) : 0);
}

/** The picks the door takes: ticked lines with a quantity of 1 up to what is left. */
export function officeInvoicePicks(
  lines: readonly OfficeInvoiceLine[],
  picks: Record<string, OfficeInvoicePick>,
): Array<{ orderLineId: string; qty: number }> | null {
  const out: Array<{ orderLineId: string; qty: number }> = [];
  for (const l of lines) {
    const p = picks[l.order_line_id];
    if (!p?.picked) continue;
    if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > l.left) return null;
    out.push({ orderLineId: l.order_line_id, qty: p.qty });
  }
  return out.length > 0 ? out : null;
}
