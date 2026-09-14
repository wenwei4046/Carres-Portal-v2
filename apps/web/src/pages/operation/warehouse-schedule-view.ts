/**
 * WAREHOUSE SCHEDULE — the view logic, and ONLY the view logic.
 *
 * Every rule the Schedule card renders lives here as a pure function, so the
 * rules can be tested without a DOM and so the component below cannot quietly
 * grow a second opinion about what a number means.
 *
 * THE ONE LAW THIS FILE EXISTS TO KEEP: **an absent fact is printed as absent.**
 * `receivedQty: null` is "no owning record states it" and renders the planned
 * quantity alone — never a `0 of 3` nobody recorded. `0` is a record that says
 * zero, and it looks different. The two are not allowed to converge, because
 * converged they tell the operator that a supplier delivered nothing when the
 * truth is that nobody has looked yet.
 *
 * It also owns NOTHING about layout, colour hexes or navigation destinations.
 * Words come from `docs/COPY-STANDARD.md`; colour arrives as a kit tone name.
 */
import type { IconName } from "@/components/kit/Icon";
import type {
  OrderActionTone,
  WarehouseScheduleCard,
  WarehouseScheduleDateStatus,
  WarehouseScheduleDirection,
  WarehouseScheduleLine,
} from "@carres/shared";

/* ─────────────────────────────────────────────────────────────────────────
 * The two pages.
 * ──────────────────────────────────────────────────────────────────────── */

/** The `?tab=` address of each Schedule page. */
export const SCHEDULE_TAB: Record<WarehouseScheduleDirection, string> = {
  arrival: "warehouse-arrival-schedule",
  pickup: "warehouse-pickup-schedule",
};

/** The page's own name — COPY-STANDARD, owner ruling 2026-09-14. */
export const SCHEDULE_PAGE_WORD: Record<WarehouseScheduleDirection, string> = {
  arrival: "Arrival Schedule",
  pickup: "Pickup Schedule",
};

/**
 * The retired addresses. Both resolve to Arrival Schedule so no bookmark
 * breaks (the `stock-onhand` precedent) — and both keep their `date` and
 * `site` parameters, which is the whole reason somebody bookmarked them.
 */
export const LEGACY_SCHEDULE_TABS = new Set(["warehouse-monitor", "warehouse-dashboard"]);

/* ─────────────────────────────────────────────────────────────────────────
 * §3 · The special movement label.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * An ORDINARY supplier arrival and an ORDINARY customer pickup print no
 * event-type heading at all: the page is already called Arrival Schedule, and
 * repeating `Supplier arrival` on every card of an all-supplier column is the
 * repeated heading the owner removed.
 */
const ORDINARY_KINDS = new Set(["supplier-delivery", "customer_delivery_pickup"]);

/**
 * The kinds that DO earn a label, spelt exactly as COPY-STANDARD spells them
 * (the Monitor ARRIVAL / PICKUP event names, §Warehouse). Arrival keys are
 * kebab and the pickup key is snake because both are passed through from the
 * owning record's stored value — a stored value is never re-spelt into a
 * prettier key on its way to a screen.
 *
 * `supplier-return` and `repair-pickup` have NO owning record today (BUILD B,
 * 2026-09-14: Delivery's feed projects customer pickups only). They are mapped
 * because the movement is real and the label must be right the day the record
 * exists — not because anything renders them now.
 */
const SPECIAL_MOVEMENT_LABEL: Record<string, string> = {
  // ARRIVAL
  transfer: "Transfer arrival",
  "customer-return": "Customer/failed-delivery return",
  "failed-delivery-return": "Customer/failed-delivery return",
  "repair-return": "Return from repair",
  "supplier-replacement": "Supplier replacement",
  // PICKUP
  "transfer-pickup": "Transfer pickup",
  "supplier-return": "Supplier-return pickup",
  "repair-pickup": "Repair pickup",
};

/**
 * `null` means "print no heading" — for an ordinary movement AND for a kind
 * this portal has no word for. A raw storage key (`stock_flag_repair`) is
 * never allowed to reach the screen, so an unknown kind stays silent rather
 * than putting the database's vocabulary in front of an operator.
 */
