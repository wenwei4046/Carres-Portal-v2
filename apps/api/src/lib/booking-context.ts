import { HTTPException } from "hono/http-exception";
import {
  bookingConfirmGate,
  storageHold,
  stockMatchKey,
  type BookingGateResult,
  type DeliveryGroupKey,
} from "@carres/shared";
import { mapPgError } from "./route-helpers";
import { storageSkuCategories } from "./sku-categories";

/**
 * The order's booking facts + the ONE goods/money reading of it.
 *
 * C7 extracted this from the confirm route so that route and the new
 * delivery-order route cannot answer "is this trip ready?" two different ways.
 * That is not tidiness: C5 and C9 each found the SAME number being read two
 * ways by two surfaces, one card apart, and both times the two disagreed on a
 * live order.
 *
 * Slice 2 moved it here from `order-control.ts` UNCHANGED, because automatic
 * issuance (`delivery-order-issue.ts`) has to ask the same question from the
 * finance-clear and stock-reserve doors — a second assembly of these facts in
 * either of those files would be Architecture Law D's two-arithmetics defect.
 */
export interface BookingContext {
  order: {
    id: string;
    so: number;
    paid: number | string | null;
    do_number: string | null;
    /** CARD 3 (0346) — the company currently assigned to carry this order. The
     *  appointment stamps it at confirmation; it is never re-read afterwards. */
    ops_assigned_logistic?: string | null;
    delivery_partner_id?: string | null;
  };
  control: Record<string, unknown> | null;
  lines: { sku: string; qty: number; unit_price: number | null }[];
  gate: BookingGateResult;
}
export type Loaded =
  | { ok: true; ctx: BookingContext }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { ok: false; body: any; status: any };

export async function loadBookingContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  deliverGroups: DeliveryGroupKey[] | null | undefined,
): Promise<Loaded> {
  // C5 (2026-07-27): `paid` rides this select because it is the money truth —
  // the only figure a live payment path writes. C7 adds `do_number`, which is
  // the delivery order's own completion signal.
  const { data: order, error: orderErr } = await sb
    .from("orders")
    // CARD 3 (0346): the assignment rides this select so the confirm door can
    // stamp the carrier the customer's appointment is agreed WITH.
    .select("id, so, paid, do_number, ops_assigned_logistic, delivery_partner_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    const m = mapPgError(orderErr);
    return { ok: false, body: m.body, status: m.status };
  }
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const soRef = `SO-${order.so}`;

  // C5: the `order_payments` read is GONE. It holds zero rows and no live
  // payment path writes it, so summing it made "collected" RM 0 for every
  // order and the gate refused bookings for customers who had already paid.
  const [linesRes, addonsRes, controlRes, reservedRes] = await Promise.all([
    sb.from("order_lines").select("sku, qty, unit_price").eq("order_id", orderId),
    sb.from("order_addons").select("qty, unit_price").eq("order_id", orderId),
    sb
      .from("ops_order_control")
      .select(
        // C9 — the storage columns ride this select because an uncollected
        // storage fee holds a delivery exactly as an unpaid balance does.
        "line_received, balance, booking_stage, booking_groups, confirmed_date, confirmed_time_slot, confirmed_partner_id, customer_confirmed_at, customer_confirmed_by, delivery_trips, storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status",
      )
      .eq("order_id", orderId)
      .maybeSingle(),
    sb
      .from("ops_stock_items")
      .select("sku, qty")
      .eq("status", "reserved")
      .eq("reserved_ref", soRef),
  ]);
  for (const r of [linesRes, addonsRes, controlRes, reservedRes]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return { ok: false, body: m.body, status: m.status };
    }
  }

  const lines = (linesRes.data ?? []) as {
    sku: string;
    qty: number;
    unit_price: number | null;
  }[];
  const sum = (rows: { qty: number; unit_price: number | null }[]) =>
    rows.reduce((s, r) => s + Number(r.unit_price ?? 0) * Number(r.qty ?? 0), 0);
  // C9 — the storage fee is part of the ONE money number, through the one rule
  // the ladder and the dispatch gate also ask. A manager's release lifts the
  // HOLD and leaves the fee owed, which is why the gate reads `holding`.
  const ctrl = (controlRes.data ?? null) as Record<string, unknown> | null;
  // CARD-2026-08-28 - the CATALOG owns which rate applies. One bounded read;
  // a SKU the catalog does not hold falls back to the parser, per line.
  const storageCats = await storageSkuCategories(sb, lines.map((l) => l.sku));
  const hold = storageHold({
    storageFrom: (ctrl?.storage_from as string | null) ?? null,
    override: (ctrl?.storage_fee_override as number | string | null) ?? null,
    importedMsbf: (ctrl?.storage_fee_msbf as number | string | null) ?? null,
    importedSof: (ctrl?.storage_fee_sof as number | string | null) ?? null,
    skus: lines.map((l) => l.sku),
    categories: storageCats,
    asOf: new Date().toISOString().slice(0, 10),
    collectedAt: (ctrl?.storage_collected_at as string | null) ?? null,
    waiverStatus: (ctrl?.storage_waiver_status as string | null) ?? null,
  });
  const money = {
    lineSum: sum(lines),
    addonSum: sum(
      (addonsRes.data ?? []) as { qty: number; unit_price: number | null }[],
    ),
    paid: (order as { paid?: number | string | null }).paid ?? 0,
    controlBalance: (ctrl?.balance as number | string | null) ?? null,
    storageOwing: hold.owing,
    storageReleased: hold.released,
  };
  const reservedQtyByKey: Record<string, number> = {};
  for (const u of (reservedRes.data ?? []) as { sku: string; qty: number | null }[]) {
    const k = stockMatchKey(u.sku);
    reservedQtyByKey[k] = (reservedQtyByKey[k] ?? 0) + Number(u.qty ?? 1);
  }

  const gate = bookingConfirmGate({
    lines: lines.map((l) => ({ sku: l.sku, qty: Number(l.qty || 0) })),
    lineReceived: (ctrl?.line_received as Record<string, number> | null) ?? null,
    reservedQtyByKey,
    money,
    deliverGroups,
  });
  return { ok: true, ctx: { order, control: ctrl, lines, gate } };
}
