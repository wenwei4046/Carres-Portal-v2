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
 * balance ready — Outstanding is zero. Total-not-set ⇒ don't block (an
 * AutoCount order with no keyed balance can't owe a number nobody has
 * entered).
 *
 * C5 (2026-07-27) — the money question moved out of this file into the shared
 * `orderMoney`, because the gate and the Orders ladder were each computing
 * outstanding from a different column and both were wrong: this gate summed an
 * `order_payments` ledger that holds zero rows, so a fully-paid order (SO-1209,
 * RM 7,248 paid of RM 7,248) was refused its booking for money. The gate no
 * longer decides what "collected" means — it asks the one function that does.
 *
 * T8 (2026-07-27) — the gate learns DELIVERY GROUPS. Goods-ready stopped being
 * one all-or-nothing question about the whole order and became one question per
 * group (`delivery-groups.ts`): the bed set is ONE atom, the sofa is another,
 * and a trip may carry a subset — but only when the caller passes the
 * customer's answer in as `deliverGroups`. Omit it and the scope is the whole
 * order, byte-identical to the pre-T8 rule. That is what "never auto-split"
 * means in code: the split has no default.
 */
import { lineKind, stockMatchKey } from "./line-category";
import { lineReadiness } from "./line-readiness";
import {
  deliveryGroupOf,
  orderDeliveryGroups,
  type DeliveryGroupKey,
} from "./delivery-groups";
import { orderMoney, type OrderMoneyInput } from "./order-money";

export interface BookingGateInput {
  /** Order lines (order_lines rows — sku + qty; service charges included, the
   *  gate skips them itself). */
  lines: { sku: string; qty: number }[];
  /** ops_order_control.line_received — GRN booked-in qty per sku. */
  lineReceived: Record<string, number> | null | undefined;
  /** Units reserved to THIS SO in ops_stock_items (status='reserved',
   *  reserved_ref='SO-<so>'), summed per stockMatchKey. */
  reservedQtyByKey: Record<string, number>;
  /** The order's money, as the shared `orderMoney` rule reads it (C5): the
   *  line + add-on sum, `orders.paid`, and the keyed balance for imported rows.
   *  Storage is deliberately NOT part of this gate — it has its own collection
   *  flag and its own warning; widening the booking gate is not C5's job. */
  money: OrderMoneyInput;
  /** T8 — the delivery groups THIS trip carries (the customer's wait-vs-split
   *  answer). Omit / null / undefined = the whole order, the pre-T8 rule. An
   *  empty array is NOT "everything": it is an invalid scope, refused. */
  deliverGroups?: DeliveryGroupKey[] | null;
}

/** One delivery group's own readiness — the bed set passes or fails as a unit. */
export interface BookingGroupState {
  key: DeliveryGroupKey;
  ready: boolean;
  /** This group's lines that are not reserved to the SO. */
  notReadySkus: string[];
}

export interface BookingGateResult {
  /** Every group IN SCOPE is ready (scope = the whole order unless narrowed). */
  goodsReady: boolean;
  /** In-scope goods lines still not reserved-to-this-SO (for the 422 message). */
  notReadySkus: string[];
  balanceReady: boolean;
  outstanding: number;
  /** Both gates open. */
  ok: boolean;
  /** T8 — every delivery group ON THE ORDER with its own readiness, in trip
   *  order. Empty for an accessories-only / service-only order. */
  groups: BookingGroupState[];
  /** The groups this trip carries, resolved (all of them when not narrowed). */
  scope: DeliveryGroupKey[];
  /** Groups left for a later trip — what the customer is still owed. */
  waitingGroups: DeliveryGroupKey[];
  /** A partial trip is POSSIBLE: something is ready and something is not.
   *  This is the trigger to ASK the customer — never to act. */
  splitAvailable: boolean;
  /** The requested scope is empty, or names a group this order does not have. */
  scopeValid: boolean;
}

export function bookingConfirmGate({
  lines,
  lineReceived,
  reservedQtyByKey,
  money,
  deliverGroups,
}: BookingGateInput): BookingGateResult {
  const allGroups = orderDeliveryGroups(lines);
  const notReadyByGroup = new Map<DeliveryGroupKey, string[]>();
  for (const g of allGroups) notReadyByGroup.set(g, []);
  // Lines with no group (accessory / service charge) are not "a group that
  // always passes" — they never enter the question. 配件永不挡送货.
  for (const l of lines) {
    if (lineKind(l.sku) === "service") continue;
    const group = deliveryGroupOf(l.sku);
    if (!group) continue; // accessory — back-ordered, never blocks a trip
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
    if (state !== "reserved") notReadyByGroup.get(group)?.push(l.sku);
  }
  const groups: BookingGroupState[] = allGroups.map((key) => {
    const bad = notReadyByGroup.get(key) ?? [];
    return { key, ready: bad.length === 0, notReadySkus: bad };
  });

  // Scope. Omitted ⇒ the whole order (pre-T8 behaviour). A requested scope must
  // be non-empty and may only name groups the order actually has — asking to
  // deliver a sofa an order does not contain is a bug, not a narrower trip.
  const requested = deliverGroups ?? null;
  const scopeValid =
    requested === null ||
    (requested.length > 0 && requested.every((g) => allGroups.includes(g)));
  const scope: DeliveryGroupKey[] = scopeValid && requested
    ? allGroups.filter((g) => requested.includes(g))
    : allGroups;
  const waitingGroups = allGroups.filter((g) => !scope.includes(g));

  const inScope = groups.filter((g) => scope.includes(g.key));
  const notReadySkus = inScope.flatMap((g) => g.notReadySkus);
  // A goods-free order (pure service visit) has no groups — vacuously ready.
  // (The drawer's allReceived reads false there, but that flag feeds the
  // "completed" pipeline word, not this gate; blocking a service-only booking
  // forever would be the real bug.)
  const goodsReady = scopeValid && notReadySkus.length === 0;
  const splitAvailable =
    groups.length > 1 &&
    groups.some((g) => g.ready) &&
    groups.some((g) => !g.ready);

  // Money: one function, shared with the ladder's 🔒, the drawer and the
  // collections desk. An order whose value nobody has entered is not "owing
  // everything" — it is unknown, and unknown never blocks a delivery.
  const { outstanding } = orderMoney(money);
  const balanceReady = outstanding <= 0;
  return {
    goodsReady,
    notReadySkus,
    balanceReady,
    outstanding,
    ok: goodsReady && balanceReady,
    groups,
    scope,
    waitingGroups,
    splitAvailable,
    scopeValid,
  };
}

/** Sunday is not a Delivery Working Day (frozen §4.7 / invariant #8) — the
 *  system never books one. `dateIso` = yyyy-mm-dd. */
export function isSundayIso(dateIso: string): boolean {
  return new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getUTCDay() === 0;
}
