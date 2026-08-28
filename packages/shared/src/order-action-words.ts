/**
 * C1 · The words an order action is allowed to say (Jess 2026-07-27).
 *
 * `docs/COPY-STANDARD.md` holds the law; this module is its ONE code home, so
 * no surface writes an action label by hand. Two strings per action, and the
 * difference between them is the whole point:
 *
 *   QUEUE — the facet row, the filter chip, the count. It names the WORK and
 *           carries no party, because a queue holds many suppliers at once.
 *   LINE  — what one row says. Verb + NAMED party + measurable object, which is
 *           only possible where a single order is on screen.
 *
 * The law states that split explicitly for the delivery step: queue
 * `Confirm delivery date`, row line `Call {logistics} — confirm delivery date`.
 * Every action follows the same shape, so a new hire reads one grammar.
 *
 * `Chase` is banned — it names a mood, not an outcome. So is any word that
 * hides a to-do inside a fact (`need booking`, `Unscheduled`, `Pending`).
 *
 * The party FALLS BACK to the role word when the system does not know a name
 * ("the role word only when no name exists"), never to an empty gap: a label
 * reading `Call  — confirm ready date` would be worse than the honest
 * `Call supplier — confirm ready date`.
 *
 * PURE — no clock, no I/O. It owns no date spelling (`fmt-date.ts` is that one
 * home) and, since C11, it owns no money spelling either: the amount arrives as
 * a NUMBER and is printed by `fmtMoney`. That line used to read "no locale
 * beyond the caller's own money string", and the caller's own money string is
 * exactly what put `Collect RM RM 11,246.00` on 28 live rows — this module
 * already owned half the money spelling (the `RM ` prefix) and delegated the
 * half that could go wrong.
 */

import { fmtMoney } from "./money-format";

export type OrderActionKey =
  // `send_po` is RETIRED and the verb `Send` with it, and it stays banned from
  // reuse. Raising a purchase order is ONE act — `Issue PO` — which creates the
  // formal Purchase Order (Loo, 2026-07-30: the Purchasing clean restart; there
  // is no preparation act and no Draft PO business object).
  | "issue_po"
  | "confirm_ready_date"
  | "delay_planning"
  | "arrange_new_delivery_date"
  | "assign_logistics"
  | "confirm_delivery_date"
  | "issue_delivery_order"
  | "deliver_today"
  | "upload_delivery_photo"
  | "delivering"
  | "collect"
  // §0.1 Action Owner Engine row 1 (owner ruling 2026-08-20, composed
  // 2026-08-27) — the missing customer promise is the salesperson's work.
  // Raised by the Work feed's composition only, never by the ladder, so no
  // register row or drawer headline changes (owner ruling 2026-08-18: the
  // register states the amber fact alone; the ACTION lives in Work).
  | "ask_delivery_date"
  // The blueprint card's two NEW acts (owner-approved 2026-08-16, §7):
  // the loan comes back on the delivery day, and Finance resolves the one
  // thing money can do to a delivery.
  | "collect_loan_item"
  | "resolve_payment_exception"
  | "done";

/** The real names this order knows. Absent / blank → the role word. */
export interface OrderActionParties {
  supplier?: string | null;
  logistics?: string | null;
  customer?: string | null;
  /**
   * `Collect RM {amount}` — the amount owed, as a NUMBER.
   *
   * **C11: it is a number on purpose, and that is the whole fix.** It used to be
   * "the caller's formatted integer, WITHOUT RM", which asked every caller to
   * remember two things this module already knew — and both were got wrong on
   * live screens: the collections desk passed an already-`RM`-prefixed string
   * (`Collect RM RM 11,246.00`, on all 28 rows) and four other call sites passed
   * a formatter that threw the sen away (`RM 1,251` for RM 1,250.50).
   *
   * A number can be neither. The prefix and the two decimals are `fmtMoney`'s,
   * so a sixth caller cannot reintroduce either shape — `tsc` refuses the string
   * before a reviewer sees it. `null` still means "we do not know", which is a
   * different thing from zero and still prints no figure.
   */
  amount?: number | null;
  /** C3 — the `Delivering {date} · {slot}` FACT. Both already formatted by the
   *  caller (`27 Jul`, `12pm–3pm`): this module owns WORDS and never dates.
   *  Absent → the bare `Delivering`, which is the right thing to print in a
   *  cell whose neighbour already carries the booked day. */
  deliveryDate?: string | null;
  deliverySlot?: string | null;
}

