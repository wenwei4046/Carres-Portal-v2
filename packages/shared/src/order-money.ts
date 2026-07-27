/**
 * orderMoney — what one order still owes. THE one computation (card C5,
 * 2026-07-27).
 *
 * Before this file the portal held three readers of "outstanding" and each one
 * pointed at a different column:
 *
 *   * the ladder's 🔒 read `ops_order_control.balance` — NULL on all 55 live
 *     control rows, so the lock had never fired for anybody;
 *   * `bookingConfirmGate` read `order_payments` — 0 rows, no writer that has
 *     ever produced one, so "collected" was RM 0 and every priced order's
 *     booking was refused for money (SO-1209: value RM 7,248, `orders.paid`
 *     RM 7,248 — paid in full — and the gate said it owed the lot);
 *   * the Payments desk read `balance` minus that same empty ledger, so its
 *     whole collections queue computed RM 0 owing.
 *
 * One root cause, two opposite symptoms. The fix is not a better column — it is
 * ONE function, so the row, the drawer, the gate and the collections desk
 * cannot disagree about a number that decides whether a customer's delivery
 * goes out.
 *
 * **`orders.paid` is the money truth.** It is the only figure with live
 * writers (`top_up_order`, `record_stripe_checkout_payment`, and the AutoCount
 * import's `parsePaid`). `order_payments` is deliberately NOT read here: the
 * raw-create door writes the same deposit into BOTH stores, so summing them
 * double-counts a payment and would report a half-paid order as settled —
 * the dangerous direction. Giving that ledger a writer of the truth belongs to
 * a Payments card; until then it stays out of every gate.
 *
 * `ops_order_control.balance` means **what the customer still owes** (0165:
 * "RM the customer still owes", keyed by hand off AutoCount), NOT the order
 * total. It is the fallback for imported rows whose lines carry no prices —
 * and because it is already an outstanding, `paid` is never subtracted from it
 * a second time.
 */

export interface OrderMoneyInput {
  /** Σ `order_lines` (unit_price × qty). */
  lineSum: number;
  /** Σ `order_addons` (unit_price × qty). */
  addonSum?: number;
  /** `orders.paid` — the only money figure with a writer. */
  paid?: number | string | null;
  /** `ops_order_control.balance` (0165) — a hand-keyed OUTSTANDING, used only
   *  when the lines carry no prices. */
  controlBalance?: number | string | null;
  /** Chargeable storage neither collected nor waived. Storage has its own
   *  clock and its own collection flag, so the caller computes it and this
   *  function only carries it. */
  storageOwing?: number;
}

export interface OrderMoney {
  /** What the order is worth. `null` when nothing on record says. */
  total: number | null;
  /** What has been collected against the goods. */
  paid: number;
  /** Goods money still owed, clamped at zero. */
  goodsOwing: number;
  /** Storage money still owed (carried through, never derived here). */
  storageOwing: number;
  /** goodsOwing + storageOwing. */
  outstanding: number;
  /** Something is still owed. */
  owing: boolean;
  /** A number exists to reason about. When false NOTHING may be held: an
   *  order whose value nobody has entered cannot owe a figure nobody knows. */
  known: boolean;
  /** Which store answered — `lines` (priced), `keyed` (the imported balance),
   *  `unknown` (neither). */
  source: "lines" | "keyed" | "unknown";
}

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function orderMoney({
  lineSum,
  addonSum = 0,
  paid,
  controlBalance,
  storageOwing = 0,
}: OrderMoneyInput): OrderMoney {
  const paidNum = Math.max(0, n(paid));
  const priced = n(lineSum) + n(addonSum);
  const keyed =
    controlBalance == null || controlBalance === "" ? null : n(controlBalance);
  const storage = Math.max(0, n(storageOwing));

  let total: number | null;
  let goodsOwing: number;
  let source: OrderMoney["source"];
  if (priced > 0) {
    // Priced lines are computed from what was sold — they win over any keyed
    // number, and they are the case for every one of the 19 native orders.
    total = priced;
    goodsOwing = Math.max(0, priced - paidNum);
    source = "lines";
  } else if (keyed !== null) {
    // An imported row: the human keyed what is STILL OWED, so that figure is
    // the outstanding as it stands. The order's worth is what they have paid
    // plus what they still owe.
    goodsOwing = Math.max(0, keyed);
    total = paidNum + goodsOwing;
    source = "keyed";
  } else {
    total = null;
    goodsOwing = 0;
    source = "unknown";
  }

  const outstanding = goodsOwing + storage;
  return {
    total,
    paid: paidNum,
    goodsOwing,
    storageOwing: storage,
    outstanding,
    owing: outstanding > 0,
    known: source !== "unknown",
    source,
  };
}
