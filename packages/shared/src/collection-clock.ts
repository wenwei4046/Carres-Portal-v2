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
 * ⭐ TWO CALENDARS, ONE CLOCK (owner ruling 2026-09-13). The PAYMENT DEADLINE
 * and the ask day are FACTS on the configured company calendar (the delivery
 * week + Malaysian holidays). The customer-contact ACTION is scheduled on the
 * resolved action owner's governed working days: when a fact day is not one
 * the owner works, the action moves to the owner's previous working day. The
 * fact itself never moves — a deadline may stand on a Saturday; an Operation
 * action may not, because Operation does not work on Saturday. That is a
 * property of the OWNER's calendar (`OWNER_CALENDAR.offDays`), not a global
 * rule: a future collection owner who works Saturdays keeps a Saturday
 * action.
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
  /** ⭐ THE OUTSTATION PAIR (PAY-04, owner ruling 2026-09-24 · stored 0672):
   *  an outstation delivery's `Payment must be complete` is 3 working days
   *  before Scheduled delivery; its ask day follows the same n > m rule and
   *  its default (4) is an engineering setting, not an owner ruling. The same
   *  one clock and calendar — only the pair differs. Absent (a rule row read
   *  before 0672, or a caller that never read Settings) ⇒ the defaults. */
  outstationAskDaysBefore?: number;
  outstationDeadlineDaysBefore?: number;
}

/** The outstation defaults: the owner's 3-day deadline, the engineering ask day 4. */
export const DEFAULT_OUTSTATION_ASK_DAYS_BEFORE = 4;
export const DEFAULT_OUTSTATION_DEADLINE_DAYS_BEFORE = 3;

/** The 2026-08-19 ruling's own pair — T−3 attention, T−2 deadline — and the
 *  2026-09-24 outstation pair (ask 4 · deadline 3). */
export const DEFAULT_COLLECTION_TIMING: CollectionTiming = Object.freeze({
  askDaysBefore: 3,
  deadlineDaysBefore: 2,
  outstationAskDaysBefore: DEFAULT_OUTSTATION_ASK_DAYS_BEFORE,
  outstationDeadlineDaysBefore: DEFAULT_OUTSTATION_DEADLINE_DAYS_BEFORE,
});

/** One effective-dated rule row, as `Settings → Payments → Collection timing`
 *  stores it (`payment_collection_timing_rules`). */
export interface CollectionTimingRule extends CollectionTiming {
  /** ISO date the rule takes effect. */
  effectiveFrom: IsoDate;
}

/** The two numbers a clock actually counts with. */
export interface CollectionPair {
  askDaysBefore: number;
  deadlineDaysBefore: number;
}

/**
 * The pair a delivery's clock counts with: the ordinary pair, or the
 * outstation pair for an outstation delivery (`isOutstation`). ONE choice, so
 * no surface can count an outstation order with the Klang Valley numbers.
 */
export function collectionPairOf(timing: CollectionTiming, outstation: boolean): CollectionPair {
  if (!outstation) return { askDaysBefore: timing.askDaysBefore, deadlineDaysBefore: timing.deadlineDaysBefore };
  return {
    askDaysBefore: timing.outstationAskDaysBefore ?? DEFAULT_OUTSTATION_ASK_DAYS_BEFORE,
    deadlineDaysBefore: timing.outstationDeadlineDaysBefore ?? DEFAULT_OUTSTATION_DEADLINE_DAYS_BEFORE,
  };
}

/** A `payment_collection_timing_rules` row as PostgREST returns it. The two
 *  outstation columns arrive with 0672; a row read before it has none. */
export interface CollectionTimingRuleRow {
  ask_days_before: number;
  deadline_days_before: number;
  outstation_ask_days_before?: number | null;
  outstation_deadline_days_before?: number | null;
  effective_from: string;
}