interface OrderActionWord {
  key: OrderActionKey;
  queue: string;
  line: (p: OrderActionParties) => string;
  /**
   * C6 — string 3 of the five COPY-STANDARD locks per action: the BUTTON that
   * records it. It is the word C6's checklist prints for a step, so a step can
   * never invent a verb of its own: `Record ready date`, not "get the date".
   *
   * `null` for the two FACTS (`delivering`, `done`) — nothing records a fact,
   * and a button word for one would be a button nobody can press.
   */
  button: string | null;
  /**
   * C7 — string 4 of the five: the DONE MESSAGE, what the portal says once the
   * outcome is recorded.
   *
   * **The mirror grows one string per card that gains a READER, never per card
   * that reads the table.** C6 added the Button because its checklist prints
   * one; C7 adds the Done message for the action it builds, because the drawer
   * toasts it. The other eight are locked in COPY-STANDARD's dictionary and are
   * deliberately NOT copied here yet: a mirrored string nothing renders is
   * exactly the dead code C10 spent a whole card resurrecting, and a second
   * spelling that no screen reads is worse than no spelling at all. `null`
   * therefore means "not mirrored yet", never "this action records nothing".
   */
  done: string | null;
}

/** Trim to a real name, else the role word — never an empty slot. */
function party(name: string | null | undefined, role: string): string {
  const n = (name ?? "").trim();
  return n.length > 0 ? n : role;
}

/** The money half of the collect action. `null` amount = we do not know it, so
 *  the label says what to do without inventing a figure — which is a different
 *  answer from zero, and zero still prints (`RM 0.00`).
 *
 *  C11 — the SPELLING is `fmtMoney`'s and never this module's, and never a
 *  caller's: two decimals always, one `RM`, one home. */
function amountBit(p: OrderActionParties): string | null {
  return p.amount == null ? null : fmtMoney(p.amount);
}

