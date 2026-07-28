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
 * PURE — no clock, no I/O, no locale beyond the caller's own money string.
 */

export type OrderActionKey =
  | "send_po"
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
  | "done";

/** The real names this order knows. Absent / blank → the role word. */
export interface OrderActionParties {
  supplier?: string | null;
  logistics?: string | null;
  customer?: string | null;
  /** `Collect RM {amount}` — the caller's formatted integer, WITHOUT "RM". */
  amount?: string | null;
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
 *  the label says what to do without inventing a figure. */
function amountBit(p: OrderActionParties): string | null {
  const a = (p.amount ?? "").trim();
  return a.length > 0 ? `RM ${a}` : null;
}

const WORDS: readonly OrderActionWord[] = [
  {
    key: "send_po",
    queue: "Send PO",
    line: (p) => `Send PO to ${party(p.supplier, "supplier")}`,
    button: "Send PO",
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
 * `Collect RM 2,455 from John Tan` from `{ amount, customer }`.
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
 * in the Actions column (`Collect RM 2,455`). The row line names the customer;
 * the pill sits beside their name already.
 */
export function collectPillLabel(amount: string | null | undefined): string {
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
