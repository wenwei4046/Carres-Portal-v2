/**
 * WHEN THE GOODS REACH US, AS A DELIVERY SURFACE MUST READ IT.
 * `docs/delivery/MASTER.md` §8 · `docs/COPY-STANDARD.md` (Purchasing date facts).
 *
 * PURE. No clock of its own, no I/O: `todayIso` is handed in, so the browser,
 * the tests and a CI runner in UTC cannot disagree about whether a supplier
 * date has passed.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question the Delivery work list asks about every row: *are the goods in,
 * and if not, what date do we actually have — whose date is it, and has
 * anybody moved it?* It answers with a STATE plus the dates behind it. It
 * decides no colour and prints no sentence of its own; the caller renders.
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It computes NO arrival date. `purchase_orders.eta_date` is already
 * `expectedArrivalOf`'s production-plus-transit result, counted on the
 * factory's own week and the office week (`purchasing-settings.ts`), and
 * `official_delivery_date` is the immutable date the supplier was actually
 * given (0428). Recomputing either here would be the second arithmetic Law D
 * exists to prevent — and the one that would silently disagree the first time
 * a supplier's transit days changed.
 *
 * It also invents nothing. No date, no confirmation, no "probably". A purchase
 * order with no date at all produces the governed absence, and the work that
 * closes that gap stays open on Purchasing's own screen.
 *
 * ── THE PRECEDENCE, AND WHY IT MATCHES THE DATABASE ─────────────────────────
 *
 * Per purchase order the EFFECTIVE date is
 * `latest supplier reply → original PO date → our planning prediction`, and
 * across the purchase orders still owing this order's goods it is the LATEST
 * of those — the last thing to arrive is what the delivery waits for. That is
 * exactly the precedence and exactly the `max()` migration 0432's own
 * `purchasing_project_line_etas` projector runs, so Purchasing's projection
 * and this reading cannot drift apart.
 */

import { myHolidaySet } from "./my-holidays";
import { normalizeSkuKey } from "./sku-code";
import { tomorrowDeliveryCallOf } from "./purchasing-supplier-calls";
import { poReplyDateOf, type PoDatePromise } from "./po-workspace";

/**
 * The latest recorded supplier answer about a purchase order's arrival date.
 *
 * `answer` is the stored vocabulary of `po_supplier_promises` (0432 / 0433):
 * `confirmed` · `earlier` · `delayed` · `reported`, plus the legacy `shipping`
 * that pre-0432 rows carry. It is never printed; it is mapped.
 */
export interface PoArrivalReply {
  answer: string;
  /** The date the answer was made ABOUT — the PO date at the time. */
  aboutIso: string | null;
  /** The date we held before this answer. */
  previousIso: string | null;
  /** The date the supplier now gives. Null on a legacy `shipping` row, which
   *  confirmed the date it was asked about rather than naming a new one. */
  newIso: string | null;
  recordedAt: string;
}

/** One purchase order serving a sales order — recorded facts only. */
export interface PoArrival {
  poId: string;
  /** `purchase_orders.status`. Only an OPEN order is still an arrival. */
  status: string | null;
  /** The SKUs this purchase order still OWES (qty > received). */
  owedSkus: string[];
  /** OUR production-plus-transit prediction (`eta_date`). */
  plannedIso: string | null;
  /** The immutable supplier-facing original (`official_delivery_date`). */
  originalIso: string | null;
  reply: PoArrivalReply | null;
}

/** One physically allocated register row, as the list read carries it. */
export interface AllocatedUnit {
  /** Exact stock-to-order-line binding. Absent in older list responses. */
  orderLineId?: string | null;
  sku: string;
  status: "reserved" | "sold";
  /** A bulk register row counts its own `qty` (0218); a unit row counts 1. */
  qty: number;
}

export interface IncomingLineUnit {
  unitCode: string;
  orderLineId: string;
  qty: number;
}

/** A shared PO line cannot identify one SO's physical pieces. Every source
 * must name the same order and item line before incoming Units can be bound. */