const WORDS: readonly OrderActionWord[] = [
  {
    // **The only business action that creates a formal Purchase Order.**
    // It mints the PO number, produces the external document and opens the
    // communication channels. Nothing precedes it: demand goes from the plan
    // straight to the document (Loo, 2026-07-30 — the Purchasing clean restart).
    //
    // `Issue` is the dictionary's own verb — the SYSTEM produces a formal
    // document, completion = the document exists — the same sense
    // `Issue delivery order` carries. Its locked done message
    // (`PO issued to {supplier}`) names a party, which this table's `done` field
    // (a plain string) cannot hold, so it stays `null` rather than being respelt
    // without its party.
    key: "issue_po",
    queue: "Issue PO",
    line: (p) => `Issue PO to ${party(p.supplier, "supplier")}`,
    button: "Issue PO",
    done: null,
  },
  {
    key: "confirm_ready_date",
    queue: "Confirm ready date",
    line: (p) => `Call ${party(p.supplier, "supplier")} — confirm ready date`,
    button: "Record ready date",
    done: null,
  },
  {
    // C8 · STAGE 1 of the delay flow (`docs/ORDERS-WORKING-FLOW.md` §3).
    //
    // A supplier naming a later date is NOT yet a delay — we may have the item
    // in ready stock, or another supplier may cover it. So the work is a
    // DECISION, taken by Operations, and the customer is not contacted in this
    // stage at all.
    //
    // NO PARTY, and it is the same reason `Assign logistics` carries none:
    // nobody outside is involved (COPY-STANDARD's action naming law names the
    // party-free actions explicitly). Naming one here would be exactly the
    // error this card exists to fix.
    //
    // The word is Jess's own: COPY-STANDARD's vocabulary table gives
    // `Delay planning` as the canonical phrase for "working out what to do
    // about a delay, before anyone calls the customer", and bans `Recovery`
    // outright — staff say "this order going to delay".
    key: "delay_planning",
    queue: "Delay planning",
    line: () => "Delay planning",
    button: "Record the delay decision",
    done: null,
  },
  {
    // C8 · STAGE 2, and it opens ONLY when the decision says the promised date
    // cannot be met.
    //
    // **THE DICTIONARY WINS, and the party changes with it.** This shipped as
    // `Agree new delivery date` / `Call {customer} — agree new delivery date`
    // (C2 finding #3, assigned to C8). Three laws said otherwise and agreed
    // with each other: COPY-STANDARD's dictionary row (`Arrange new delivery
    // date` / `Call {logistics} — arrange new delivery date`), its vocabulary
    // table, and ACTION-FLOW Law 4 rung 2 — *"Rung 2 never names the customer.
    // Carres does not phone a customer about a delay — logistics carries that
    // conversation, and the action in this portal is the call to logistics.
    // Any surface that opens a customer call about a delay is wrong."*
    //
    // Operations still OWNS the task (§3: eight logistics companies are in use,
    // only NETS has a login, and the partner portal has no appointment screen —
    // a task owned by "Logistics" would be one nobody can see or close). The
    // CONVERSATION is logistics'; the ACTION in this portal is ours.
    key: "arrange_new_delivery_date",
    queue: "Arrange new delivery date",
    line: (p) =>
      `Call ${party(p.logistics, "logistics")} — arrange new delivery date`,
    button: "Record new date",
    done: null,
  },
  {
    // Nobody outside is involved — the party is what you are choosing, so it
    // cannot be named yet (COPY-STANDARD keeps this one as it stands).
    key: "assign_logistics",
    queue: "Assign logistics",
    line: () => "Assign logistics",
    button: "Assign logistics",
    done: null,
  },
  {
    key: "confirm_delivery_date",
    queue: "Confirm delivery date",
    line: (p) =>
      `Call ${party(p.logistics, "logistics")} — confirm delivery date`,
    button: "Confirm booking",
    done: null,
  },
  {
    // C7 (Jess 2026-07-27) — `Issue delivery order` IS an action. Nobody
    // outside is involved: the SYSTEM produces the document and the operator
    // presses one button, so the line carries no party, exactly like
    // `Assign logistics` (COPY-STANDARD's action naming law names all three
    // party-free actions and this is one of them).
    //
    // The verb is `Issue` in its dictionary sense — "the SYSTEM produces a
    // formal document", completion = "the document exists". That is the whole
    // reason this is one press and not authoring: a human who typed a delivery
    // order would be writing the document, which the verb forbids.
    key: "issue_delivery_order",
    queue: "Issue delivery order",
    line: () => "Issue delivery order",
    button: "Issue delivery order",
    done: "Delivery order issued",
  },
  {
    key: "deliver_today",
    queue: "Deliver today",
    line: () => "Deliver today",
    button: "Mark delivered",
    done: null,
  },
  {
    key: "upload_delivery_photo",
    queue: "Upload delivery photo",
    line: () => "Upload delivery photo",
    button: "Upload delivery photo",
    done: null,
  },
  {
    // C3 (Jess 2026-07-27) — a FACT, not an action. `Confirm delivery with
    // {customer}` used to sit here: it fired when the goods were in, logistics
    // was assigned, the customer's date was confirmed and that date was still
    // ahead — nothing for a human to do, which is why it was the one row in the
    // drawer that no button in the portal could close. A row with no button
    // teaches a new hire they have missed something
    // (`docs/ORDERS-WORKING-FLOW.md` §8).
    //
    // The QUEUE word is the SHORT form and the LINE is the full one, exactly as
    // for every action — and here that split does real work: the Orders row and
    // the Delivery detail pane both sit beside a cell that already prints the
    // booked day, so they print `Delivering` and let the neighbour carry the
    // date; the drawer's journey strip, where nothing else says it, prints
    // `Delivering 27 Jul · 12pm–3pm`.
    key: "delivering",
    queue: "Delivering",
    line: (p) => {
      const date = (p.deliveryDate ?? "").trim();
      const slot = (p.deliverySlot ?? "").trim();
      if (!date) return "Delivering";
      return slot ? `Delivering ${date} · ${slot}` : `Delivering ${date}`;
    },
    button: null,
    done: null,
  },
  {
    // §0.1 Action Owner Engine row 1 — the missing customer promise, the
    // salesperson's work. `Ask` is a governed verb (COPY-STANDARD § action
    // naming); the line names the customer the way every other line names
    // its party, and stays clear of the retired `agree` vocabulary (C8).
    // The register hover's fuller guidance sentence is unchanged. No button:
    // no Work surface renders a closing control for it — the governed date
    // door (ConfirmDateModal) closes the fact.
    key: "ask_delivery_date",
    queue: "Ask for the delivery date",
    line: (p) => `Ask ${party(p.customer, "customer")} for the delivery date`,
    button: null,
    done: null,
  },
  {
    key: "collect",
    queue: "Collect",
    line: (p) => {
      const money = amountBit(p);
      const who = party(p.customer, "customer");
      return money ? `${money} from ${who}` : `Collect from ${who}`;
    },
    button: "Record payment",
    done: null,
  },
  {
    // Blueprint card §7 (2026-08-16) — the loan sofa/mattress comes back on
    // the delivery day. COPY-STANDARD already registered the generic form
    // (`Collect the loan item`, 2026-08-16): a loan is not always a sofa.
    key: "collect_loan_item",
    queue: "Collect the loan item",
    line: (p) => `Collect the loan item from ${party(p.customer, "customer")}`,
    button: "Record loan collected",
    // null = "not mirrored yet", never "records nothing" (C10's dead-code
    // rule): a DONE string joins when a surface actually renders it.
    done: null,
  },
  {
    // Blueprint card §7 (2026-08-16) — an OPEN Finance exception is the ONE
    // money blocker (decision A), and only Finance clears it. The reason
    // rides the fact line of whichever surface prints this; the words here
    // never restate a balance, because the exception is a decision, not a
    // derived state.
    key: "resolve_payment_exception",
    queue: "Resolve the payment exception",
    line: () => "Resolve the payment exception — Finance clears it with evidence",
    button: "Open Finance exceptions",
    done: null,
  },
  {
    // Terminal FACT, not an action — it lives here so the ladder has one place
    // to read every word it can return.
    key: "done",
    queue: "Done",
    line: () => "Done",
    button: null,
    done: null,
  },
];

