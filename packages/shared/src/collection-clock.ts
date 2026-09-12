/**
 * THE COLLECTION CLOCK (owner rulings 2026-08-11 · re-ruled 2026-08-19 ·
 * made a SETTING 2026-09-12 — `docs/payment/MASTER.md` §3 · §12,
 * `docs/orders/MASTER.md` §8).
 *
 * The approved flow:
 *
 *   delivery becomes real / Stock ETA usable
 *   → begin balance collection
 *   → ASK DAY  — `Start asking the customer to pay` (default 3 working days
 *                before Confirmed Delivery)
 *   → DEADLINE — `Payment must be complete` (default 2 working days before)
 *   → T−1 logistics takes the DO; the trip is scheduled
 *   → T   delivery
 *
 * THE TWO NUMBERS ARE `Settings → Payments → Collection timing` (owner
 * ruling 2026-09-12). They are effective-dated: a clock that already started
 * keeps the rule it started under, and a new rule affects only clocks whose
 * start falls on or after its effective date (`collectionTimingFor`). The
 * default pair is the 2026-08-19 ruling's own (3 · 2), so a caller without a
 * settings read still computes the ruled clock.
 *
 * ONE arithmetic (Law D). "Actual dates and the working calendar, not
 * calendar-day subtraction" — the caller injects the Malaysian holiday set
 * (`myHolidaySet()`), and the COUNT runs on the DELIVERY week (Mon–Sat, the
 * same default `delivery-queue.ts` counts on, because the anchor is a
 * delivery). Every consumer — the Payment Monitor, the Invoice object and the
 * Work engine's dues — reads this one function, so the deadline cannot exist
 * in two versions.
 *
 * ⭐ OPERATION HAS NO SATURDAY WORK (owner ruling 2026-09-12). The customer-
 * contact action belongs to a person who does not work on Saturday, so a
 * landed ask day or deadline that falls on Saturday, Sunday or a public
 * holiday MOVES TO THE PREVIOUS OPERATION WORKING DAY. The delivery date
 * itself stays exactly where the customer put it — a date FACT may stand on
 * a Saturday; an Operation ACTION may not.
 *
 * The ANCHOR is the customer's confirmed delivery date when one exists —
 * that is the day a truck moves — otherwise the promised date: collection
 * must not wait for the booking call to land. No anchor → no clock — a step
 * with no anchor can never be late (the portal's own law).
 *
 * PURE — no clock, no I/O. `todayIso` is handed in.
 */

