/**
 * P3 · The two supplier calls the portal has never had
 * (`docs/PURCHASING-WORKING-FLOW.md` §3).
 *
 *   `Call {supplier} — confirm tomorrow's delivery`    counted per PO
 *   `Call {supplier} — confirm balance delivery date`  counted per PO LINE
 *
 * Jess's own reason for them: the day before the goods are due, somebody asks
 * the supplier for the delivery order to confirm tomorrow's van — and that is
 * when the supplier says "it will be late". And when the van arrives short,
 * somebody has to ask when the balance comes.
 *
 * PURE — no clock, no I/O. The caller passes `todayIso`, so a test can stand
 * on any day of the week and the engine cannot drift with the machine's clock.
 *
 * ── THE CALENDAR IS NAMED, because Law 2A says an action that does not name
 * its calendar is not finished. Purchasing counts on the **OFFICE** week,
 * Monday–Friday (`PURCHASING_OFFICE_OFF_DAYS`), and this module passes it
 * explicitly on every call rather than letting `working-days.ts` default. The
 * engine's own default is `[0]` — Monday–SATURDAY, the WAREHOUSE week — so a
 * caller that passes nothing is counting on a week nobody chose for it.
 *
 * ── TWO THINGS THIS MODULE REFUSES TO INVENT ────────────────────────────────
 *
 * 1. **An anchor it does not have.** No expected arrival date on the PO → the
 *    tomorrow call cannot appear at all, because "the working day before the
 *    expected arrival" has no meaning. There is no fallback to a default lead
 *    time: P1 deleted exactly that habit, and a due date computed from a
 *    guessed number looks precisely like one the factory agreed to.
 * 2. **A closed action.** An answer closes a call only while it is still ABOUT
 *    the current facts — S4's rule, the one C8 made load-bearing in
 *    `delay_decision_eta`. A supplier who moves the date again re-opens the
 *    call by itself; a second short delivery re-opens the balance call by
 *    itself. Without that, one phone call would silence a PO forever.
 */