const BY_KEY = new Map<OrderActionKey, OrderActionWord>(
  WORDS.map((w) => [w.key, w]),
);
const BY_QUEUE = new Map<string, OrderActionWord>(WORDS.map((w) => [w.queue, w]));

function wordFor(key: OrderActionKey): OrderActionWord {
  const w = BY_KEY.get(key);
  // Unreachable for a typed key; throwing beats printing a silent wrong verb.
  if (!w) throw new Error(`order-action-words: unknown action "${key}"`);
  return w;
}

/** The queue / filter / count word — no party. */
export function orderActionQueue(key: OrderActionKey): string {
  return wordFor(key).queue;
}

/**
 * One row's line — verb + named party + measurable object.
 *
 * `collect` is the one action whose object is money, so it reads
 * `Collect RM 2,455.00 from John Tan` from `{ amount, customer }` — the amount
 * a NUMBER, printed to the cent by `fmtMoney` (C11).
 */
export function orderActionLine(
  key: OrderActionKey,
  parties: OrderActionParties = {},
): string {
  if (key === "collect") {
    const money = amountBit(parties);
    const who = party(parties.customer, "customer");
    return money ? `Collect ${money} from ${who}` : `Collect from ${who}`;
  }
  return wordFor(key).line(parties);
}

/**
 * The money PILL — the amount without the customer, for the narrow second pill
 * in the Actions column (`Collect RM 2,455.00`). The row line names the
 * customer; the pill sits beside their name already.
 */
export function collectPillLabel(amount: number | null | undefined): string {
  const money = amountBit({ amount });
  return money ? `Collect ${money}` : "Collect";
}

/**
 * C6 — the BUTTON word: what the operator presses to RECORD this action's
 * outcome. `null` for the two facts (`delivering`, `done`), which nothing
 * records.
 *
 * It is the word a checklist step prints, and that is the point: a step is one
 * of the portal's own actions, so it can never carry a verb somebody invented
 * for a tick-list ("get the ETA", "chase them"). Verb-first and ≤ 8 words, which
 * is COPY-STANDARD's "What to do" step template exactly.
 */
export function orderActionButton(key: OrderActionKey): string | null {
  return wordFor(key).button;
}

/**
 * C7 — the DONE MESSAGE: what the portal says once this action's outcome is
 * recorded. `null` = not mirrored here yet (see the field's comment); the
 * caller must then say nothing rather than invent a sentence.
 */