export function exclusivePoSourceBindings(sources: readonly {
  po_line_id: string | null;
  order_id: string | null;
  order_line_id: string | null;
}[]): Map<string, { orderId: string; lineId: string }> {
  const grouped = new Map<string, typeof sources[number][]>();
  for (const source of sources) {
    if (source.po_line_id) grouped.set(source.po_line_id, [...(grouped.get(source.po_line_id) ?? []), source]);
  }
  const result = new Map<string, { orderId: string; lineId: string }>();
  for (const [poLineId, owners] of grouped) {
    const first = owners[0]!;
    if (first.order_id && first.order_line_id && owners.every(o => o.order_id === first.order_id && o.order_line_id === first.order_line_id)) {
      result.set(poLineId, { orderId: first.order_id, lineId: first.order_line_id });
    }
  }
  return result;
}

/** A reserved/sold stock record proves receipt only for its explicitly bound line.
 * SKU pooling remains useful for shortages, but cannot prove which repeated line arrived.
 * Missing binding is unknown, not zero received. This is not current-site custody or release.
 */
export function receivedForBoundLine(
  lineId: string | null | undefined,
  requiredQty: number,
  units: readonly AllocatedUnit[] | undefined,
  incoming: readonly IncomingLineUnit[] = [],
): number | null {
  if (!lineId || !units || !Number.isFinite(requiredQty) || requiredQty <= 0) return null;
  const bound = units.filter(unit => unit.orderLineId === lineId);
  const pending = incoming.filter(unit => unit.orderLineId === lineId);
  if (pending.some(unit => !unit.unitCode || !Number.isFinite(unit.qty) || unit.qty <= 0)) return null;
  if (new Set(pending.map(unit => unit.unitCode)).size !== pending.length) return null;
  const pendingQty = pending.reduce((total, unit) => total + unit.qty, 0);
  // Zero is proved only when the entire line has explicitly incoming pieces.
  if (!bound.length) return pendingQty === requiredQty ? 0 : null;
  if (bound.some(unit => !Number.isFinite(unit.qty) || unit.qty <= 0)) return null;
  const qty = bound.reduce((total, unit) => total + unit.qty, 0);
  // Excess bindings are not a reassuring full receipt.
  return qty + pendingQty > requiredQty ? null : qty;
}

/** One committed goods line of the sales order. */
export interface CommittedLine {
  sku: string;
  qty: number;
}

/**
 * What the register physically holds against one committed line.
 *
 * The matching rule is `normalizeSkuKey`, the SAME rule `resolveUnitAllocation`
 * applies — the catalog is empty, so an order line and a register row meet only
 * under it (`project-catalog-empty-sku-naming`).
 */
export interface LineShortage {
  sku: string;
  committedQty: number;
  allocatedQty: number;
  /** `max(0, committed − allocated)` — the EXACT number of missing pieces. */
  shortQty: number;
}

export function lineShortagesOf(
  lines: readonly CommittedLine[],
  units: readonly AllocatedUnit[],
): LineShortage[] {
  const pool = new Map<string, number>();
  for (const u of units) {
    const key = normalizeSkuKey(u.sku);
    pool.set(key, (pool.get(key) ?? 0) + (Number(u.qty) || 0));
  }
  /* A register row answers ONE committed line: two lines of the same SKU share
     the pool in the order they were committed, so the second line reads short
     instead of both claiming the same piece. */
  return lines.map((line) => {
    const key = normalizeSkuKey(line.sku);
    const committedQty = Math.max(0, Number(line.qty) || 0);
    const left = pool.get(key) ?? 0;
    const allocatedQty = Math.min(left, committedQty);
    pool.set(key, left - allocatedQty);
    return {
      sku: line.sku,
      committedQty,
      allocatedQty,
      shortQty: Math.max(0, committedQty - allocatedQty),
    };
  });
}

/**
 * WHERE THE GOODS STAND — the whole delivery, over every committed line.
 *
 * `ready` means the register holds every committed piece. It is deliberately
 * the WHOLE commitment and not the main goods alone: a delivery that arrives
 * without the pillows the customer paid for was not a delivery that was ready.
 * (Delivery MASTER §3 rules that accessories do not BLOCK the core goods —
 * which is a different statement from pretending they are not in the shipment.)
 */
