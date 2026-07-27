/**
 * T10 · Delivery calendar as the single source
 * (docs/delivery-execution-queue.md T10, promotes L2; Jess 2026-07-27).
 *
 * A delivery calendar answers ONE question: **which trucks move on which day.**
 * The card's law is "reading the SAME booking fields — never a second store",
 * and that law had already been broken before this card was written: the
 * right-rail Calendar's Deliveries lens bucketed orders by
 * `orders.delivery_date` — the date we PROMISED the customer — while the truth
 * about a truck has lived in the D1 booking since 0277 (`booking_stage` +
 * `confirmed_date`, with `logistic_eta` as the carrier's provisional word).
 * Those two dates are the same number only until someone reschedules, which is
 * the entire reason D1 split them. So this module does not invent a calendar;
 * it names the rule that decides which day an order sits on, and both the
 * calendar and the Orders list's Delivery column now read it.
 *
 * The promise is NOT deleted from the screen — a day with an order promised on
 * it and nothing booked is real work. It is simply not a delivery, so it never
 * counts as one; it is listed as what it is, with the call that fixes it.
 *
 * PURE — no I/O, no clock, no locale. `todayIso` is always passed in (the
 * caller owns the timezone question; MYT for this business), so a test can sit
 * on any date. Same shape as `delivery-queue.ts` (T7) and
 * `partner-delivery-rules.ts` (T9), which this module reads rather than
 * reimplements.
 */

import type { IsoDate } from "./working-days";
import { partnerRunsOn, type PartnerDeliveryRules } from "./partner-delivery-rules";

/** How solid a day is: the customer said yes · only the carrier said a date ·
 *  nothing booked at all. */
export type BookingKind = "confirmed" | "provisional" | "none";

/** The four booking fields, named once. Everything optional so a browser on
 *  this build against an older Worker degrades to the provisional reading
 *  instead of crashing (the T1 rule). */
export interface BookingRead {
  stage?: "none" | "provisional" | "confirmed" | null;
  confirmedDate?: string | null;
  confirmedSlot?: string | null;
  /** The carrier's own date — `ops_order_control.logistic_eta` (Stage 1). */
  provisionalDate?: string | null;
}

export interface BookingDay {
  kind: BookingKind;
  /** The day this order's truck moves — null when nothing is booked. */
  date: IsoDate | null;
  /** The customer's time slot; only ever present on a confirmed booking. */
  slot: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(raw: string | null | undefined): IsoDate | null {
  if (!raw) return null;
  const d = raw.slice(0, 10);
  return ISO_DATE.test(d) ? d : null;
}

/**
 * THE booking read — which day, and how solid.
 *
 * Confirmed requires the stage word AND its date together (D1 invariant #1: the
 * stage word alone is never trusted without a date). Otherwise the carrier's
 * provisional date stands. No date anywhere ⇒ `none`, and a `none` order is
 * absent from the calendar's day counts — it is not a truck, it is a queue item.
 */
export function bookingDayOf(read: BookingRead | null | undefined): BookingDay {
  const confirmed = asDate(read?.confirmedDate);
  if (read?.stage === "confirmed" && confirmed) {
    return { kind: "confirmed", date: confirmed, slot: read.confirmedSlot ?? null };
  }
  const provisional = asDate(read?.provisionalDate);
  if (provisional) return { kind: "provisional", date: provisional, slot: null };
  return { kind: "none", date: null, slot: null };
}

// ---------------------------------------------------------------------------
// Ranges — Today / Tomorrow / This week
// ---------------------------------------------------------------------------

export type DeliveryRangeKey = "today" | "tomorrow" | "week";

export interface DeliveryRange {
  key: DeliveryRangeKey;
  label: string;
  /** Inclusive, both ends. */
  fromIso: IsoDate;
  toIso: IsoDate;
}

export const DELIVERY_RANGE_KEYS = ["today", "tomorrow", "week"] as const;

const RANGE_LABEL: Record<DeliveryRangeKey, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
};

