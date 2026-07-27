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
  | "agree_new_delivery_date"
  | "assign_logistics"
  | "confirm_delivery_date"
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
  },
  {
    key: "confirm_ready_date",
    queue: "Confirm ready date",
    line: (p) => `Call ${party(p.supplier, "supplier")} — confirm ready date`,
  },
  {
    key: "agree_new_delivery_date",
    queue: "Agree new delivery date",
    line: (p) =>
      `Call ${party(p.customer, "customer")} — agree new delivery date`,
  },
  {
    // Nobody outside is involved — the party is what you are choosing, so it
    // cannot be named yet (COPY-STANDARD keeps this one as it stands).
    key: "assign_logistics",
    queue: "Assign logistics",
    line: () => "Assign logistics",
  },
  {
    key: "confirm_delivery_date",
    queue: "Confirm delivery date",
    line: (p) =>
      `Call ${party(p.logistics, "logistics")} — confirm delivery date`,
  },
  {
    key: "deliver_today",
    queue: "Deliver today",
    line: () => "Deliver today",
  },
  {
    key: "upload_delivery_photo",
    queue: "Upload delivery photo",
    line: () => "Upload delivery photo",
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
  },
  {
    key: "collect",
    queue: "Collect",
    line: (p) => {
      const money = amountBit(p);
      const who = party(p.customer, "customer");
      return money ? `${money} from ${who}` : `Collect from ${who}`;
    },
  },
  {
    // Terminal FACT, not an action — it lives here so the ladder has one place
    // to read every word it can return.
    key: "done",
    queue: "Done",
    line: () => "Done",
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