export interface DeliveryStockReadiness {
  ready: boolean;
  shortLines: LineShortage[];
  /** Total missing pieces across every committed line. */
  shortQty: number;
}

export function deliveryStockReadinessOf(
  lines: readonly CommittedLine[],
  units: readonly AllocatedUnit[],
): DeliveryStockReadiness {
  const shortages = lineShortagesOf(lines, units);
  const shortLines = shortages.filter((s) => s.shortQty > 0);
  return {
    ready: lines.length > 0 && shortLines.length === 0,
    shortLines,
    shortQty: shortLines.reduce((n, s) => n + s.shortQty, 0),
  };
}

/**
 * The arrival, as the row must read it.
 *
 * ```
 * on_hand            the register already holds every committed piece
 * no_purchase_order  goods are short and no open purchase order owes them
 * no_date            an open purchase order owes them and carries NO date
 * planned            a date exists and the supplier has not answered about it
 * confirmed          the supplier confirmed the date it was given
 * moved              the supplier gave a DIFFERENT date (later, or earlier)
 * reported           a date the supplier gave on a purchase order whose own
 *                    original was never recorded — a date with no comparison
 * passed             the date we hold is behind us and the goods are not in
 * ```
 *
 * `passed` outranks every other answer for the same reason the Purchase Orders
 * register raises `Supplier delivery date passed`: a date that has gone by
 * without goods is the one fact on the row that still needs a phone call.
 */
export type DeliveryArrivalState =
  | { kind: "on_hand" }
  | { kind: "no_purchase_order" }
  /* ⭐ THREE DIFFERENT ABSENCES, NEVER ONE (owner ruling 2026-09-11). They
     used to share a single `no_date`, which told an operator the factory had
     failed to answer when nobody had asked, and told them nobody had asked
     when the real gap was a production time Purchasing had never set. */
  | { kind: "no_calculation"; poId: string }
  | { kind: "awaiting_reply"; dateIso: string; askedByIso: string | null; poId: string }
  | { kind: "late_no_date"; originalIso: string | null; poId: string }
  | { kind: "planned"; dateIso: string; poId: string }
  | { kind: "confirmed"; dateIso: string; poId: string }
  | { kind: "moved"; dateIso: string; originalIso: string; later: boolean; poId: string }
  | { kind: "reported"; dateIso: string; poId: string }
  | { kind: "passed"; dateIso: string; originalIso: string | null; poId: string };

/**
 * The supplier's own answer date for one purchase order, or null.
 *
 * ⭐ ONE ARITHMETIC (Architecture Law D). `poReplyDateOf` already owns this
 * rule for the Purchase Orders workspace, and this file must not hold a second
 * one that agrees on most rows and disagrees on the row that matters: a
 * **legacy `shipping`** answer confirmed the date it was asked ABOUT, and
 * every 0430 answer names its date in `new_date`.
 *
 * The disagreement this delegation removes (found in the 2026-09-11 render
 * walk): a local `newIso ?? aboutIso` fallback made a `delayed` reply that
 * named NO new day mean *"the supplier confirmed the day we asked about"*. A
 * supplier saying **"late, and I cannot tell you when"** was therefore shown as
 * that dead date, and — once it went by — as `Supplier delivery date passed`.
 * That is precisely the conflation the owner's correction forbids: a missing
 * calculation, an unanswered enquiry and an evidenced *late, no date* answer
 * are three different facts.
 */
function replyDateOf(reply: PoArrivalReply | null): string | null {
  if (!reply) return null;
  return poReplyDateOf({
    kind: "tomorrow_delivery",
    answer: reply.answer,
    about_date: reply.aboutIso,
    previous_date: reply.previousIso,
    new_date: reply.newIso,
    /* The shared row carries recording metadata this projection does not; the
       date rule reads none of it, and the API has already proved the evidence
       (only an evidenced reply reaches `po_arrivals` at all). */
    id: "",
    po_id: "",
    po_version: 0,
    channel: null,
    recipient: null,
    evidence: null,
    reported_by: null,
    reported_at: null,
    recorded_by: null,
    reason: null,
    recorded_at: reply.recordedAt,
  } as PoDatePromise);
}