import {
  isWorkingDay,
  subtractWorkingDays,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `Start asking … {ask} working days before` · `Payment must be complete
 *  {deadline} working days before`. Asking always starts EARLIER than the
 *  deadline — the Settings door validates `askDaysBefore > deadlineDaysBefore`. */
export interface CollectionTiming {
  askDaysBefore: number;
  deadlineDaysBefore: number;
}

/** The 2026-08-19 ruling's own pair — T−3 attention, T−2 deadline. */
export const DEFAULT_COLLECTION_TIMING: CollectionTiming = Object.freeze({
  askDaysBefore: 3,
  deadlineDaysBefore: 2,
});

/** One effective-dated rule row, as `Settings → Payments → Collection timing`
 *  stores it (`payment_collection_timing_rules`). */
export interface CollectionTimingRule extends CollectionTiming {
  /** ISO date the rule takes effect. */
  effectiveFrom: IsoDate;
}

/**
 * The rule a clock runs under: the NEWEST rule whose effective date is on or
 * before the day the clock started (`clockStartIso` — the invoice's issue
 * day, else today). An existing clock therefore keeps its snapshot by
 * construction: rule rows are append-only, so the answer for a past start
 * never changes when a manager adds a newer rule. No matching rule → the
 * ruled default.
 */
export function collectionTimingFor(
  rules: ReadonlyArray<CollectionTimingRule> | null | undefined,
  clockStartIso: string | null | undefined,
): CollectionTiming {
  const at = (clockStartIso ?? "").slice(0, 10);
  if (!rules || rules.length === 0 || !ISO_DATE.test(at)) return DEFAULT_COLLECTION_TIMING;
  let best: CollectionTimingRule | null = null;
  for (const rule of rules) {
    if (!ISO_DATE.test(rule.effectiveFrom) || rule.effectiveFrom > at) continue;
    if (!best || rule.effectiveFrom > best.effectiveFrom) best = rule;
  }
  if (!best) return DEFAULT_COLLECTION_TIMING;
  return { askDaysBefore: best.askDaysBefore, deadlineDaysBefore: best.deadlineDaysBefore };
}

/** Sunday AND Saturday: the OPERATION week (the office does not work Saturday). */
export const OPERATION_OFF_DAYS: readonly number[] = [0, 6];

/** Where the clock stands today. Ordered — each stage includes the urgency of
 *  the ones before it. `t1` is RETIRED with the 2026-08-19 ruling: one working
 *  day out is already past the deadline, which is `late`.
 *
 *  The names keep their 2026-08-19 spelling because every consumer reads them;
 *  their MEANING is now date-based: `t3` = on or after the ask day and before
 *  the deadline · `t2` = the deadline day itself · `late` = after it. */
export type CollectionAttention =
  | "none" // before the ask day, or no anchor
  | "t3" // the ask window — begin pressing
  | "t2" // THE FINAL DEADLINE DAY
  | "late"; // past the deadline and still owing (T−1, delivery day, after)

export interface CollectionClock {
  /** The delivery day the clock counts toward (confirmed, else promised). */
  anchorIso: IsoDate | null;
  /** The day asking starts — `askDaysBefore` working days before the anchor,
   *  moved off a non-Operation day. Null = no clock. */
  askIso: IsoDate | null;
  /** The final deadline — `deadlineDaysBefore` working days before the anchor,
   *  moved off a non-Operation day. Null = no clock. */
  dueIso: IsoDate | null;
  attention: CollectionAttention;
  /** True exactly when `attention === "late"`. */
  overdue: boolean;
  /** The pair this clock ran under — surfaced so a screen can say which rule
   *  applied and a test can prove the snapshot held. */
  timing: CollectionTiming;
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
 * The previous OPERATION working day on or before `iso`: Saturday, Sunday and
 * public holidays step back. A customer-contact action never lands on a day
 * the office is shut.
 */
export function operationActionDay(iso: IsoDate, opts: WorkingDayOptions = {}): IsoDate {
  const office: WorkingDayOptions = { holidays: opts.holidays, offDays: OPERATION_OFF_DAYS };
  let day = iso;
  let guard = 0;
  while (!isWorkingDay(day, office) && guard++ < 31) day = stepBack(day);
  return day;
}

function stepBack(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The whole clock in one call. `opts` carries the holiday set (and, in tests,
 * an off-day override for the COUNT); the default counting week is Mon–Sat —
 * the delivery week. `timing` is the effective Settings pair; absent, the
 * ruled default.
 */
export function collectionClock(
  input: {
    confirmedDateIso?: string | null;
    promisedDateIso?: string | null;
  },
  todayIso: string,
  opts: WorkingDayOptions = {},
  timing: CollectionTiming = DEFAULT_COLLECTION_TIMING,
): CollectionClock {
  const anchorIso = resolveCollectionAnchor(input);
  const today = todayIso.slice(0, 10);
  const pair: CollectionTiming = {
    askDaysBefore: Math.max(0, Math.floor(timing.askDaysBefore)),
    deadlineDaysBefore: Math.max(0, Math.floor(timing.deadlineDaysBefore)),
  };
  if (!anchorIso || !ISO_DATE.test(today)) {
    return { anchorIso, askIso: null, dueIso: null, attention: "none", overdue: false, timing: pair };
  }

  // Count on the DELIVERY week (the anchor is a delivery), then land each
  // Operation action on a day the office actually works.
  const dueIso = operationActionDay(subtractWorkingDays(anchorIso, pair.deadlineDaysBefore, opts), opts);
  const rawAsk = subtractWorkingDays(anchorIso, pair.askDaysBefore, opts);
  // Asking can never start AFTER the deadline, whatever the shift did.
  const askIso = operationActionDay(rawAsk < dueIso ? rawAsk : dueIso, opts);

  if (today > dueIso) {
    return { anchorIso, askIso, dueIso, attention: "late", overdue: true, timing: pair };
  }
  const attention: CollectionAttention =
    today >= dueIso ? "t2" : today >= askIso ? "t3" : "none";
  return { anchorIso, askIso, dueIso, attention, overdue: false, timing: pair };
}
