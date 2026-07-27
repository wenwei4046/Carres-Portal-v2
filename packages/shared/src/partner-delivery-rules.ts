/**
 * T9 · Logistic partner profiles — the rules a carrier lives by, and the
 * warning an operator gets BEFORE promising the customer a date
 * (docs/delivery-execution-queue.md T9, promotes L6; Jess 2026-07-27).
 *
 * Four facts per partner, all of them things a carrier says about itself:
 *
 *   working days      — NETS runs Mon–Sat; a partner that never runs Saturday
 *                       says so once here instead of in nine heads
 *   blackout dates    — "truck maintenance 15–18 Feb"
 *   daily capacity    — "NETS takes at most 8 drops a day"
 *   booking lead time — "we need 2 working days' notice"
 *
 * **These WARN. They never block.** A delivery date is an agreement between
 * Carres, the customer and the carrier, and the carrier is reachable by phone:
 * an operator who has already called NETS and got a yes must be able to record
 * that yes. The gates that DO refuse a confirmation are the ones about our own
 * obligations — goods reserved, balance collected, no Sunday (`booking-gate.ts`)
 * — because those are facts we own. A partner's normal working pattern is not.
 * Turning a warning into a refusal here would teach staff to enter fake dates,
 * which is worse than a date with a note against it.
 *
 * Silence over a false alarm (the T7 law): a partner with no rules recorded
 * produces NO warnings. Absent data means "we don't know", never "it's fine"
 * and never "it's broken".
 *
 * PURE — no I/O, no clock, no locale. `todayIso` and the holiday set are passed
 * in, so the API and the drawer can compute the SAME warning from the same
 * inputs (no second engine — the HR-P5 lesson), and a test can sit on any date.
 * The working-day math is delegated to `working-days.ts` (shipped with
 * procurement 2026-07-21); this module does not reimplement it.
 */