/** Per purchase order: reply → original → our prediction (0432's precedence). */
export function effectiveArrivalOf(po: PoArrival): string | null {
  return replyDateOf(po.reply) ?? po.originalIso ?? po.plannedIso ?? null;
}

export interface ArrivalStateInput {
  /** Every purchase order linked to this sales order. */
  arrivals: readonly PoArrival[];
  /** The delivery's own stock answer — `on_hand` comes from here, never from a
   *  purchase order being absent. */
  readiness: DeliveryStockReadiness;
  todayIso: string;
  /** Malaysian public holidays, for the arrival-check clock. Omitted → the
   *  live set, the same one every other Carres clock counts on. */
  holidays?: ReadonlySet<string>;
}

/**
 * ⭐ HAS ANYBODY ACTUALLY ASKED THE SUPPLIER YET?
 *
 * The answer is NOT this module's to invent: `tomorrowDeliveryCallOf` owns the
 * advance arrival check — when it opens, when it is late, and when a moved date
 * re-opens it (Law D). This asks that ONE engine and reports what it said.
 *
 * The engine needs a line to know the order still owes something; `owedSkus`
 * has already proved exactly that, so one standing line carries the fact rather
 * than a quantity this row does not have and would otherwise invent.
 */
function arrivalEnquiryOf(
  po: PoArrival,
  todayIso: string,
  holidays: ReadonlySet<string>,
): { open: boolean; dueIso: string | null } {
  const call = tomorrowDeliveryCallOf(
    {
      poId: po.poId,
      supplierId: "",
      status: (po.status ?? "open") as string,
      etaDateIso: po.plannedIso ?? po.originalIso ?? null,
      tomorrowAnswerAboutDateIso: po.reply?.aboutIso ?? null,
      lines: po.owedSkus.map((sku) => ({
        id: `${po.poId}#${sku}`,
        sku,
        qty: 1,
        receivedQty: 0,
        shortSinceIso: null,
        balanceAnswerAboutQty: null,
      })),
    },
    { todayIso, holidays },
  );
  return { open: call !== null, dueIso: call?.dueIso ?? null };
}

/**
 * ONE arrival answer for one delivery row.
 *
 * Only OPEN purchase orders that still owe units are considered: a fully
 * received order has no arrival left to report, and printing its date would be
 * history dressed up as a plan.
 */