/** Rows → rules, ONE mapping for the Work feed, the Monitor and the screens. */
export function collectionTimingRulesOf(
  rows: ReadonlyArray<CollectionTimingRuleRow> | null | undefined,
): CollectionTimingRule[] {
  return (rows ?? []).map((r) => ({
    askDaysBefore: Number(r.ask_days_before),
    deadlineDaysBefore: Number(r.deadline_days_before),
    outstationAskDaysBefore: r.outstation_ask_days_before == null
      ? DEFAULT_OUTSTATION_ASK_DAYS_BEFORE
      : Number(r.outstation_ask_days_before),
    outstationDeadlineDaysBefore: r.outstation_deadline_days_before == null
      ? DEFAULT_OUTSTATION_DEADLINE_DAYS_BEFORE
      : Number(r.outstation_deadline_days_before),
    effectiveFrom: String(r.effective_from).slice(0, 10),
  }));
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
  return {
    askDaysBefore: best.askDaysBefore,
    deadlineDaysBefore: best.deadlineDaysBefore,
    outstationAskDaysBefore: best.outstationAskDaysBefore ?? DEFAULT_OUTSTATION_ASK_DAYS_BEFORE,
    outstationDeadlineDaysBefore: best.outstationDeadlineDaysBefore ?? DEFAULT_OUTSTATION_DEADLINE_DAYS_BEFORE,
  };
}

/** The action owner's governed working days. Sunday AND Saturday off is the
 *  OPERATION week — the calendar every Operation-held owner (the collection owner)
 *  acts on. A duty whose holder works Saturdays passes `{ offDays: [0] }`.
 *  Since 9 Oct 2026 the stored Office calendar is that week: callers pass
 *  `officeOwnerCalendar(cal)` (Settings → Office); `OPERATION_CALENDAR` is the
 *  owner-confirmed default it falls back to. */
export interface OwnerCalendar {
  /** Weekday numbers the owner does NOT work (0=Sun … 6=Sat). */
  offDays: readonly number[];
}
export const OPERATION_OFF_DAYS: readonly number[] = [0, 6];
export const OPERATION_CALENDAR: OwnerCalendar = Object.freeze({ offDays: OPERATION_OFF_DAYS });

/** Where the clock stands today. Ordered — each stage includes the urgency of
 *  the ones before it. `t1` is RETIRED with the 2026-08-19 ruling: one working
 *  day out is already past the deadline, which is `late`.
 *
 *  The names keep their 2026-08-19 spelling because every consumer reads them;
 *  their MEANING is now date-based: `t3` = on or after the ask day and before
 *  the deadline · `t2` = the deadline day itself · `late` = after it. */
export type CollectionAttention =
  | "none" // before the owner's ask day, or no anchor
  | "t3" // the owner's ask window — begin pressing
  | "t2" // the owner's deadline action day up to the deadline itself
  | "late"; // past the deadline and still owing (T−1, delivery day, after)