import { myHolidaySet } from "./my-holidays";
import {
  addWorkingDays,
  subtractWorkingDays,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

/**
 * Law 2A's **Office** calendar — Monday–Friday. Purchasing is office work
 * (`docs/PURCHASING-WORKING-FLOW.md` §2), and the same array the purchase
 * engine already passes to `buildPurchaseChaseReceive`.
 *
 * Exported so a caller cannot spell it a second way, and so a test can assert
 * that it is NOT `working-days.ts`'s own default.
 */
export const PURCHASING_OFFICE_OFF_DAYS: readonly number[] = [0, 6];

export type PurchasingSupplierCallKey =
  | "confirm_tomorrows_delivery"
  | "confirm_balance_delivery_date";

/** One PO line, as the API hands it over. `snake_case` stays in the route. */
export interface SupplierCallLine {
  /** `purchase_order_lines.id` — the balance call is counted per line, so it
   *  is the only thing that can identify one. */
  id: string;
  sku: string;
  qty: number;
  receivedQty: number;
  /**
   * `purchase_order_lines.short_since` (0306) — the day this line last took a
   * SHORT delivery, stamped server-side by a trigger so every door that writes
   * `received_qty` stamps it.
   *
   * `null` on a line that is not short. It can also be null on a line that IS
   * short and predates 0306; that line raises the call with **no Due**, which
   * is the honest answer — a deadline nobody recorded may not be invented, and
   * T7's rule is that a step which cannot be late is never urgent.
   */
  shortSinceIso: string | null;
  /** `about_qty` of the latest `balance_delivery` promise, else null. */
  balanceAnswerAboutQty: number | null;
}

/** One PO, as the API hands it over. */
export interface SupplierCallPo {
  poId: string;
  supplierId: string;
  /** `purchase_orders.status` — only an OPEN PO has anything to call about. */
  status: string;
  /** `purchase_orders.eta_date` — when the goods are expected. */
  etaDateIso: string | null;
  /** `about_date` of the latest `tomorrow_delivery` promise, else null. */
  tomorrowAnswerAboutDateIso: string | null;
  lines: readonly SupplierCallLine[];
}

export interface SupplierCallOptions {
  todayIso: IsoDate;
  /** Malaysian public holidays. Omitted → the live Selangor set. */
  holidays?: ReadonlySet<string>;
}

export interface PurchasingOpenCall {
  key: PurchasingSupplierCallKey;
  poId: string;
  supplierId: string;
  /** Present only on the per-LINE call. */
  poLineId?: string;
  sku?: string;
  /** Units the supplier still owes on this line (the balance call only). */
  balanceQty?: number;
  /** When it turns late, in the OFFICE week. `null` = no anchor, never late. */
  dueIso: string | null;
  late: boolean;
}

function wd(opts: SupplierCallOptions): WorkingDayOptions {
  return {
    offDays: PURCHASING_OFFICE_OFF_DAYS,
    holidays: opts.holidays ?? myHolidaySet(),
  };
}

function day(iso: string | null | undefined): string | null {
  const s = (iso ?? "").slice(0, 10);
  return s.length === 10 ? s : null;
}

/** Units this line still owes. Clamped, so a stray over-receipt cannot make a
 *  balance read as negative (the same guard `poReceivingProgress` applies). */
function outstandingOf(l: SupplierCallLine): number {
  const q = Math.max(0, Number(l.qty ?? 0));
  const r = Math.max(0, Math.min(q, Number(l.receivedQty ?? 0)));
  return q - r;
}

/**
 * `Call {supplier} — confirm tomorrow's delivery` — §3.
 *
 * - **Trigger** — the goods are expected the next working day and nothing has
 *   been received.
 * - **Completion** — an answer is recorded: shipping, or delayed with a new
 *   date.
 * - **Due** — the day it appears: the working day before the expected arrival.
 *
 * **§3 calls this "a one-day action" and that phrase is about the DUE, not
 * about the row vanishing.** Reading it as the trigger — `eta === tomorrow`,
 * exactly — would make the call disappear at midnight with nobody having
 * closed it, and `ACTION-FLOW-STANDARD`'s opening sentence says an action
 * disappears when its COMPLETION becomes true and at no other moment. So the
 * window opens on the working day before the arrival and stays open until it
 * is answered: `eta <= the next working day`.
 */
export function tomorrowDeliveryCallOf(
  po: SupplierCallPo,
  opts: SupplierCallOptions,
): PurchasingOpenCall | null {
  if (po.status !== "open") return null;

  const eta = day(po.etaDateIso);
  // No expected arrival = no anchor. Nothing is invented to stand in for it.
  if (!eta) return null;

  // "and nothing has been received" — §3's own words, read at PO level: a PO
  // whose every line is settled has no delivery left to confirm.
  const outstanding = po.lines.reduce((s, l) => s + outstandingOf(l), 0);
  if (outstanding <= 0) return null;

  const today = day(opts.todayIso);
  if (!today) return null;

  const w = wd(opts);
  const nextWorkingDay = addWorkingDays(today, 1, w);
  if (eta > nextWorkingDay) return null;

  // ALREADY ANSWERED — but only about THIS date. A factory that moves the day
  // again has made the old answer an answer about nothing (S4 / C8).
  if (day(po.tomorrowAnswerAboutDateIso) === eta) return null;

  const dueIso = subtractWorkingDays(eta, 1, w);
  return {
    key: "confirm_tomorrows_delivery",
    poId: po.poId,
    supplierId: po.supplierId,
    dueIso,
    late: today > dueIso,
  };
}

/**
 * `Call {supplier} — confirm balance delivery date` — §3.
 *
 * - **Trigger** — a PO line has been part-received and the balance has no
 *   date.
 * - **Completion** — a date for the balance is recorded.
 * - **Due** — the working day after the short delivery.
 * - **Counted per** — one row per PO LINE, which is why this returns an array.
 *
 * "the balance has no date" is measured the same way the tomorrow call
 * measures its own answer: the latest balance promise names the received
 * quantity it was made ABOUT, so a SECOND short delivery on the same line
 * re-opens the call rather than inheriting an answer that stopped being about
 * anything.
 */
export function balanceDeliveryCallsOf(
  po: SupplierCallPo,
  opts: SupplierCallOptions,
): PurchasingOpenCall[] {
  if (po.status !== "open") return [];
  const today = day(opts.todayIso);
  if (!today) return [];
  const w = wd(opts);

  const out: PurchasingOpenCall[] = [];
  for (const l of po.lines) {
    const q = Math.max(0, Number(l.qty ?? 0));
    const r = Math.max(0, Math.min(q, Number(l.receivedQty ?? 0)));
    // §9: part-received = SOME good units in and some still owed. A line with
    // nothing in has no balance yet; a full line has no balance left.
    if (!(r > 0 && r < q)) continue;
    if (l.balanceAnswerAboutQty === r) continue;

    const short = day(l.shortSinceIso);
    const dueIso = short ? addWorkingDays(short, 1, w) : null;
    out.push({
      key: "confirm_balance_delivery_date",
      poId: po.poId,
      supplierId: po.supplierId,
      poLineId: l.id,
      sku: l.sku,
      balanceQty: q - r,
      dueIso,
      // No anchor, never late — a step that cannot be late is not urgent (T7).
      late: dueIso !== null && today > dueIso,
    });
  }
  return out;
}

/**
 * Every P3 call open on one PO, in `docs/PURCHASING-WORKING-FLOW.md` §4's
 * display order: `Confirm tomorrow's delivery` is rung 1 (today's run) and
 * `Confirm balance delivery date` is rung 4 (cleaning up a part-delivery).
 *
 * **A PO can carry both at once and one never hides the other** (Law 1). That
 * is not theoretical here: a PO delivered short on Monday is expecting its
 * balance van on Friday, so the balance call and the next tomorrow call are
 * open together and each closes on its own answer.
 */
export function purchasingSupplierCallsOf(
  po: SupplierCallPo,
  opts: SupplierCallOptions,
): PurchasingOpenCall[] {
  const tomorrow = tomorrowDeliveryCallOf(po, opts);
  return [
    ...(tomorrow ? [tomorrow] : []),
    ...balanceDeliveryCallsOf(po, opts),
  ];
}

/**
 * The two queue COUNTS, over a whole list of POs.
 *
 * `tomorrow` counts POs — §3's "counted per PO". `balance` counts PO LINES,
 * §3's "counted per PO line", and `balancePos` counts the POs those lines sit
 * on. The Receiving tab's row is a PO, so its facet cell prints `balancePos`
 * (a visible cell above zero must always return at least that many ROWS —
 * P2-Claims' honesty rule) while the row itself names the lines.
 */
export function purchasingSupplierCallCounts(
  pos: readonly SupplierCallPo[],
  opts: SupplierCallOptions,
): { tomorrow: number; balance: number; balancePos: number } {
  let tomorrow = 0;
  let balance = 0;
  let balancePos = 0;
  for (const po of pos) {
    if (tomorrowDeliveryCallOf(po, opts)) tomorrow += 1;
    const b = balanceDeliveryCallsOf(po, opts);
    if (b.length > 0) {
      balance += b.length;
      balancePos += 1;
    }
  }
  return { tomorrow, balance, balancePos };
}