export function deliveryArrivalStateOf(input: ArrivalStateInput): DeliveryArrivalState {
  const { arrivals, readiness, todayIso } = input;
  const holidays = input.holidays ?? myHolidaySet();
  if (readiness.ready) return { kind: "on_hand" };

  const owing = arrivals.filter(
    (a) => (a.status ?? "open") === "open" && a.owedSkus.length > 0,
  );
  if (owing.length === 0) return { kind: "no_purchase_order" };

  /* ⭐ AN ANSWER THAT NAMES NO DAY KILLS THE DAY IT WAS ABOUT.
     A supplier who says *late, and I cannot tell you when* has told us the
     date we were holding is gone. Falling back to that original — as the
     per-order precedence otherwise would — reports a date nobody stands
     behind, and once it goes by the row reads `Supplier delivery date
     passed`, which blames the calendar for a fact the supplier stated.
     This case therefore outranks every dated order still owing: the delivery
     waits for the last piece, and the last piece has no date. */
  const answeredWithNoDate = owing.find(
    (po) => po.reply !== null && replyDateOf(po.reply) === null,
  );
  if (answeredWithNoDate) {
    return {
      kind: "late_no_date",
      originalIso: answeredWithNoDate.originalIso,
      poId: answeredWithNoDate.poId,
    };
  }

  /* The LATEST effective date across everything still owed — the delivery
     waits for the last piece, not the first (0432's own `max`). */
  let chosen: PoArrival | null = null;
  let chosenDate: string | null = null;
  for (const po of owing) {
    const date = effectiveArrivalOf(po);
    if (date === null) continue;
    if (chosenDate === null || date > chosenDate) {
      chosen = po;
      chosenDate = date;
    }
  }

  if (!chosen || chosenDate === null) {
    /* Nothing owing carries a date and nobody has answered: the gap is OURS,
       not the factory's. Telling the operator the supplier failed to answer
       when nobody asked is the lie the single old `no_date` state told. */
    return { kind: "no_calculation", poId: owing[0]!.poId };
  }

  if (chosenDate < todayIso) {
    return {
      kind: "passed",
      dateIso: chosenDate,
      originalIso:
        chosen.originalIso && chosen.originalIso !== chosenDate ? chosen.originalIso : null,
      poId: chosen.poId,
    };
  }

  const reply = chosen.reply;
  if (!reply) {
    /* A date with no reply is one of TWO facts, and the advance arrival check
       tells them apart: before the check opens it is simply our plan; once it
       is open the supplier has been asked and has not answered. */
    const enquiry = arrivalEnquiryOf(chosen, todayIso, holidays);
    return enquiry.open
      ? {
          kind: "awaiting_reply",
          dateIso: chosenDate,
          askedByIso: enquiry.dueIso,
          poId: chosen.poId,
        }
      : { kind: "planned", dateIso: chosenDate, poId: chosen.poId };
  }

  const original = chosen.originalIso;
  if (reply.answer === "reported" || original === null) {
    return { kind: "reported", dateIso: chosenDate, poId: chosen.poId };
  }
  if (chosenDate === original) {
    return { kind: "confirmed", dateIso: chosenDate, poId: chosen.poId };
  }
  return {
    kind: "moved",
    dateIso: chosenDate,
    originalIso: original,
    later: chosenDate > original,
    poId: chosen.poId,
  };
}

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE — and every one of them already governed
 * by `docs/COPY-STANDARD.md`. Nothing here is a new coinage:
 *
 * ```
 * Expected arrival                  the column word (the booking-call words)
 * PO Delivery Date                  the original supplier-facing date
 * Not confirmed                     no evidenced supplier reply yet
 * Same as PO                        the supplier confirmed the date it was given
 * Earlier than the PO date          the reply form's own comparison word
 * Delayed                           the reply form's own comparison word
 * Date reported                     a reply on a purchase order whose original
 *                                   was never recorded (0432's fourth answer)
 * Supplier delivery date passed     the purchasing action's own fact line
 * Waiting supplier reply            the Receiving exception lifecycle's own
 *                                   word for an asked-and-unanswered enquiry
 * The factory has not given a date  the booking-call words' own absence — and
 *                                   it belongs to exactly ONE case: a supplier
 *                                   who ANSWERED and named no day
 * Everything is on hand             the booking-call words' positive state
 * ```
 *
 * ONE word is new and is registered in COPY-STANDARD beside these:
 * `No expected arrival calculated` — nobody has asked the supplier and nobody
 * could compute a date either, because the production or transit time this
 * supplier and category need has never been set. Saying `The factory has not
 * given a date` there would blame a factory nobody contacted.
 */
export const ARRIVAL_COPY = {
  column: "Expected arrival",
  original: "PO Delivery Date",
  notConfirmed: "Not confirmed",
  sameAsPo: "Same as PO",
  earlier: "Earlier than the PO date",
  delayed: "Delayed",
  reported: "Date reported",
  passed: "Supplier delivery date passed",
  /** The supplier was ASKED and has not answered — never a missing date. */
  awaitingReply: "Waiting supplier reply",
  /** No date exists and nobody has asked for one: the gap is OURS. */
  noCalculation: "No expected arrival calculated",
  /** A recorded supplier answer that named no new day. */
  noDate: "The factory has not given a date",
  onHand: "Everything is on hand",
  /** Goods are short and nothing has been bought for them — the Orders
   *  ladder's own fact, stated rather than dressed as an arrival. */
  noPurchaseOrder: "No purchase order raised yet",
  /** The `Stock` column's two words. */
  stockReady: "Ready",
  stockNotReady: "Not ready",
  /** `2 short` — the exact missing pieces on one goods line. */
  short: (n: number) => `${n} short`,
  /** The day the advance arrival check was due — evidence that the enquiry is
   *  genuinely open, not a guess that somebody probably asked. */
  askedBy: (date: string) => `asked by ${date}`,
} as const;