export interface CollectionClock {
  /** The delivery day the clock counts toward (confirmed, else promised). */
  anchorIso: IsoDate | null;
  /** The day asking starts — `askDaysBefore` working days before the anchor
   *  on the company calendar. A FACT; never moved. Null = no clock. */
  askIso: IsoDate | null;
  /** The final deadline — `deadlineDaysBefore` working days before the anchor
   *  on the company calendar. A FACT; never moved. Null = no clock. */
  dueIso: IsoDate | null;
  /** The day the OWNER acts on the ask — `askIso`, or the owner's previous
   *  working day when the owner does not work that day. Null = no clock. */
  actionAskIso: IsoDate | null;
  /** The day the OWNER must have collected — `dueIso`, or the owner's previous
   *  working day. This is the Work item's due date. Null = no clock. */
  actionDueIso: IsoDate | null;
  attention: CollectionAttention;
  /** True exactly when `attention === "late"`. */
  overdue: boolean;
  /** The pair this clock ran under — surfaced so a screen can say which rule
   *  applied and a test can prove the snapshot held. For an outstation
   *  delivery it is the outstation pair. */
  timing: CollectionPair;
  /** True when the outstation pair was counted. */
  outstation: boolean;
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
 * The owner's previous working day on or before `iso`: the owner's off days
 * and public holidays step back. A customer-contact action never lands on a
 * day its owner does not work.
 */
export function ownerActionDay(
  iso: IsoDate,
  opts: WorkingDayOptions = {},
  owner: OwnerCalendar = OPERATION_CALENDAR,
): IsoDate {
  const week: WorkingDayOptions = { holidays: opts.holidays, offDays: owner.offDays };
  let day = iso;
  let guard = 0;
  while (!isWorkingDay(day, week) && guard++ < 31) day = stepBack(day);
  return day;
}

/** The Operation week's action day — `ownerActionDay` with the Operation calendar. */
export function operationActionDay(iso: IsoDate, opts: WorkingDayOptions = {}): IsoDate {
  return ownerActionDay(iso, opts, OPERATION_CALENDAR);
}

function stepBack(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The whole clock in one call. `opts` carries the holiday set (and, in tests,
 * an off-day override for the COMPANY count); the default counting week is
 * Mon–Sat — the delivery week. The holiday set is the Office holiday list
 * (Settings → Office, `officeWorkingDayOptions(cal).holidays`) — the one
 * stored list. `timing` is the effective Settings pair; absent, the ruled
 * default. `input.outstation` picks the outstation pair (`collectionPairOf`).
 * `owner` is the action owner's governed working days — the Office calendar
 * (`officeOwnerCalendar`); absent, the Operation week.
 */
export function collectionClock(
  input: {
    confirmedDateIso?: string | null;
    promisedDateIso?: string | null;
    /** The delivery is outstation (`isOutstation`): count the outstation pair. */
    outstation?: boolean;
  },
  todayIso: string,
  opts: WorkingDayOptions = {},
  timing: CollectionTiming = DEFAULT_COLLECTION_TIMING,
  owner: OwnerCalendar = OPERATION_CALENDAR,
): CollectionClock {
  const anchorIso = resolveCollectionAnchor(input);
  const today = todayIso.slice(0, 10);
  const outstation = input.outstation === true;
  const chosen = collectionPairOf(timing, outstation);
  const pair: CollectionPair = {
    askDaysBefore: Math.max(0, Math.floor(chosen.askDaysBefore)),
    deadlineDaysBefore: Math.max(0, Math.floor(chosen.deadlineDaysBefore)),
  };
  if (!anchorIso || !ISO_DATE.test(today)) {
    return {
      anchorIso, askIso: null, dueIso: null, actionAskIso: null, actionDueIso: null,
      attention: "none", overdue: false, timing: pair, outstation,
    };
  }

  // The FACTS, on the company calendar.
  const dueIso = subtractWorkingDays(anchorIso, pair.deadlineDaysBefore, opts);
  const rawAsk = subtractWorkingDays(anchorIso, pair.askDaysBefore, opts);
  const askIso = rawAsk < dueIso ? rawAsk : dueIso;
  // The ACTIONS, on the owner's working days.
  const actionDueIso = ownerActionDay(dueIso, opts, owner);
  const rawActionAsk = ownerActionDay(askIso, opts, owner);
  const actionAskIso = rawActionAsk < actionDueIso ? rawActionAsk : actionDueIso;

  if (today > dueIso) {
    return { anchorIso, askIso, dueIso, actionAskIso, actionDueIso, attention: "late", overdue: true, timing: pair, outstation };
  }
  const attention: CollectionAttention =
    today >= actionDueIso ? "t2" : today >= actionAskIso ? "t3" : "none";
  return { anchorIso, askIso, dueIso, actionAskIso, actionDueIso, attention, overdue: false, timing: pair, outstation };
}
