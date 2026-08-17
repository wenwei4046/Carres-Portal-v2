/**
 * C2 · The order action engine — TWO LAYERS, never one (Jess 2026-07-27).
 *
 * `docs/ACTION-FLOW-STANDARD.md` Law 1 retired the single ladder as a business
 * rule because it HID real work: an order with no PO, RM 2,000 owing and no
 * logistics company showed only the purchasing act, and the other two facts
 * vanished. (That act was called `Send PO` until P7A retired the word.)
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
 *     (Loo, freeze gate 2026-07-12) so it can never leapfrog the purchasing
 *     act (`Issue PO`);
 *   · the money LOCK is a GATE (Law 4: "Money still LOCKS"), which C2 kept and
 *     C3 moved onto `collect` — the action that clears it — when the resting
 *     `Confirm delivery` it used to ride was retired.
 * Neither REMOVES another track's action from the list, which is what Law 1
 * forbids.
 *
 * PURE — no clock, no I/O. `todayIso` is handed in, so a test pins a day
 * instead of racing one.
 */

import type { OrderActionKey } from "./order-action-words";

/**
 * How long one person's claim on an action survives without being refreshed.
 *
 * **A TECHNICAL CONSTANT, NOT A BUSINESS SETTING** (Loo, 2026-07-28). Nobody
 * negotiates this number, nobody tunes it per supplier, and it never appears on
 * a Settings tab — putting it there would add an eighth number that nobody ever
 * changes, and a setting nobody changes is worse than a constant because the
 * screen then implies somebody chose it. The working-flow documents say only
 * *"action claims automatically expire after the system-defined timeout"*; the
 * number lives here and changing it is a one-line code change, not a doc edit.
 *
 * It covers exactly one case: somebody opened an action at 10:14 and went home.
 * Every other way a claim ends is structural — a claim is only ever READ through
 * the list of currently-open actions, so an action that is completed or
 * recomputed away has nothing that can look its claim up
 * (`docs/PURCHASING-WORKING-FLOW.md` §5).
 *
 * NO CONSUMER YET — the claim itself is built by card P5. This is the definition
 * it will import, so the number can never be typed twice.
 */
export const ACTION_CLAIM_TIMEOUT_MS = 2 * 60 * 60 * 1000;

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
  /** C7 — the delivery order document for this trip: true = issued (the order
   *  carries a DO number) · false = genuinely not issued yet · undefined/null =
   *  UNKNOWN (an older Worker that does not select the column). UNKNOWN never
   *  accuses, exactly as for `photoOnFile`: absent, the delivery track behaves
   *  byte-for-byte as it did before C7 and prints the `Delivering` fact. */
  deliveryOrderIssued?: boolean | null;
  /** T6/0280: true = a delivery photo is on file · false = genuinely none ·
   *  null = UNKNOWN (older Worker / no overlay row). Unknown never accuses. */
  photoOnFile: boolean | null;
  /** C5's shared money rule says this order still owes something. UNKNOWN
   *  money is not owing — a number nobody knows may not stand between a
   *  customer and their goods. This raises the money ACTION. */
  moneyOwing: boolean;
  /**
   * C8 — the recorded answer to "can we still make the promised date?"
   * (`ops_order_control.delay_decision`, migration 0304).
   *
   *   `null`       nobody has decided yet — Delay planning is open
   *   `"keep"`     we can still make it; the customer is NEVER told, and the
   *                goods track carries on with the ordinary ready-date call
   *   `"new_date"` we cannot; the logistics call opens (stage 2)
   *
   * Absent reproduces the pre-C8 behaviour for a surface that does not select
   * the column — see `delayDecisionEtaIso`.
   */
  delayDecision?: "keep" | "new_date" | null;
  /**
   * C8 — the supplier date that decision was made ABOUT
   * (`ops_order_control.delay_decision_eta`, 0304, NOT NULL whenever a decision
   * exists).
   *
   * **A decision is only about one supplier date.** If the factory slips again,
   * the old answer may not silence the new delay — so the engine compares this
   * snapshot with the CURRENT `stockEtaIso` and re-opens Delay planning when
   * they differ. This is S4's rule (every event names the deadline it was made
   * about) applied to a delay, and without it one decision would close every
   * future delay on the order forever.
   */
  delayDecisionEtaIso?: string | null;
  /**
   * ⭐ Decision A (owner ruling 2026-08-16, `docs/orders/MASTER.md` §8) — an
   * OPEN Finance exception is the ONLY thing money can do to a delivery.
   * `financeExceptionHolds(exceptions)` over `order_finance_exceptions`
   * (0355) is the ONE predicate; this signal carries its answer, and the
   * caller never derives it from a balance — `moneyOwing` above still raises
   * the collect ACTION, but it no longer locks anything.
   *
   * Omitted = false: a surface that has not read the table shows no lock,
   * which is the honest default — the server-side gate reads the table itself
   * and remains the enforcement either way.
   */
  financeExceptionHolds?: boolean;
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
 * C8 · Has somebody decided about THIS supplier date?
 *
 * A decision is a fact about one supplier date, not about the order forever.
 * The pair is stored together (0304 refuses half of it), and a later, worse
 * date from the factory is a NEW delay that the old answer may not silence.
 */