export function specialMovementLabelOf(kind: string): string | null {
  const key = kind.trim();
  if (ORDINARY_KINDS.has(key)) return null;
  return SPECIAL_MOVEMENT_LABEL[key] ?? null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * §4 · The category visual slot.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * categoryKey → the kit glyph, and the category's own word for the glyph's
 * accessible name. Local on purpose: the card forbids expanding the global
 * icon kit for this work, so the five product glyphs the kit already has do
 * the distinguishing and everything else falls to `goods`.
 *
 * The WORD is what keeps that honest — three categories share the Package
 * glyph, and a screen reader still hears `Footrest`, `Accessory`, `Topper`.
 * The category is never inferred from the model text (card rule): a key the
 * owning record did not state renders the neutral glyph and no claim.
 */
const CATEGORY_VISUAL: Record<string, { glyph: IconName; word: string }> = {
  mattress: { glyph: "mattress", word: "Mattress" },
  bedframe: { glyph: "bedframe", word: "Bedframe" },
  sofa: { glyph: "sofa", word: "Sofa" },
  pillow: { glyph: "pillow", word: "Pillow" },
  protector: { glyph: "protector", word: "Mattress protector" },
  "mattress protector": { glyph: "protector", word: "Mattress protector" },
  "mattress-protector": { glyph: "protector", word: "Mattress protector" },
  topper: { glyph: "protector", word: "Topper" },
  footrest: { glyph: "goods", word: "Footrest" },
  accessory: { glyph: "goods", word: "Accessory" },
  service: { glyph: "goods", word: "Service" },
  "other goods": { glyph: "goods", word: "Other goods" },
};

export function categoryVisualOf(categoryKey: string | null): {
  glyph: IconName;
  /** `null` when the record states no category — the slot claims nothing. */
  word: string | null;
} {
  const key = (categoryKey ?? "").trim().toLowerCase();
  if (!key) return { glyph: "goods", word: null };
  const hit = CATEGORY_VISUAL[key];
  return hit ? { glyph: hit.glyph, word: hit.word } : { glyph: "goods", word: null };
}

/* ─────────────────────────────────────────────────────────────────────────
 * §4 · Progress on one product line.
 * ──────────────────────────────────────────────────────────────────────── */

export type LineProgressState = "unknown" | "none" | "partial" | "complete";

export interface LineProgress {
  state: LineProgressState;
  planned: number;
  /** `null` for `unknown` — there is no number to show, so none is shown. */
  done: number | null;
  /** Exactly what is printed. `unknown` prints the planned quantity ALONE. */
  text: string;
  /** What that number MEANS, for the screen reader and the tooltip. */
  status: string;
  tone: OrderActionTone;
}

/** Arrivals are received; pickups are loaded. One verb each, never mixed. */
const DONE_WORD: Record<WarehouseScheduleDirection, string> = {
  arrival: "received",
  pickup: "loaded",
};

/** What the planned number alone means, when nothing has been recorded. */
const PLANNED_WORD: Record<WarehouseScheduleDirection, string> = {
  arrival: "expected, receipt not recorded",
  pickup: "to load, loading not recorded",
};

export function lineProgressOf(
  line: Pick<WarehouseScheduleLine, "plannedQty" | "receivedQty" | "loadedQty">,
  direction: WarehouseScheduleDirection,
): LineProgress {
  const planned = line.plannedQty;
  const done = direction === "arrival" ? line.receivedQty : line.loadedQty;

  /* THE ABSENT CASE. No owning record states a result, so the card states a
     plan and stops. A `0 of 3` here would be a number this portal invented. */
  if (done === null || done === undefined) {
    return {
      state: "unknown",
      planned,
      done: null,
      text: `${planned}`,
      status: `${planned} ${PLANNED_WORD[direction]}`,
      tone: "neutral",
    };
  }

  const verb = DONE_WORD[direction];
  const text = `${done}/${planned}`;
  const status = `${done} of ${planned} ${verb}`;

  /* A RECORDED zero. Same shape as a partial, deliberately different from the
     absent case above — somebody looked, and the answer was nothing. */
  if (done <= 0) return { state: "none", planned, done, text, status, tone: "neutral" };
  if (done < planned) return { state: "partial", planned, done, text, status, tone: "warning" };
  return { state: "complete", planned, done, text, status, tone: "success" };
}

/* ─────────────────────────────────────────────────────────────────────────
 * §1 · The date-status pill.
 * ──────────────────────────────────────────────────────────────────────── */

/** COPY-STANDARD words. `null` in → nothing out: an unknown stays unknown. */
export function dateStatusPillOf(
  status: WarehouseScheduleDateStatus | null,
): { word: string; tone: OrderActionTone } | null {
  if (status === "expected") return { word: "Expected", tone: "warning" };
  if (status === "scheduled") return { word: "Scheduled", tone: "info" };
  return null;
}

/**
 * The card's TINT, and it means one thing only: whether the date is agreed.
 * It never encodes progress, damage or lateness — those are their own lines,
 * and a tint that meant two things would mean neither.
 */
export function cardTintClassOf(status: WarehouseScheduleDateStatus | null): string {
  if (status === "expected") return "border-kit-amber-6 bg-kit-amber-3";
  if (status === "scheduled") return "border-kit-blue-6 bg-kit-blue-3";
  return "border-kit-slate-5 bg-white";
}

/* ─────────────────────────────────────────────────────────────────────────
 * §2 · The source references.
 * ──────────────────────────────────────────────────────────────────────── */

export interface CardReference {
  ref: string;
  /** The record's own page, when the projection supplied one for that ref. */
  href: string | null;
}

export interface CardReferences {
  primary: CardReference;
  secondary: CardReference | null;
}

/**
 * An arrival's primary reference is the OWNING source record — a PO number
 * where a PO owns it, and whatever else owns it where one does not. A pickup
 * leads with the Sales Order, because the SO is the number the customer, the
 * salesperson and the collections desk all say out loud; the Delivery Order
 * follows it when both exist.
 *
 * No TCF legacy reference appears on either page (card rule).
 */
export function cardReferencesOf(card: WarehouseScheduleCard): CardReferences {
  /* A reference carries its own link when the projection listed one for it.
     That is what lets the SO and the DO each appear EXACTLY ONCE and still be
     openable: before this, the SO was printed here as text and AGAIN at the
     bottom as a related record, purely so the link had somewhere to live. */
  const linkOf = (ref: string): string | null =>
    card.relatedRecords.find((r) => r.ref === ref)?.href ?? null;
  const at = (ref: string): CardReference => ({ ref, href: linkOf(ref) });

  if (card.direction === "pickup") {
    if (card.soRef && card.doRef)
      return { primary: at(card.soRef), secondary: at(card.doRef) };
    if (card.soRef) return { primary: at(card.soRef), secondary: null };
    if (card.doRef) return { primary: at(card.doRef), secondary: null };
  }
  return { primary: at(card.sourceRef), secondary: null };
}

/**
 * The related records that are NOT already printed as a reference above.
 *
 * The bottom row exists for records the card does not otherwise name — a
 * posted GRN, a return's source document. Repeating the SO there, when the SO
 * is the first thing the card says, is the duplicate measured on production
 * 2026-09-14.
 */
export function extraRelatedRecordsOf(
  card: WarehouseScheduleCard,
): WarehouseScheduleCard["relatedRecords"] {
  const shown = new Set(
    [cardReferencesOf(card).primary.ref, cardReferencesOf(card).secondary?.ref].filter(
      (r): r is string => Boolean(r),
    ),
  );
  return card.relatedRecords.filter((r) => !shown.has(r.ref));
}

/* ─────────────────────────────────────────────────────────────────────────
 * §5 · Exception lines — evidence-backed, or absent.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ExceptionLine {
  key: string;
  text: string;
  tone: OrderActionTone;
}

/**
 * The card's exception lines, in the order they are read.
 *
 * DAMAGE IS A SEPARATE WARNING AND IS ALREADY IN THE RECEIVED COUNT. The
 * sentence has to carry both halves: adding damage to received would double a
 * Unit, and letting `3 of 3 received` stand alone would tell the operator
 * three saleable Units are on the shelf when one of them is broken.
 *
 * DRIVER CONFIRMATION IS NOT LOADING. Loading is the warehouse's own act; the
 * driver's count is the logistics side's, and the two disagreeing is exactly
 * the exception worth seeing — so it gets its own line and never merges into
 * the progress numbers.
 */
export function exceptionLinesOf(card: WarehouseScheduleCard): ExceptionLine[] {
  const out: ExceptionLine[] = [];

  if (card.overdue) {
    out.push({ key: "overdue", text: "Overdue", tone: "danger" });
  }

  const damaged = card.lines.reduce((n, l) => n + (l.damagedQty ?? 0), 0);
  if (damaged > 0) {
    out.push({
      key: "damaged",
      text: `${damaged} received with issue · counted in received, not available stock`,
      tone: "danger",
    });
  }

  if (card.driverConfirmedQty !== null && card.driverConfirmedQty !== undefined) {
    out.push({
      key: "driver",
      text: `Driver confirmed ${card.driverConfirmedQty}`,
      tone: "neutral",
    });
  }

  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
 * The board.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * The cards standing on one date. Order is the projection's order — this file
 * does not re-sort, because the owning feed knows the real sequence and a
 * second sort here would be a second opinion.
 *
 * A card with NO date stands on no column: an undated arrangement is not
 * secretly today's work, and putting it on today would invent an agreement.
 */
export function cardsOnDate(
  cards: WarehouseScheduleCard[],
  date: string,
): WarehouseScheduleCard[] {
  return cards.filter((c) => c.date === date);
}

/** Cards the board cannot place, so the page can say so instead of dropping them. */
export function undatedCards(cards: WarehouseScheduleCard[]): WarehouseScheduleCard[] {
  return cards.filter((c) => !c.date);
}

/**
 * What an empty column says — and it is never `No arrangements` when a feed
 * failed. `cards: []` with a non-empty `errors` is a BROKEN READ, and the one
 * sentence an operator must never be told in that state is that their day is
 * clear.
 */
export function emptyDayWordOf(direction: WarehouseScheduleDirection, feedFailed: boolean): string {
  if (feedFailed) return "The schedule could not be read for this date.";
  return direction === "arrival" ? "Nothing arriving." : "Nothing for pickup.";
}

/* ─────────────────────────────────────────────────────────────────────────
 * The date column heading.
 * ──────────────────────────────────────────────────────────────────────── */

export interface DateHeadingParts {
  /** `Mon` — the label above the number. */
  weekday: string;
  /** `15` — the number, set at the page-title size. */
  day: string;
  /** `Sep` — the label below the number. */
  month: string;
}

/**
 * The three parts of a date column heading, split so each can carry its own
 * type token (the number reads at 24px, the two labels at 11px).
 *
 * The ISO string is split by hand rather than passed to `new Date(iso)`: that
 * constructor reads a bare `YYYY-MM-DD` as UTC midnight, which in Malaysia's
 * +08 renders the PREVIOUS day's name on every single column.
 */
export function dateHeadingPartsOf(iso: string): DateHeadingParts {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return { weekday: "", day: iso, month: "" };
  const local = new Date(y, m - 1, d);
  return {
    weekday: local.toLocaleDateString("en-GB", { weekday: "short" }),
    day: String(d),
    month: local.toLocaleDateString("en-GB", { month: "short" }),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Work the board cannot place.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Why the undated count is a DISCLOSURE and not a link to the register.
 *
 * The obvious move was to send the operator to Inbound filtered to "no date".
 * BUILD B tested that against the real `filterInbound` (2026-09-14) and it
 * cannot be done honestly: a date range DROPS every undated row, so a dated
 * link can never reach them; a link with no date param lands on all 62
 * arrangements rather than the 20 that need a date; and no undated-only filter
 * word exists. Inventing one would change a Register to answer a Schedule's
 * question.
 *
 * The records are already here. `undatedCards` IS exactly that set, already
 * scoped to this direction and this Site by the projection — so warehouse and
 * direction are preserved by construction rather than rebuilt into a query
 * string. Each row then uses its OWN `openHref`, which carries tab + site +
 * source and deliberately carries no date, because a date filter would exclude
 * the very record the link is for.
 *
 * Nothing here dates anything, and nothing undated is ever overdue.
 */
export function undatedSummaryWordOf(count: number): string {
  return count === 1
    ? "1 with no date yet — not shown on any column"
    : `${count} with no date yet — not shown on any column`;
}
