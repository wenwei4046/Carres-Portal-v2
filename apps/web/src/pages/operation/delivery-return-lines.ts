/**
 * Reports → Delivery return lines: one row per Delivery Return line, the return
 * repeated on every line. Reads the Delivery Returns list (0716) and stores
 * nothing. Follows Houzs frontend/src/pages/scm-v2/DeliveryReturnDetailListing.tsx:1-6,32-137
 * and backend/src/scm/routes/reports.ts:606-680 per Weisiang's ruling
 * (2026-10-22): clear Carres rules, implement Houzs.
 */
import { displayCustomerName } from "@/lib/customer-name";

export type ReturnCondition = "NEW" | "OPENED" | "DAMAGED" | "DEFECTIVE";

/** One Delivery Return as `GET /api/operation/delivery-returns` returns it. */
export type DeliveryReturnRow = {
  id: string; return_no: string; created_at: string; received_at: string | null; reason: string;
  refund_status: string; refund_status_at: string | null;
  warehouses: { name: string } | null;
  ops_delivery_orders: { do_number: string } | null;
  orders: { so: number; customer_name: string } | null;
  delivery_return_units: { unit_price: number | string; refund: number | string; condition: ReturnCondition; ops_stock_items: { unit_code: string; sku: string } | null }[];
  delivery_return_lines?: { qty_returned: number; unit_price: number | string; refund: number | string; condition: ReturnCondition; order_lines: { sku: string } | null }[];
};

export interface ReturnLine {
  key: string;
  date: string;
  docNo: string;
  doNo: string;
  so: number;
  customer: string;
  reason: string;
  sku: string;
  item: string;
  /** Unit IDs returned on this line; empty when the return was by DO line and qty. */
  units: string[];
  condition: ReturnCondition;
  qty: number;
  unitPrice: number;
  lineRefund: number;
  site: string;
  receivedAt: string | null;
  /** The refund date: the Refund status date once it is Refunded. */
  refundedAt: string | null;
  /** The whole return's refund while its Refund status is Pending, else 0 (Houzs reports.ts:660-666). */
  pendingRefund: number;
  refundStatus: string;
}

type NameOf = (sku: string) => string | undefined;
const money = (v: number | string) => Number(v) || 0;

/**
 * A return by Unit stores one row per Unit; Units with the same SKU, price and
 * condition fold into one line, Qty = Units returned. A return by DO line keeps
 * its lines. Pending Refund repeats the return's refund total on each of its
 * lines while Pending, as Houzs does (reports.ts:647-666), so it is not summed.
 */
export function deliveryReturnLinesOf(returns: readonly DeliveryReturnRow[], nameOf: NameOf): ReturnLine[] {
  return returns.flatMap((r) => {
    const groups = new Map<string, { sku: string; condition: ReturnCondition; unitPrice: number; qty: number; refund: number; units: string[] }>();
    for (const u of r.delivery_return_units ?? []) {
      if (!u.ops_stock_items) continue;
      const sku = u.ops_stock_items.sku;
      const key = `${sku}|${money(u.unit_price)}|${u.condition}`;
      const g = groups.get(key) ?? { sku, condition: u.condition, unitPrice: money(u.unit_price), qty: 0, refund: 0, units: [] };
      g.qty += 1;
      g.refund += money(u.refund);
      g.units.push(u.ops_stock_items.unit_code);
      groups.set(key, g);
    }
    const lines = [
      ...groups.values(),
      ...(r.delivery_return_lines ?? []).map((l) => ({
        sku: l.order_lines?.sku ?? "", condition: l.condition, unitPrice: money(l.unit_price),
        qty: l.qty_returned, refund: money(l.refund), units: [] as string[],
      })),
    ];
    const total = Math.round(lines.reduce((t, l) => t + l.refund, 0) * 100) / 100;
    const pending = r.refund_status === "pending" ? total : 0;
    return lines.map((g, i) => ({
      key: `${r.id}:${i}`,
      date: r.created_at,
      docNo: r.return_no,
      doNo: r.ops_delivery_orders?.do_number ?? "",
      so: r.orders?.so ?? 0,
      customer: displayCustomerName(r.orders?.customer_name ?? ""),
      reason: r.reason,
      sku: g.sku,
      item: nameOf(g.sku) ?? g.sku,
      units: [...g.units].sort(),
      condition: g.condition,
      qty: g.qty,
      unitPrice: g.unitPrice,
      lineRefund: Math.round(g.refund * 100) / 100,
      site: r.warehouses?.name ?? "",
      receivedAt: r.received_at,
      refundedAt: r.refund_status === "refunded" ? r.refund_status_at : null,
      pendingRefund: pending,
      refundStatus: r.refund_status,
    }));
  });
}
