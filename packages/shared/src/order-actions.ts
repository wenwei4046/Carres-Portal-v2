/**
 * C2 · The order action engine — TWO LAYERS, never one (Jess 2026-07-27).
 *
 * `docs/ACTION-FLOW-STANDARD.md` Law 1 retired the single ladder as a business
 * rule because it HID real work: an order with no PO, RM 2,000 owing and no
 * logistics company showed only `Send PO`, and the other two facts vanished.
 *
 *   LAYER 1 · COMPUTE  — `openOrderActions`. Every track evaluates on its own.
 *                        One track's action may never suppress another's.
 *                        Result: the order's FULL set of open actions.
 *   LAYER 2 · DISPLAY  — `displayOrderAction`. Picks which ONE goes first,
 *                        using Law 4's priority. The old ladder's ordering is
 *                        INPUT here, not law.
 *
 * **Same signals, no new state, no new engine.** Every input below is a signal
 * the Orders list already reads; this module only stops one answer from eating
 * the others.
 *
 * THREE TRACKS, and they are tracks because their work is done by different
 * people at the same time: GOODS (purchasing), DELIVERY (arranging the trip),
 * MONEY (collecting). `docs/ORDERS-WORKING-FLOW.md` §3 is the source for every
 * trigger below; the WORDS come from `order-action-words` and are never spelt
 * here.
 *
 * **Independence is about OUTPUTS, not inputs.** Two triggers deliberately read
 * a signal owned by another track, and both are pre-existing locked rules, not
 * new couplings:
 *   · the past-deadline escalation is scoped to "something has been ordered"
 *     (Loo, freeze gate 2026-07-12) so it can never leapfrog `Send PO`;
 *   · the money LOCK on `Confirm delivery` is a GATE (Law 4: "Money still
 *     LOCKS"), and C2's card says to keep it.
 * Neither REMOVES another track's action from the list, which is what Law 1
 * forbids.
 *
 * PURE — no clock, no I/O. `todayIso` is handed in, so a test pins a day
 * instead of racing one.
 */

import type { OrderActionKey } from "./order-action-words";

export type OrderActionTone =
  | "danger"
  | "warning"
  | "info"
  | "success"
  | "neutral";

/** Which parallel track raised this action. Never shown — it is how the engine
 *  guarantees at most one action per track, and how a test proves that no track
 *  can silence another. */
export type OrderActionTrack = "goods" | "delivery" | "money";

export interface OrderOpenAction {
  key: OrderActionKey;
  track: OrderActionTrack;
  tone: OrderActionTone;
  /** Delivery is HELD on money (🔒). A lock is a gate, never a display rule. */
  locked?: true;
  /** A commitment that is already broken — the promised date passed with no
   *  booking, or a booked run that did not happen. Law 4 rung 1. */
  broken?: true;
}

/**
 * Every signal the engine reads, each one named for the business fact it is —
 * the caller maps its own columns onto these, so this module never learns a
 * table name.
 */
export interface OrderActionSignals {
  /** The order reached the customer (the list's `completed` tab). */
  completed: boolean;
  /** The ladder's own two-signal ready rule: live free stock OR the Master
   *  import's per-line ready flag. */
  goodsReady: boolean;
  /** Nothing has been ordered from anybody — no PO covers these goods. */
  goodsUnordered: boolean;
  /** Latest supplier ready date among the waiting lines (ISO), else null. */
  stockEtaIso: string | null;
  /** The customer's promised date (ISO). Null when TBD or absent — a date
   *  nobody has promised can never be missed. */
  promisedDateIso: string | null;
  /** Days from today to the promised date; negative = past. Null = no date. */
  daysToDue: number | null;
  /** Days before the promised date that a missing ready date turns red
   *  (mattress / bed frame 7, sofa 5 — the live window). */
  stockWindowDays: number;
  /** A logistics company has been chosen. */
  hasLogistics: boolean;
  /** D1/0277 — the CUSTOMER confirmed, not the logistics company's word. */
  bookingConfirmed: boolean;
  /** The customer-confirmed date (ISO), when there is one. */
  confirmedDateIso: string | null;
  /** Today, as the caller's local ISO date. */
  todayIso: string;
  /** T6/0280: true = a delivery photo is on file · false = genuinely none ·
   *  null = UNKNOWN (older Worker / no overlay row). Unknown never accuses. */
  photoOnFile: boolean | null;
  /** C5's shared money rule says this order still owes something. UNKNOWN
   *  money is not owing — a number nobody knows may not stand between a
   *  customer and their goods. */
  moneyOwing: boolean;
}

function action(
  key: OrderActionKey,
  track: OrderActionTrack,
  tone: OrderActionTone,
  extra?: { locked?: true; broken?: true },
): OrderOpenAction {
  return { key, track, tone, ...(extra ?? {}) };
}

/**
 * GOODS — open until the goods are secured. At most one, because the rungs are
 * states of the same question ("where are these goods?"), not parallel work.
 */
function goodsAction(s: OrderActionSignals): OrderOpenAction | null {
  // Guardrail #2: a delivered order never alarms about goods.
  if (s.completed || s.goodsReady) return null;
  if (s.goodsUnordered) return action("send_po", "goods", "danger");
  // T3 DELAY RADAR: once the latest ready date OVERSHOOTS the promised date the
  // miss is certain, so calling the supplier can no longer save it — the work
  // becomes agreeing a new date. Strict overshoot: landing ON the date is not a
  // delay.
  if (
    s.stockEtaIso &&
    s.promisedDateIso &&
    s.stockEtaIso > s.promisedDateIso
  )
    return action("agree_new_delivery_date", "goods", "danger");
  // Red once inside the arrival window and the date still has not landed.
  const inWindow = s.daysToDue !== null && s.daysToDue < s.stockWindowDays;
  return action("confirm_ready_date", "goods", inWindow ? "danger" : "warning");
}

