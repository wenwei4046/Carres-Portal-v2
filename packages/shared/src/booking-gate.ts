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
 * C9 (2026-07-27) — the gate stops having a softer rule for storage. Jess: an
 * uncollected storage fee is the same as an unpaid balance, so the money
 * question is ONE number — lines + add-ons + chargeable storage − `orders.paid`
 * — and the caller passes the storage part in through `money.storageOwing`
 * (`storageHold` computes it). The gate reads `holding`, not `outstanding`: a
 * manager may RELEASE a delivery over an uncollected fee, which lifts the hold
 * and leaves the money owed, so a released order books while its collection
 * stays on the worklist.
 *
 * T8 (2026-07-27) — the gate learns DELIVERY GROUPS. Goods-ready stopped being
 * one all-or-nothing question about the whole order and became one question per
 * group (`delivery-groups.ts`): the bed set is ONE atom, the sofa is another,
 * and a trip may carry a subset — but only when the caller passes the
 * customer's answer in as `deliverGroups`. Omit it and the scope is the whole
 * order, byte-identical to the pre-T8 rule. That is what "never auto-split"
 * means in code: the split has no default.
 *
 * D9 (2026-08-08) — the gate learns to say "I cannot tell". It used to walk
 * past every groupless line, and until D9 an unrecognised SKU WAS a groupless
 * line, so the gate answered `goodsReady: true` for an order whose goods it
 * could not identify. Now an unrecognised line is collected into
 * `unknownSkus`, `goodsReady` goes false while any survive, and they are also
 * listed in `notReadySkus` so the 422 an operator already reads names them by
 * SKU instead of going silent. The gate does NOT say those goods are missing —
 * it says it cannot answer the question, and refusing to move a truck on a
 * question you cannot answer is the whole of this card.
 */
import { lineKind, stockMatchKey } from "./line-category";
import { lineReadiness } from "./line-readiness";
import {
  deliveryGroupOf,
  orderDeliveryGroups,
  unknownGoodsSkus,
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
   *  line + add-on sum, `orders.paid`, and the keyed balance for imported rows
   *  — plus, since C9, the chargeable storage fee and whether a manager has
   *  released it. There is no second, softer rule for storage. */
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
  /** Every group IN SCOPE is ready (scope = the whole order unless narrowed)
   *  AND nothing on the order is unrecognised. D9: an order carrying a SKU
   *  nothing can classify is not "ready" — the question was never answered. */
  goodsReady: boolean;
  /** In-scope goods lines still not reserved-to-this-SO (for the 422 message).
   *  D9 — `unknownSkus` are included here too, so the message an operator
   *  already gets names every line standing in the way. */
  notReadySkus: string[];
  /** D9 — lines nothing recognised. Not "missing": UNIDENTIFIED. The fix is to
   *  say what they are (catalog / keyword lists), not to raise a PO. Kept
   *  separate from `notReadySkus` so a caller can eventually tell an operator
   *  the true reason instead of "waiting for stock". */
  unknownSkus: string[];
  balanceReady: boolean;
  /** Everything still owed — goods AND storage, released or not. This is the
   *  figure a message quotes, because the customer still owes it. */
  outstanding: number;
  /** The part of it that still HOLDS this booking (C9). Lower than
   *  `outstanding` only on an order whose storage fee a manager released. */
  holding: number;
  /** Storage money still owed on this order — named separately so the 422 can
   *  say WHICH money is missing instead of one lump sum. */
  storageOwing: number;
  /** A manager released the delivery over an uncollected storage fee. */
  storageReleased: boolean;
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

  // D9 — the lines no group could hold BECAUSE nothing recognised them. These
  // are order-wide, never scoped: a trip that carries only the bed set still
  // leaves the warehouse with an item nobody can identify on the manifest.
  const unknownSkus = unknownGoodsSkus(lines);

  const inScope = groups.filter((g) => scope.includes(g.key));
  const notReadySkus = [
    ...inScope.flatMap((g) => g.notReadySkus),
    ...unknownSkus,
  ];
  // A goods-free order (pure service visit) has no groups — vacuously ready.
  // (The drawer's allReceived reads false there, but that flag feeds the
  // "completed" pipeline word, not this gate; blocking a service-only booking
  // forever would be the real bug.)
  const goodsReady = scopeValid && notReadySkus.length === 0;
  // A split needs both halves to be knowable. With an unplaceable line on the
  // order there is no honest way to say which trip it belongs on, so the
  // question is not put to the customer at all.
  const splitAvailable =
    unknownSkus.length === 0 &&
    groups.length > 1 &&
    groups.some((g) => g.ready) &&
    groups.some((g) => !g.ready);

  // Money: one function, shared with the ladder's 🔒, the drawer and the
  // collections desk. An order whose value nobody has entered is not "owing
  // everything" — it is unknown, and unknown never blocks a delivery.
  // C9: `holds`, not `owing` — a released storage fee is owed and does not hold.
  const { outstanding, holding, storageOwing, holds } = orderMoney(money);
  const balanceReady = !holds;
  return {
    goodsReady,
    notReadySkus,
    unknownSkus,
    balanceReady,
    outstanding,
    holding,
    storageOwing,
    storageReleased: money.storageReleased === true,
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
