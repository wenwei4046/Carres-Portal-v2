/**
 * CARD 4 — MONEY TRUTH + COLLECTION GATE · the collection clock
 * (owner ruling 2026-08-11, docs/orders/MASTER.md).
 *
 * The approved flow:
 *
 *   delivery becomes real / Stock ETA usable
 *   → begin balance collection
 *   → T−3 and T−2 working-day attention
 *   → T−1 final deadline
 *   → unpaid: hold delivery and refuse DO   (the gates — already live)
 *   → paid: delivery / DO gate may proceed
 *
 * The T−1 deadline exists because logistics commonly requests the DO the day
 * before delivery, and the DO door refuses while money holds — so a balance
 * uncollected at T−1 is a delivery about to slip.
 *
 * ONE arithmetic (Law D). "Actual dates and the working calendar, not
 * calendar-day subtraction" — the caller injects the Malaysian holiday set
 * (`myHolidaySet()`), and the week is the DELIVERY week (Mon–Sat, the same
 * default `delivery-queue.ts` counts on, because the anchor is a delivery).
 *
 * The ANCHOR is the customer's confirmed delivery date when one exists —
 * that is the day a truck moves — otherwise the promised date: collection
 * must not wait for the booking call to land (the card's own "begin balance
 * collection" precedes the confirmed appointment). No anchor → no clock —
 * a step with no anchor can never be late (the portal's own law).
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
 *  the ones before it. */
export type CollectionAttention =
  | "none" // more than 3 working days out, or no anchor
  | "t3" // 3 working days before delivery — begin pressing
  | "t2" // 2 working days before delivery
  | "t1" // the final deadline day (1 working day before delivery)
  | "late"; // past the final deadline and still owing

export interface CollectionClock {
  /** The delivery day the clock counts toward (confirmed, else promised). */
  anchorIso: IsoDate | null;
  /** The final deadline — 1 working day before the anchor. Null = no clock. */
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

  const dueIso = subtractWorkingDays(anchorIso, 1, opts);

  if (today > dueIso) {
    return { anchorIso, dueIso, attention: "late", overdue: true };
  }

  // Working days from today UP TO the anchor (exclusive of today, inclusive of
  // the anchor when it is a working day) — "T−n" in the ruling's own terms.
  const remaining = countWorkingDays(today, anchorIso, opts);
  const attention: CollectionAttention =
    remaining <= 1 ? "t1" : remaining === 2 ? "t2" : remaining === 3 ? "t3" : "none";
  return { anchorIso, dueIso, attention, overdue: false };
}
