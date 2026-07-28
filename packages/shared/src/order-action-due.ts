/**
 * C8b · The two delay clocks (Loo, 2026-07-28).
 *
 * `docs/ORDERS-WORKING-FLOW.md` §3 gives the delay flow TWO deadlines, and the
 * whole design is in where the second one STARTS:
 *
 *   Delay planning                      2 working days, from the day the
 *                                       supplier's date first overshoots the
 *                                       promised date
 *   Call {logistics} — arrange new      the SAME working day, from the moment
 *   delivery date                       Operations records "we cannot make it"
 *                                       (`delay_decision_at`, 0304)
 *
 * They never overlap: Operations gets its two days to find out whether there is
 * really a delay — we may have ready stock, or another supplier may cover it —
 * and the moment it decides there is one, the customer hears the same day.
 * Nothing about "the customer is the LAST to know" changes.
 *
 * **BOTH COUNT ON THE OFFICE CALENDAR** (`docs/ACTION-FLOW-STANDARD.md` Law 2A:
 * Monday–Friday, Malaysian public holidays excluded). This is office work —
 * deciding, calling a logistics company — not warehouse work, and Law 2A says
 * an action that does not name its calendar is not finished. The engine
 * (`working-days.ts`) still defaults to the WAREHOUSE week (Mon–Sat), and this
 * module deliberately does NOT change that default: it passes the office week
 * itself on every call, and takes only the holidays from its caller, so a
 * surface structurally cannot count these two clocks on the wrong week.
 *
 * **`Same working day` is expressed as ZERO working days, not as a second kind
 * of deadline.** Due on the day it opens; late once one office working day has
 * passed. A Due that is a special case is a Due somebody forgets to sort by.
 *
 * PURE — no clock, no I/O. `todayIso` is handed in, and the caller owns the
 * timezone question (MYT for this business): an anchor that is a TIMESTAMP must
 * be converted to its MYT calendar date before it arrives here, because a
 * deadline is a calendar fact and this module never guesses a zone.
 */

import type { OrderActionKey } from "./order-action-words";
import {
  addWorkingDays,
  countWorkingDays,
  isWorkingDay,
  type IsoDate,
} from "./working-days";

/**
 * Law 2A's OFFICE calendar: Sunday AND Saturday off (0=Sun … 6=Sat).
 *
 * Not a default and not an option — the two delay clocks are office work, and
 * `working-days.ts` still defaults to the warehouse week. Exported so the same
 * three numbers are never typed twice.
 */
export const OFFICE_OFF_DAYS: readonly number[] = [0, 6];

/** Which stored moment a clock starts from. The NAME of the column, so the doc,
 *  the migration and the code all say the same thing. */
export type OrderActionDueAnchor = "delay_detected_at" | "delay_decision_at";

export interface OrderActionDueDef {
  key: OrderActionKey;
  /** Working days after the anchor day. 0 = due on the anchor day itself. */
  workingDays: number;
  /** Law 2A. Only `office` today — a second value is a business ruling, not a
   *  parameter, and the type is here so the next one has to be named. */
  calendar: "office";
  anchor: OrderActionDueAnchor;
}

/**
 * The actions that carry a Due. Deliberately just the two: every other Due in
 * Orders already lives where its own module put it (`delivery-queue.ts` for the
 * four delivery steps, `PURCHASING-WORKING-FLOW.md` §2 for the arrival window),
 * and copying them here would be a second home for a number (Law 0A).
 */
export const ORDER_ACTION_DUES: readonly OrderActionDueDef[] = [
  {
    key: "delay_planning",
    workingDays: 2,
    calendar: "office",
    anchor: "delay_detected_at",
  },
  {
    key: "arrange_new_delivery_date",
    workingDays: 0,
    calendar: "office",
    anchor: "delay_decision_at",
  },
];

const BY_KEY = new Map<OrderActionKey, OrderActionDueDef>(
  ORDER_ACTION_DUES.map((d) => [d.key, d]),
);

/** The action's Due definition, or null when the action carries none. Null is a
 *  real answer: most actions have their Due somewhere else. */
export function orderActionDueDef(
  key: OrderActionKey,
): OrderActionDueDef | null {
  return BY_KEY.get(key) ?? null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Holidays only — the week is this module's, never the caller's. */
export type OfficeHolidays = ReadonlySet<IsoDate> | readonly IsoDate[];

function officeOpts(holidays?: OfficeHolidays) {
  return { holidays, offDays: OFFICE_OFF_DAYS };
}

/**
 * The day a clock starts counting.
 *
 * Law 2A: "a due date landing on a non-working day moves automatically to the
 * next working day OF ITS OWN CALENDAR." A supplier date recorded on a Saturday
 * — the warehouse works, the office does not — starts its office clock on
 * Monday, so `Delay planning` is never handed a deadline that was already
 * running while nobody could act on it.
 */
function clockStart(anchor: IsoDate, holidays?: OfficeHolidays): IsoDate {
  const opts = officeOpts(holidays);
  return isWorkingDay(anchor, opts) ? anchor : addWorkingDays(anchor, 1, opts);
}

/**
 * The action's OWN deadline — the last day it can be done without being late.
 *
 * Null when the action carries no Due, or when there is no anchor to measure
 * from. **A step with no anchor can never be late** — the same rule the four
 * delivery queues already follow, and it is what keeps an order silent instead
 * of crying wolf.
 */
export function orderActionDueIso(
  key: OrderActionKey,
  anchorIso: string | null | undefined,
  holidays?: OfficeHolidays,
): IsoDate | null {
  const def = orderActionDueDef(key);
  if (!def || !anchorIso) return null;
  const anchor = anchorIso.slice(0, 10);
  if (!ISO_DATE.test(anchor)) return null;
  const start = clockStart(anchor, holidays);
  return def.workingDays === 0
    ? start
    : addWorkingDays(start, def.workingDays, officeOpts(holidays));
}

/**
 * Has this action blown its own deadline?
 *
 * Late once ONE OFFICE WORKING DAY has passed since the due date — §3's own
 * words for the same-working-day clock: *"A decision recorded on a Friday
 * afternoon is due that Friday; it turns late on the next working day."*
 * Saturday is not that day for an office deadline, so a Friday decision is not
 * late on Saturday and is late on Monday. An action due TODAY is never late
 * today: the operator still has the day to do it.
 */
export function orderActionOverdue(
  key: OrderActionKey,
  anchorIso: string | null | undefined,
  todayIso: string,
  holidays?: OfficeHolidays,
): boolean {
  const due = orderActionDueIso(key, anchorIso, holidays);
  if (!due || !todayIso) return false;
  const today = todayIso.slice(0, 10);
  if (!ISO_DATE.test(today) || today <= due) return false;
  return countWorkingDays(due, today, officeOpts(holidays)) >= 1;
}