function delayDecided(s: OrderActionSignals): boolean {
  return (
    (s.delayDecision ?? null) !== null &&
    (s.delayDecisionEtaIso ?? null) === s.stockEtaIso
  );
}

/**
 * GOODS — open until the goods are secured. At most one, because the rungs are
 * states of the same question ("where are these goods?"), not parallel work.
 */
function goodsAction(s: OrderActionSignals): OrderOpenAction | null {
  // Guardrail #2: a delivered order never alarms about goods.
  if (s.completed || s.goodsReady) return null;
  // Raising a purchase order is ONE act (Loo, 2026-07-30 — the Purchasing clean
  // restart). `Issue PO` is the only business action that creates an official
  // Purchase Order; there is no preparation act and no stored work-in-progress
  // object between the demand and the document.
  if (s.goodsUnordered) return action("issue_po", "goods", "danger");
  // T3 DELAY RADAR: the latest ready date OVERSHOOTS the promised date, so
  // calling the supplier can no longer save the promise. Strict overshoot:
  // landing ON the date is not a delay.
  //
  // C8 · WHAT HAPPENS NEXT IS A DECISION, NOT A PHONE CALL. Before this card
  // the radar opened `Call {customer} — agree new delivery date` on the spot,
  // which broke Jess's own rule twice over: a supplier naming a later date is
  // not yet a delay (we may have ready stock, or another supplier may cover
  // it), and even when it IS one, logistics carries the customer conversation.
  // `docs/ORDERS-WORKING-FLOW.md` §3 puts a GATE here — **the customer is the
  // last to know, and only when we have tried and failed.**
  if (
    s.stockEtaIso &&
    s.promisedDateIso &&
    s.stockEtaIso > s.promisedDateIso
  ) {
    // STAGE 1 — nobody has decided about this supplier date yet.
    if (!delayDecided(s)) return action("delay_planning", "goods", "danger");
    // STAGE 2 — and it opens ONLY on NO. `keep` means we solved it internally,
    // so nothing here ever reaches the customer: the track falls through to the
    // ordinary ready-date call, which is the truth (the goods are still not in).
    if (s.delayDecision === "new_date" && !newDateArranged(s))
      return action("arrange_new_delivery_date", "goods", "danger");
  }
  // Red once inside the arrival window and the date still has not landed.
  const inWindow = s.daysToDue !== null && s.daysToDue < s.stockWindowDays;
  return action("confirm_ready_date", "goods", inWindow ? "danger" : "warning");
}