import {
  addWorkingDays,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

/** A carrier's own delivery rules. Every field is optional in the world — the
 *  defaults describe a partner nobody has configured yet. */
export interface PartnerDeliveryRules {
  /** Weekday numbers the partner does NOT run (0=Sun … 6=Sat). Default [0]:
   *  Sunday only, the Carres 6-day week. A partner that also rests Saturday
   *  carries [0, 6]. (Half-days are deliberately NOT modelled — L3 parks the
   *  per-site refinement, and half a working day has no meaning to the two
   *  questions asked here.) */
  offDays: number[];
  /** Dates the partner is not running at all — 'YYYY-MM-DD'. */
  blackoutDates: IsoDate[];
  /** Most deliveries this partner takes in one day. null = not recorded, which
   *  is NOT "unlimited" — it is "we never asked", and it stays silent. */
  dailyCapacity: number | null;
  /** WORKING days of notice the partner needs before a delivery day. 0 = will
   *  take same-day work. */
  bookingLeadDays: number;
}

/** What an unconfigured partner looks like: Sundays off (the house week) and
 *  nothing else claimed. Every field here produces zero warnings. */
export const DEFAULT_PARTNER_DELIVERY_RULES: PartnerDeliveryRules = {
  offDays: [0],
  blackoutDates: [],
  dailyCapacity: null,
  bookingLeadDays: 0,
};

export type PartnerWarningKey = "off_day" | "blackout" | "lead_time" | "capacity";

export interface PartnerBookingWarning {
  key: PartnerWarningKey;
  /** Operator-facing sentence: names the PARTNER and the FACT, never a code.
   *  (COPY-STANDARD rule 9 — a new hire must be able to act on it: every one
   *  of these ends in "call them" or "pick another day".) */
  message: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The house date law: "31 Jul 26" (COPY-STANDARD). Local to this module and
 *  pure — a calendar date has no timezone, so there is no Date math here. */
function dmy(iso: IsoDate): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  if (!y || !d || mi < 0 || mi > 11) return iso;
  return `${Number(d)} ${MONTHS[mi]} ${y.slice(2)}`;
}

function weekdayOf(iso: IsoDate): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Normalise a partial/absent profile into the full shape. A partner row that
 *  has never been edited reads exactly as DEFAULT. */
export function partnerDeliveryRules(
  raw: Partial<PartnerDeliveryRules> | null | undefined,
): PartnerDeliveryRules {
  if (!raw) return DEFAULT_PARTNER_DELIVERY_RULES;
  return {
    offDays: raw.offDays ?? DEFAULT_PARTNER_DELIVERY_RULES.offDays,
    blackoutDates: raw.blackoutDates ?? [],
    dailyCapacity: raw.dailyCapacity ?? null,
    bookingLeadDays: raw.bookingLeadDays ?? 0,
  };
}

/** True when the partner runs at all on `dateIso` (weekday + blackout). */
export function partnerRunsOn(
  rules: PartnerDeliveryRules,
  dateIso: IsoDate,
): boolean {
  const day = dateIso.slice(0, 10);
  if (rules.offDays.includes(weekdayOf(day))) return false;
  return !rules.blackoutDates.some((b) => b.slice(0, 10) === day);
}

/**
 * The earliest date this partner could take a delivery, counting its own
 * working days from today. `bookingLeadDays = 0` ⇒ today itself (if the
 * partner runs today; otherwise the next day it does).
 */
export function earliestPartnerDate(
  rules: PartnerDeliveryRules,
  todayIso: IsoDate,
  opts: WorkingDayOptions = {},
): IsoDate {
  const withPartnerWeek: WorkingDayOptions = {
    holidays: opts.holidays,
    offDays: rules.offDays,
  };
  let cur = addWorkingDays(todayIso, rules.bookingLeadDays, withPartnerWeek);
  // addWorkingDays(x, 0) returns x untouched even on a non-working day — for
  // "earliest it can take" that would name a day the partner is closed.
  let guard = 0;
  while (!partnerRunsOn(rules, cur) && guard < 370) {
    cur = addWorkingDays(cur, 1, withPartnerWeek);
    guard += 1;
  }
  return cur;
}

export interface PartnerBookingCheckInput {
  /** Shown in every message — the operator must know WHO to call. */
  partnerName: string;
  /** null / undefined = no rules recorded ⇒ no warnings (silence, not "fine"). */
  rules: PartnerDeliveryRules | null | undefined;
  /** The date being promised to the customer. */
  dateIso: IsoDate;
  /** Today, in the business's own timezone (MYT) — the caller owns that. */
  todayIso: IsoDate;
  /** Deliveries this partner ALREADY has confirmed on `dateIso`, excluding the
   *  order being booked. undefined = not counted ⇒ the capacity rule stays
   *  silent rather than guessing zero. */
  bookedOnDate?: number | null;
  /** Public holidays, injected (see `my-holidays.ts`). */
  holidays?: WorkingDayOptions["holidays"];
}

/**
 * Every reason this date is one the partner may not be able to honour, in the
 * order an operator would act on them: the day itself first (can't be fixed by
 * calling), then notice, then how full the day is.
 *
 * An empty array means "nothing known against this date" — NOT "confirmed with
 * the carrier". Only a phone call means that.
 */
export function partnerBookingWarnings({
  partnerName,
  rules,
  dateIso,
  todayIso,
  bookedOnDate,
  holidays,
}: PartnerBookingCheckInput): PartnerBookingWarning[] {
  if (!rules) return [];
  const date = dateIso.slice(0, 10);
  const today = todayIso.slice(0, 10);
  const out: PartnerBookingWarning[] = [];

  // Sunday is deliberately NOT reported here. It is refused outright for every
  // partner (booking-gate's isSundayIso / invariant #8), and an absolute rule
  // must not also arrive as a softer second voice saying "call them" — that
  // would read as though a phone call could buy a Sunday.
  if (weekdayOf(date) !== 0 && rules.offDays.includes(weekdayOf(date))) {
    out.push({
      key: "off_day",
      message: `${partnerName} does not deliver on ${WEEKDAY_NAMES[weekdayOf(date)]} — pick another day or call them`,
    });
  }
  if (rules.blackoutDates.some((b) => b.slice(0, 10) === date)) {
    out.push({
      key: "blackout",
      message: `${partnerName} is not running on ${dmy(date)} — pick another day`,
    });
  }
  if (rules.bookingLeadDays > 0 || date < today) {
    const earliest = earliestPartnerDate(rules, today, { holidays });
    if (date < earliest) {
      const notice =
        rules.bookingLeadDays > 0
          ? `${partnerName} needs ${rules.bookingLeadDays} working day${rules.bookingLeadDays === 1 ? "" : "s"} notice`
          : `${partnerName} cannot take a date in the past`;
      out.push({
        key: "lead_time",
        message: `${notice} — the earliest it can take is ${dmy(earliest)}. Call them if this date is already agreed.`,
      });
    }
  }
  if (
    rules.dailyCapacity != null &&
    bookedOnDate != null &&
    bookedOnDate >= rules.dailyCapacity
  ) {
    out.push({
      key: "capacity",
      message: `${partnerName} already has ${bookedOnDate} deliver${bookedOnDate === 1 ? "y" : "ies"} on ${dmy(date)} — its limit is ${rules.dailyCapacity} a day. Call them before promising this date.`,
    });
  }
  return out;
}