/**
 * DELIVERY — arranging the trip. Runs whether or not the goods are in: you pick
 * a logistics company and get the customer's date for an order still in
 * production, and hiding that until the goods land is exactly the work the old
 * ladder lost.
 */
function deliveryAction(s: OrderActionSignals): OrderOpenAction | null {
  if (s.completed) {
    // T7: a delivered order whose photo ledger is empty still owes one real
    // act. WARNING, never danger — a delivered order does not alarm red.
    // `null` is UNKNOWN, not a gap, so it stays silent.
    return s.photoOnFile === false
      ? action("upload_delivery_photo", "delivery", "warning")
      : null;
  }

  // PAST-DEADLINE ESCALATION (Loo, freeze gate 2026-07-12): the promised date
  // passed with a logistics company assigned and the customer still not
  // confirmed — a broken commitment, so it ranks first however the tracks sort.
  // Scoped to "something has been ordered": calling a logistics company about
  // goods nobody has ordered is an empty action, and `Send PO` must stay the
  // headline for those.
  if (
    s.daysToDue !== null &&
    s.daysToDue < 0 &&
    s.hasLogistics &&
    !s.goodsUnordered &&
    !s.bookingConfirmed
  )
    return action("confirm_delivery_date", "delivery", "danger", { broken: true });

  if (!s.hasLogistics) return action("assign_logistics", "delivery", "info");
  if (!s.bookingConfirmed)
    return action("confirm_delivery_date", "delivery", "info");

  // Booked. The money LOCK sits here and nowhere else (the card: keep it) — you
  // do not run a delivery you are not allowed to make.
  if (s.goodsReady && s.moneyOwing)
    return action("confirm_delivery", "delivery", "warning", { locked: true });

  // T7: a confirmed booking is not one resting state — its own date splits it.
  if (s.confirmedDateIso) {
    if (s.confirmedDateIso < s.todayIso)
      // The booked run did not happen and nothing recorded a delivery.
      return action("confirm_delivery_date", "delivery", "danger", {
        broken: true,
      });
    if (s.confirmedDateIso === s.todayIso)
      return action("deliver_today", "delivery", "info");
  }

  // Everything arranged for a future day. This is the ONE delivery answer that
  // waits on the goods track: "everything ready, confirm" must not be said over
  // goods that are not in. The goods action is still open and still listed —
  // nothing is suppressed, this trigger simply has not fired.
  return s.goodsReady ? action("confirm_delivery", "delivery", "success") : null;
}

/**
 * MONEY — its own track, and it SURVIVES DELIVERY (working flow §3): a
 * delivered order that still owes money keeps this action and its red dot.
 */
function moneyAction(s: OrderActionSignals): OrderOpenAction | null {
  return s.moneyOwing ? action("collect", "money", "warning") : null;
}

/**
 * LAYER 1 — every open action on this order, one per track at most.
 *
 * Returned in track order (goods · delivery · money) so the array itself is
 * stable; WHICH ONE LEADS is Layer 2's decision and nobody else's.
 */
export function openOrderActions(
  s: OrderActionSignals,
): OrderOpenAction[] {
  return [goodsAction(s), deliveryAction(s), moneyAction(s)].filter(
    (a): a is OrderOpenAction => a !== null,
  );
}

/**
 * Law 4's display priority, as a rank per action. Lower shows first.
 *
 *   1 broken commitment or today's run · 2 the customer must be told ·
 *   3 goods are not secured · 4 delivery preparation · 5 money
 *
 * Every key gets its OWN number inside its rung so the sort is total — two
 * actions can never tie and flip between renders.
 */
const DISPLAY_RANK: Record<OrderActionKey, number> = {
  // 1 · broken commitment or today's run
  deliver_today: 10,
  upload_delivery_photo: 11,
  // 2 · the customer must be told something
  agree_new_delivery_date: 20,
  // 3 · goods are not secured
  send_po: 30,
  confirm_ready_date: 31,
  // 4 · delivery preparation
  assign_logistics: 40,
  confirm_delivery_date: 41,
  confirm_delivery: 42,
  // 5 · money — last on purpose, and it is not a demotion: 催钱前先看货. It is
  // always in this list and always in the Owing filter.
  collect: 50,
  // Terminal fact, never raised as an action; ranked only so the map is total.
  done: 90,
};

/** A broken commitment outranks everything (Law 4 rung 1), whatever track it
 *  came from. This is the one thing the rank table cannot express, because
 *  "broken" is a fact about THIS order, not about the kind of action. */
function sortKey(a: OrderOpenAction): number {
  return a.broken ? 0 : DISPLAY_RANK[a.key];
}

/**
 * LAYER 2 — which ONE the row shows. Null when nothing is open (the caller
 * says `Done`; a terminal fact is not this engine's to invent).
 *
 * PURE and total: same list in, same answer out, no clock.
 */
export function displayOrderAction(
  open: readonly OrderOpenAction[],
): OrderOpenAction | null {
  let best: OrderOpenAction | null = null;
  for (const a of open) if (!best || sortKey(a) < sortKey(best)) best = a;
  return best;
}

/**
 * The full list in DISPLAY order — the drawer's dynamic checklist. Same set as
 * `openOrderActions`, ordered by the same rule that picks the row's headline,
 * so the drawer's first line is always the row's pill. Staff never reorder it.
 */
export function orderActionsInDisplayOrder(
  s: OrderActionSignals,
): OrderOpenAction[] {
  return [...openOrderActions(s)].sort((a, b) => sortKey(a) - sortKey(b));
}