/**
 * C8 · STAGE 2's completion, measured — §3: *"a customer-confirmed date AND a
 * time slot are recorded"*, plus the one condition that makes it about THIS
 * delay.
 *
 * The booking alone is not enough, and the reason is a real order rather than a
 * hypothetical: an order can already carry a confirmed booking made BEFORE the
 * factory slipped, and reading `bookingConfirmed` on its own would close stage 2
 * the instant it opened — the action would appear and vanish in the same render,
 * having arranged nothing. So the confirmed day must be one the goods can
 * actually make: **on or after the supplier's ready date.** That is not an
 * invented rule, it is the only thing "a new delivery date" can mean when the
 * old one is unreachable, and it is measured from signals that already exist —
 * no timestamp column, nothing for a future chat to keep in step.
 *
 * 0277's CHECK makes the slot ride the date, so a confirmed booking carries
 * both; `bookingConfirmed` is exactly "date + slot on file".
 */
function newDateArranged(s: OrderActionSignals): boolean {
  if (!s.bookingConfirmed || !s.confirmedDateIso) return false;
  return !!s.stockEtaIso && s.confirmedDateIso >= s.stockEtaIso;
}

/**
 * C3's lock, re-keyed by decision A (owner ruling 2026-08-16) — the delivery
 * is held by an OPEN FINANCE EXCEPTION, never by the balance.
 *
 * Everything for the trip is arranged and Finance has said stop: the delivery
 * may not be made. The predicate is `financeExceptionHolds` — the same one the
 * issue gate and the route canvas ask (`finance-exception.ts`), so the three
 * surfaces can never disagree about an order (Law D).
 *
 * What C3 got right survives whole: ONE predicate, both tracks; the lock
 * REMOVES no action from the list — `collect` is open whenever money is owed,
 * lock or no lock, and it survives delivery. What decision A retires is the
 * KEY: `moneyHolds ?? moneyOwing` asked whether the customer still owed,
 * and a balance — of any size, of any age — no longer stops a truck. Only
 * Finance's explicit, evidenced decision does, and only Finance clears it.
 */
function deliveryHeldOnFinanceException(s: OrderActionSignals): boolean {
  return (
    !s.completed &&
    s.goodsReady &&
    s.hasLogistics &&
    s.bookingConfirmed &&
    (s.financeExceptionHolds ?? false)
  );
}

/**
 * C3 · The DELIVERING FACT — everything is arranged and the day has not come.
 *
 * Not an action and never in `openOrderActions`: goods in · logistics assigned ·
 * the customer's date confirmed · that date still ahead means there is nothing
 * for a human to do (`docs/ORDERS-WORKING-FLOW.md` §8). The row prints the quiet
 * fact instead of a verb nobody can close, and the drawer's list is one row
 * shorter.
 *
 * It is deliberately FALSE while FINANCE HOLDS the delivery: printing
 * "Delivering 27 Jul" over an order the server will refuse to send would be the
 * screen telling a lie. In that case the money track carries the row, locked.
 * A plain outstanding balance is NOT that case any more (decision A) — the
 * goods go on the day, the fact prints, and the open `collect` rides beside it
 * on the money track.
 */
