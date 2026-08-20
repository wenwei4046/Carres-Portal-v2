/**
 * THE COLLECTION CLOCK (owner rulings 2026-08-11 · re-ruled 2026-08-19,
 * `docs/payment/MASTER.md` / `docs/orders/MASTER.md` §8).
 *
 * The approved flow:
 *
 *   delivery becomes real / Stock ETA usable
 *   → begin balance collection
 *   → T−3 working-day attention — chase begins
 *   → T−2 FINAL DEADLINE — money in full
 *     (or the payment-approval request is already raised)
 *   → T−1 logistics takes the DO; the trip is scheduled
 *   → T   delivery
 *
 * THE DEADLINE MOVED FROM T−1 TO T−2 on 2026-08-19: logistics takes the DO at
 * T−1, and the DO door refuses while money holds (the money gate, 0362) — so
 * the balance must already be settled BEFORE that day, not on it. A balance
 * uncollected at T−2 is a delivery about to slip.
 *
 * ONE arithmetic (Law D). "Actual dates and the working calendar, not
 * calendar-day subtraction" — the caller injects the Malaysian holiday set
 * (`myHolidaySet()`), and the week is the DELIVERY week (Mon–Sat, the same
 * default `delivery-queue.ts` counts on, because the anchor is a delivery).
 * Both consumers — the collections desk and the Work engine's dues — read
 * this one function, so the deadline cannot exist in two versions.
 *
 * The ANCHOR is the customer's confirmed delivery date when one exists —
 * that is the day a truck moves — otherwise the promised date: collection
 * must not wait for the booking call to land. No anchor → no clock — a step
 * with no anchor can never be late (the portal's own law).
 *
 * PURE — no clock, no I/O. `todayIso` is handed in.
 */

import {
  countWorkingDays,
  subtractWorkingDays,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Where the clock stands today. Ordered — each stage includes the urgency of
 *  the ones before it. `t1` is RETIRED with the 2026-08-19 ruling: one working
 *  day out is already past the deadline, which is `late`. */
export type CollectionAttention =
  | "none" // more than 3 working days out, or no anchor
  | "t3" // 3 working days before delivery — begin pressing
  | "t2" // 2 working days before delivery — THE FINAL DEADLINE DAY
  | "late"; // past the deadline and still owing (T−1, delivery day, after)

export interface CollectionClock {
  /** The delivery day the clock counts toward (confirmed, else promised). */
  anchorIso: IsoDate | null;
  /** The final deadline — 2 working days before the anchor. Null = no clock. */
  dueIso: IsoDate | null;
  attention: CollectionAttention;
  /** True exactly when `attention === "late"`. */
  overdue: boolean;
}

export function resolveCollectionAnchor(input: {
  confirmedDateIso?: string | null;
  promisedDateIso?: string | null;
}): IsoDate | null {
  const confirmed = (input.confirmedDateIso ?? "").slice(0, 10);
  if (ISO_DATE.test(confirmed)) return confirmed;
  const promised = (input.promisedDateIso ?? "").slice(0, 10);
  if (ISO_DATE.test(promised)) return promised;
  return null;
}

/**
 * The whole clock in one call. `opts` carries the holiday set (and, in tests,
 * an off-day override); the default week is Mon–Sat — the delivery week.
 */
export function collectionClock(
  input: {
    confirmedDateIso?: string | null;
    promisedDateIso?: string | null;
  },
  todayIso: string,
  opts: WorkingDayOptions = {},
): CollectionClock {
  const anchorIso = resolveCollectionAnchor(input);
  const today = todayIso.slice(0, 10);
  if (!anchorIso || !ISO_DATE.test(today)) {
    return { anchorIso, dueIso: null, attention: "none", overdue: false };
  }

  const dueIso = subtractWorkingDays(anchorIso, 2, opts);

  if (today > dueIso) {
    return { anchorIso, dueIso, attention: "late", overdue: true };
  }

  // Working days from today UP TO the anchor (exclusive of today, inclusive of
  // the anchor when it is a working day) — "T−n" in the ruling's own terms.
  // The deadline day itself is T−2; T−3 is the attention day before it.
  const remaining = countWorkingDays(today, anchorIso, opts);
  const attention: CollectionAttention =
    remaining <= 2 ? "t2" : remaining === 3 ? "t3" : "none";
  return { anchorIso, dueIso, attention, overdue: false };
}