/** The one-line note under the date — every state has one, because a date with
 *  no owner is a date the operator has to guess about. */
export function arrivalNoteOf(state: DeliveryArrivalState): string {
  switch (state.kind) {
    case "on_hand":
      return ARRIVAL_COPY.onHand;
    case "no_purchase_order":
      return ARRIVAL_COPY.noPurchaseOrder;
    case "no_calculation":
      return ARRIVAL_COPY.noCalculation;
    case "awaiting_reply":
      return ARRIVAL_COPY.awaitingReply;
    case "late_no_date":
      return ARRIVAL_COPY.noDate;
    case "planned":
      return ARRIVAL_COPY.notConfirmed;
    case "confirmed":
      return ARRIVAL_COPY.sameAsPo;
    case "moved":
      return state.later ? ARRIVAL_COPY.delayed : ARRIVAL_COPY.earlier;
    case "reported":
      return ARRIVAL_COPY.reported;
    case "passed":
      return ARRIVAL_COPY.passed;
  }
}

/**
 * ⭐ THE CELL'S OWN SENTENCE — the date AND what it means, for the tooltip and
 * the screen reader (owner ruling 2026-09-11).
 *
 * The cell shows an icon and a compact date; repeating `Delayed` under every
 * row turned a column of dates into a column of the same four words. The
 * MEANING does not disappear with the visible line — it moves here, where a
 * hover and a screen reader both find it, and where the ORIGINAL date is named
 * rather than left as an unexplained second number.
 *
 * The caller supplies the printed date strings; `fmt-date.ts` owns spelling.
 */
export function arrivalSentenceOf(
  state: DeliveryArrivalState,
  fmt: (iso: string) => string,
): string {
  const note = arrivalNoteOf(state);
  switch (state.kind) {
    case "on_hand":
    case "no_purchase_order":
    case "no_calculation":
      return note;
    case "late_no_date":
      return state.originalIso
        ? `${note} · ${ARRIVAL_COPY.original} ${fmt(state.originalIso)}`
        : note;
    case "awaiting_reply":
      return state.askedByIso
        ? `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note} · ${ARRIVAL_COPY.askedBy(fmt(state.askedByIso))}`
        : `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note}`;
    case "moved":
      return `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note} · ${ARRIVAL_COPY.original} ${fmt(state.originalIso)}`;
    case "passed":
      return state.originalIso
        ? `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note} · ${ARRIVAL_COPY.original} ${fmt(state.originalIso)}`
        : `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note}`;
    case "planned":
    case "confirmed":
    case "reported":
      return `${ARRIVAL_COPY.column} ${fmt(state.dateIso)} · ${note}`;
  }
}

/** The date the cell prints first, or null when there is none to print. */
export function arrivalDateOf(state: DeliveryArrivalState): string | null {
  return "dateIso" in state ? state.dateIso : null;
}

/**
 * Is this arrival a SUPPLIER exception?
 *
 * Exactly two states are: a date that has gone by without goods, and an open
 * purchase order owing goods with no date at all. They wear the restrained
 * amber treatment (owner ruling 2026-09-10); red belongs to overdue LOGISTICS
 * work and is applied locally, never across a row. A `moved` date is NOT an
 * exception by itself — a supplier who tells us early is doing the right
 * thing, and painting the row for it would teach the operator to ignore the
 * colour on the day it means something.
 */
export function isArrivalException(state: DeliveryArrivalState): boolean {
  return (
    state.kind === "passed" ||
    state.kind === "late_no_date" ||
    state.kind === "no_calculation"
  );
}