function weekdayOf(iso: IsoDate): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Step a calendar date by n days, staying on the calendar. */
export function shiftDays(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Every day from `fromIso` to `toIso` inclusive (empty when the range inverts). */
export function daysInRange(fromIso: IsoDate, toIso: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = fromIso.slice(0, 10);
  const end = toIso.slice(0, 10);
  // 400 = a year's guard against a malformed range spinning forever.
  while (cur <= end && out.length < 400) {
    out.push(cur);
    cur = shiftDays(cur, 1);
  }
  return out;
}

/**
 * The three views the card names.
 *
 * **This week = the REST of this week**, today through the coming Saturday —
 * not a Mon–Sun block. An operator asking "what's left this week" is asking
 * what is still ahead of them, and Sunday is not a delivery day at all (the
 * booking gate refuses it for every carrier), so the week ends on Saturday. On
 * a Sunday, "this week" is the Mon–Sat that starts tomorrow: there is nothing
 * left of a week that is already over.
 */
export function deliveryRange(key: DeliveryRangeKey, todayIso: string): DeliveryRange {
  const today = todayIso.slice(0, 10);
  const label = RANGE_LABEL[key];
  if (key === "today") return { key, label, fromIso: today, toIso: today };
  if (key === "tomorrow") {
    const t = shiftDays(today, 1);
    return { key, label, fromIso: t, toIso: t };
  }
  const dow = weekdayOf(today);
  // Sunday (0): the week ahead is tomorrow's Mon → its Sat. Otherwise: today
  // (Mon=1 … Sat=6) → the Saturday of this same week.
  const from = dow === 0 ? shiftDays(today, 1) : today;
  const to = dow === 0 ? shiftDays(today, 6) : shiftDays(today, 6 - dow);
  return { key, label, fromIso: from, toIso: to };
}

/** Is this day inside the range (both ends inclusive)? */
export function inRange(dateIso: string, range: DeliveryRange): boolean {
  const d = dateIso.slice(0, 10);
  return d >= range.fromIso && d <= range.toIso;
}

/** The day's own word, for a heading: `Today` · `Tomorrow` · else null (the
 *  caller prints the date, which is the house form — never a bare weekday). */
export function dayWord(dateIso: string, todayIso: string): string | null {
  const d = dateIso.slice(0, 10);
  const t = todayIso.slice(0, 10);
  if (d === t) return "Today";
  if (d === shiftDays(t, 1)) return "Tomorrow";
  return null;
}

// ---------------------------------------------------------------------------
// Carrier load on a day — T9's rules, shown where the day is
// ---------------------------------------------------------------------------

/** One order's booking as the calendar needs it, carrier included. */
export interface DayBooking {
  partnerId: string | null;
  partnerName: string | null;
  kind: BookingKind;
  date: IsoDate | null;
  /** A cancelled order occupies no truck — it is excluded from the day's load,
   *  exactly as the confirm-flow's capacity count excludes it. */
  cancelled?: boolean;
}

export interface CarrierDayLoad {
  /** The day this load is about — a load is always about one day. */
  dateIso: IsoDate;
  partnerId: string | null;
  /** Named, always — an operator must know WHO to call (COPY-STANDARD rule 9). */
  partnerName: string;
  /** Bookings the customer confirmed. **This is the number that counts toward
   *  the carrier's daily limit** — the same rule the confirm flow's capacity
   *  warning counts by (`booking_stage='confirmed'` on that date, cancelled
   *  orders excluded), so the calendar and the warning can never disagree. */
  confirmed: number;
  /** The carrier's own dates, not yet confirmed by the customer. Shown, but
   *  never counted as load: a provisional date is not a promise. */
  provisional: number;
  /** null = the carrier never told us a limit. NOT "unlimited" — it stays
   *  silent rather than guessing (the T9 law). */
  capacity: number | null;
  /** Confirmed bookings have reached or passed the stated limit. */
  atLimit: boolean;
  /** Does the carrier run at all on this day (its own off-days + blackouts)? */
  runs: boolean;
}

/**
 * What each carrier is carrying on `dateIso`, busiest first.
 *
 * Orders with no carrier picked yet are grouped under a single unnamed entry
 * (partnerId null) — they are on the day, and pretending otherwise would make
 * the day look emptier than it is.
 */
export function carrierDayLoads(
  bookings: readonly DayBooking[],
  dateIso: string,
  rulesByPartner?: ReadonlyMap<string, PartnerDeliveryRules>,
): CarrierDayLoad[] {
  const day = dateIso.slice(0, 10);
  const acc = new Map<string, CarrierDayLoad>();
  for (const b of bookings) {
    if (b.cancelled) continue;
    if (b.kind === "none" || !b.date || b.date.slice(0, 10) !== day) continue;
    const id = b.partnerId ?? "";
    const cur = acc.get(id) ?? {
      dateIso: day,
      partnerId: b.partnerId ?? null,
      partnerName: b.partnerName?.trim() || "No carrier picked",
      confirmed: 0,
      provisional: 0,
      capacity: null,
      atLimit: false,
      runs: true,
    };
    if (b.kind === "confirmed") cur.confirmed += 1;
    else cur.provisional += 1;
    acc.set(id, cur);
  }
  for (const load of acc.values()) {
    const rules = load.partnerId ? rulesByPartner?.get(load.partnerId) : undefined;
    if (!rules) continue;
    load.capacity = rules.dailyCapacity;
    load.atLimit = rules.dailyCapacity != null && load.confirmed >= rules.dailyCapacity;
    load.runs = partnerRunsOn(rules, day);
  }
  return [...acc.values()].sort(
    (a, b) =>
      b.confirmed + b.provisional - (a.confirmed + a.provisional) ||
      a.partnerName.localeCompare(b.partnerName),
  );
}

/**
 * The one sentence this carrier's day needs, or null for silence.
 *
 * Silence is the default and the common case: all 8 live carriers are bare
 * rows, so a day with work on it says nothing unless a rule the carrier itself
 * gave us is being crossed. Every sentence names the carrier and ends in
 * something the operator can do (COPY-STANDARD, the carrier-rule word law).
 */
export function carrierDayNote(load: CarrierDayLoad): string | null {
  if (!load.partnerId) return null;
  // Sunday is never voiced as a carrier's own rule (the T9 law): it is refused
  // for EVERY partner by the booking gate, and "call them" would read as though
  // a phone call could buy a Sunday. Every live carrier carries the default
  // `offDays: [0]`, so without this the calendar would blame all 8 of them for
  // a rule none of them set.
  if (weekdayOf(load.dateIso) === 0) return null;
  if (!load.runs) {
    return `${load.partnerName} is not running on this day — call them or move these`;
  }
  if (load.atLimit && load.capacity != null) {
    return `${load.partnerName} is at its limit of ${load.capacity} deliveries a day — call them before promising more`;
  }
  return null;
}