export function orderActionDone(key: OrderActionKey): string | null {
  return wordFor(key).done;
}

/**
 * The FACT that replaces the banned gap-words (`need booking`, `Unscheduled`,
 * `Not booked`) in the delivery column and the drawer badges.
 *
 * It is the action WITHOUT its verb, because a badge is a fact slot (the UI
 * type dictionary) and its neighbours in those cells are facts too
 * (`Confirmed`, `logistics said 27 Jul`). COPY-STANDARD's audit table spells it
 * exactly this way: `{logistics} — confirm delivery date`. The point of the
 * substitution is that a fact may state an ABSENCE but may never contain a
 * to-do word — so it names the outstanding thing instead of the gap.
 */
export function deliveryDateGapFact(logistics?: string | null): string {
  return `${party(logistics, "Logistics")} — confirm delivery date`;
}

/** Queue word → its action, for surfaces that only carry the label (the queue
 *  filter state, the journey strip's verb map). Null = not one of ours. */
export function orderActionForQueue(queue: string): OrderActionKey | null {
  return BY_QUEUE.get(queue.trim())?.key ?? null;
}

/** Every queue word, in lifecycle order — for a banned-word guard to walk. */
export const ORDER_ACTION_QUEUES: readonly string[] = WORDS.map((w) => w.queue);

// ── PURCHASING — the dictionary's own table (R8) ──────────────────────────────
//
// COPY-STANDARD carries TWO dictionary tables, ORDERS + DELIVERY and PURCHASING.
// **The PURCHASING table is the canonical home for `Issue PO` and
// `Confirm ready date`**: the Orders ladder DISPLAYS those two, it does not
// respell them, and the ORDERS table points at this one. So they are NOT
// respelt here either — they are read back out of `WORDS`, which is the code's
// single home for the string.
//
// *(That replaces the old rule — "`Send PO` and `Confirm ready date` are ONE
// action each … listed twice" — which required both flows to carry an identical
// entry, and is exactly what made this split unbuildable without dragging the
// Orders wording along. Defining an action once and referencing it is stronger
// than defining it twice and promising the copies match.)*
//
// **Why a second table and not four more members of `OrderActionKey`.** That
// union is the ORDER LADDER's key: `DISPLAY_RANK` is a `Record` over it, and
// `order-action-due` and `order-action-checklist` both key off it. Adding
// `check_in` there would force a display rank and a due rule for an action the
// Orders row can never show — a purchasing-only word wearing the ladder's type.
// One file (Law 0A: one home for the mirror), two tables, no duplicated string.
//
// Only rows with a READER in the code are here — the module's own rule above.
//
// P3 (2026-07-29) added the last two: `Confirm tomorrow's delivery` and
// `Confirm balance delivery date`. They sat out of this table until now for
// exactly the reason the rule gives — nothing rendered them — and they arrive
// with their four readers in the same PR (the Receiving tab's two facet tiles,
// the row buttons and the record-answer form). All five strings come straight
// off COPY-STANDARD's PURCHASING table; P3 invented no word.

export type PurchasingActionKey =
  | "issue_po"
  | "confirm_ready_date"
  | "confirm_tomorrows_delivery"
  | "check_in"
  | "confirm_balance_delivery_date"
  | "confirm_what_happens_next";

interface PurchasingWord {
  queue: string;
  line: (p: OrderActionParties) => string;
  button: string;
  /**
   * String 4 — the DONE MESSAGE. `null` = not mirrored yet (the ORDERS table's
   * own rule, one string per card that gains a READER), never "this action
   * records nothing". `Check in`'s takes quantities rather than a party and
   * lives in `checkedInDone` instead.
   */
  done: string | null;
  /** String 5. Present only where it takes no parameter — `Check in`'s own
   *  empty state names a supplier AND a date, and nothing reads it yet. */
  empty: string | null;
}

const PURCHASING_ONLY: Record<
  | "confirm_tomorrows_delivery"
  | "check_in"
  | "confirm_balance_delivery_date"
  | "confirm_what_happens_next",
  PurchasingWord
