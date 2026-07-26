/**
 * bookingConfirmGate — the D1 Stage-2 gate (Delivery Module, 2026-07-26).
 *
 * Frozen rule (Carres_Delivery_Module_Build_Prompt.md §7 / IMPLEMENTATION D1):
 * a booking may become CONFIRMED only when goods ready + balance ready. This is
 * the ONE copy of that question — the API confirm endpoint enforces it and the
 * drawer's Confirm button reads the same signals, so they cannot drift.
 *
 * goods ready — every goods line reads "reserved" under the SAME lineReadiness
 * rule the Items badge shows (acc always ready; core ready only when units
 * reserved to THIS SO cover the qty). Free shelf stock is "to reserve", NOT
 * ready — same as the badge (SO-1153 parity bug).
 *
 * balance ready — Outstanding (Total − Collected) is zero. Total-not-set ⇒
 * don't block, mirroring the drawer's Money rule (an AutoCount order with no
 * keyed balance can't owe a number nobody has entered).
 */
import { lineKind, stockMatchKey } from "./line-category";
import { lineReadiness } from "./line-readiness";

export interface BookingGateInput {
  /** Order lines (order_lines rows — sku + qty; service charges included, the
   *  gate skips them itself). */
  lines: { sku: string; qty: number }[];
  /** ops_order_control.line_received — GRN booked-in qty per sku. */
  lineReceived: Record<string, number> | null | undefined;
  /** Units reserved to THIS SO in ops_stock_items (status='reserved',
   *  reserved_ref='SO-<so>'), summed per stockMatchKey. */
  reservedQtyByKey: Record<string, number>;
  /** Order total: Σ order_lines + order_addons (unit_price × qty); when the
   *  lines carry no prices (AutoCount), the keyed ops_order_control.balance. */
  orderTotal: number;
  /** Σ order_payments of kind 'payment' | 'deposit'. */
  collected: number;
}

export interface BookingGateResult {
  goodsReady: boolean;
  /** Goods lines still not reserved-to-this-SO (plain skus for the 422 message). */
  notReadySkus: string[];
  balanceReady: boolean;
  outstanding: number;
  /** Both gates open. */
  ok: boolean;
}

export function bookingConfirmGate({
  lines,
  lineReceived,
  reservedQtyByKey,
  orderTotal,
  collected,
}: BookingGateInput): BookingGateResult {
  const notReadySkus: string[] = [];
  for (const l of lines) {
    if (lineKind(l.sku) === "service") continue; // 配件永不挡送货 applies to service charges; acc auto-passes below
    const reservedCount = Math.max(
      Number(lineReceived?.[l.sku] ?? 0),
      reservedQtyByKey[stockMatchKey(l.sku)] ?? 0,
    );
    const state = lineReadiness({
      sku: l.sku,
      qty: Number(l.qty || 0),
      reservedCount,
      // freeCount / hasPo only pick BETWEEN the not-ready states — they can
      // never produce "reserved", so the gate passes zeros.
      freeCount: 0,
      hasPo: false,
    });
    if (state !== "reserved") notReadySkus.push(l.sku);
  }
  // A goods-free order (pure service visit) has nothing to reserve — vacuously
  // ready. (The drawer's allReceived reads false there, but that flag feeds the
  // "completed" pipeline word, not this gate; blocking a service-only booking
  // forever would be the real bug.)
  const goodsReady = notReadySkus.length === 0;
  const totalSet = orderTotal > 0;
  const outstanding = totalSet ? Math.max(0, orderTotal - collected) : 0;
  const balanceReady = !totalSet || outstanding <= 0;
  return { goodsReady, notReadySkus, balanceReady, outstanding, ok: goodsReady && balanceReady };
}

/** Sunday is not a Delivery Working Day (frozen §4.7 / invariant #8) — the
 *  system never books one. `dateIso` = yyyy-mm-dd. */
export function isSundayIso(dateIso: string): boolean {
  return new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getUTCDay() === 0;
}