export function orderIsDelivering(s: OrderActionSignals): boolean {
  if (s.completed || !s.goodsReady || !s.hasLogistics || !s.bookingConfirmed)
    return false;
  if (s.financeExceptionHolds ?? false) return false;
  // C7 — everything is arranged EXCEPT the paper the logistics company asks for
  // the evening before. That is a real act by a real human, so it is an action
  // and this is not the quiet fact yet. UNKNOWN (null) stays the fact: absent
  // signal, absent claim. The date condition mirrors the action's own trigger
  // exactly — refusing the fact where no action is raised would leave the row
  // printing `Done` on an order that is nothing of the sort.
  if (s.deliveryOrderIssued === false && s.confirmedDateIso) return false;
  // A confirmed date that is today or past is not "still ahead" — those are
  // `Deliver today` and the broken-run escalation, both real actions.
  return !(s.confirmedDateIso && s.confirmedDateIso <= s.todayIso);
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
  // goods nobody has ordered is an empty action, and the purchasing act must
  // stay the headline for those.
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

  // Booked and HELD by Finance — the same shape as the old PayHold law (T7):
  // you do not arrange, and you do not run, a delivery you are not allowed to
  // make. The delivery track says nothing at all while the hold stands; the
  // money track carries the row and carries the 🔒. What changed is WHO can
  // hold it (decision A): an OPEN Finance exception, never the balance.
  if (deliveryHeldOnFinanceException(s)) return null;

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

  // C7 — the delivery order. Its trigger is `docs/ORDERS-WORKING-FLOW.md` §3's
  // four conditions, and every one of them is already TRUE by the time control
  // reaches this line, which is why the test below reads so short:
  //   · a customer-confirmed date AND slot — 0277's CHECK makes the slot ride
  //     the date, and `bookingConfirmed` was required above;
  //   · core goods ready — the one condition the delivery track does NOT
  //     require of its earlier rungs (you assign a company for goods still in
  //     production), so it is asked here explicitly;
  //   · no Finance hold — `deliveryHeldOnFinanceException` returned above on
  //     a held order, and it holds exactly when the goods are ready, so
  //     reaching here WITH `goodsReady` means Finance is not holding. Money
  //     itself stopped being a condition here under decision A: an order that
  //     still owes gets its paper, and `collect` stays open beside it.
  // Ranked in Law 4's rung 4 behind the call that produces the date, and it
  // deliberately sits AFTER the date split: on the day itself `Deliver today`
  // is rung 1 and must lead, and the delivery act carries the document anyway.
  if (s.goodsReady && s.deliveryOrderIssued === false && s.confirmedDateIso)
    return action("issue_delivery_order", "delivery", "info");

  // Everything arranged for a future day: NOT an action (C3, Jess 2026-07-27).
  // There is nothing for a human to do until the day, so the row prints the
  // quiet FACT `Delivering 27 Jul · 12pm–3pm` (`orderIsDelivering`) and the
  // drawer's checklist is one row shorter instead of holding a row no button
  // can close. `Deliver today` takes over on the day.
  return null;
}

/**
 * MONEY — its own track, and it SURVIVES DELIVERY (working flow §3): a
 * delivered order that still owes money keeps this action and its red dot.
 */
function moneyAction(s: OrderActionSignals): OrderOpenAction | null {
  if (!s.moneyOwing) return null;
  // The 🔒 now means Finance said stop (decision A) — a plain balance shows an
  // open collect with no lock, because collecting no longer stands between the
  // goods and the truck.
  return deliveryHeldOnFinanceException(s)
    ? action("collect", "money", "warning", { locked: true })
    : action("collect", "money", "warning");
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
  // 2 · the customer must be told something — and C8 puts the DECISION that
  // gates it immediately above the call it gates. Law 4 does not name
  // `Delay planning` at all (reported, not invented): it is not "the customer
  // must be told", because the whole point is that they are not told yet — but
  // it cannot rank below the call it must precede, and a promise that is about
  // to break outranks routine goods, delivery and money work. The two can never
  // both be open (one goods track, one action), so this rank only decides them
  // against the OTHER tracks, where the answer is the same for both.
  delay_planning: 19,
  arrange_new_delivery_date: 20,
  // 3 · goods are not secured — and this rung is ORDERED INSIDE ITSELF
  // (ACTION-FLOW Law 4). The two are not equal members: they are two distances
  // from a commitment, ordered commitment DESCENDING — a broken supplier
  // promise · goods not yet on any purchase order. Only one is ever open per
  // order (one goods track), so these numbers decide them against the OTHER
  // tracks, where both answer the same; they encode the law so a future reader
  // cannot lose it.
  confirm_ready_date: 30,
  issue_po: 31,
  // 4 · delivery preparation
  assign_logistics: 40,
  confirm_delivery_date: 41,
  issue_delivery_order: 42,
  // 5 · money — last on purpose, and it is not a demotion: 催钱前先看货. It is
  // always in this list and always in the Owing filter.
  collect: 50,
  // FACTS, never raised as actions; ranked only so the map stays total.
  done: 90,
  delivering: 91,
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