> = {
  confirm_tomorrows_delivery: {
    // P3 · §3's "the action the portal is missing today". The day before the
    // goods are due, somebody asks the factory whether the van goes tomorrow —
    // and that is when they say it will be late.
    queue: "Confirm tomorrow's delivery",
    line: (p) =>
      `Call ${party(p.supplier, "supplier")} — confirm tomorrow's delivery`,
    button: "Record answer",
    done: "Answer recorded",
    empty: "Nothing arriving tomorrow.",
  },
  check_in: {
    queue: "Check in",
    line: (p) => `Check in from ${party(p.supplier, "supplier")}`,
    button: "Check in",
    done: null,
    empty: null,
  },
  confirm_balance_delivery_date: {
    // P3 · the van came short and somebody has to ask when the rest comes.
    // Counted per PO LINE — the only one of the six that is.
    queue: "Confirm balance delivery date",
    line: (p) =>
      `Call ${party(p.supplier, "supplier")} — confirm balance delivery date`,
    button: "Record balance date",
    done: "Balance date recorded",
    empty: "Nothing short today.",
  },
  confirm_what_happens_next: {
    queue: "Confirm what happens next",
    line: (p) =>
      `Call ${party(p.supplier, "supplier")} — confirm what happens next`,
    button: "Record what happens next",
    done: null,
    empty: "No claim is waiting for a supplier answer.",
  },
};

function purchasingWord(key: PurchasingActionKey): PurchasingWord {
  if (key === "issue_po" || key === "confirm_ready_date") {
    const w = wordFor(key);
    // `button` is non-null for both of these; the assertion is local and true.
    return {
      queue: w.queue,
      line: w.line,
      button: w.button as string,
      done: w.done,
      empty: null,
    };
  }
  return PURCHASING_ONLY[key];
}

/** The queue tile / filter chip / count word — no party (a queue holds many). */
export function purchasingActionQueue(key: PurchasingActionKey): string {
  return purchasingWord(key).queue;
}

/** One record's line — verb + named party + measurable object. */
export function purchasingActionLine(
  key: PurchasingActionKey,
  parties: OrderActionParties = {},
): string {
  return purchasingWord(key).line(parties);
}

/** The button that records the outcome. */
export function purchasingActionButton(key: PurchasingActionKey): string {
  return purchasingWord(key).button;
}

/** What the queue says when it holds nothing. `null` = not mirrored (see above),
 *  and the caller must then say nothing rather than invent a sentence. */
export function purchasingActionEmpty(key: PurchasingActionKey): string | null {
  return purchasingWord(key).empty;
}

/** What the portal says once the outcome is recorded. `null` = not mirrored;
 *  the caller must then say nothing rather than invent a sentence. */
export function purchasingActionDone(key: PurchasingActionKey): string | null {
  return purchasingWord(key).done;
}

/**
 * `Check in`'s DONE message — the dictionary's `Checked in {n} of {m}`.
 *
 * It is a function rather than a table cell because it is the only string in
 * either table whose parameters are QUANTITIES rather than parties.
 */
export function checkedInDone(received: number, ordered: number): string {
  return `Checked in ${received} of ${ordered}`;
}

/**
 * The TWO ANSWERS to `Confirm tomorrow's delivery` — COPY-STANDARD's answers
 * table, ruled by Loo 2026-07-29.
 *
 * They name the DATE rather than saying yes and no, for the same reason
 * `Delay planning`'s name the promised date: the reader must not have to
 * remember what was asked. And for one more, which is Loo's own: **the action
 * opens the working day before the goods are due and stays open until somebody
 * answers it**, so a relative word is true only on the first day —
 * `Shipping tomorrow`, answered two days late, is a sentence about a day that
 * has already gone.
 *
 * `date` is the caller's already-formatted string (`Wed, 5 Aug 26`): this
 * module owns WORDS and never dates.
 */
export function tomorrowDeliveryAnswerLabel(
  answer: "shipping" | "delayed",
  date: string,
): string {
  return answer === "shipping"
    ? `It ships on ${date}`
    : `It ships later than ${date}`;
}

/** Every purchasing queue word, in §4's display order — for a banned-word
 *  guard to walk, and for a test to assert the table is complete. */
export const PURCHASING_ACTION_QUEUES: readonly string[] = (
  [
    "issue_po",
    "confirm_ready_date",
    "confirm_tomorrows_delivery",
    "check_in",
    "confirm_balance_delivery_date",
    "confirm_what_happens_next",
  ] as const
).map(purchasingActionQueue);
