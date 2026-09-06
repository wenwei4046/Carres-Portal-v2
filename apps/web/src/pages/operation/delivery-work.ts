/**
 * DELIVERY WORK — the arithmetic behind the manual planning workspace.
 * `CARD-2026-08-21-delivery-02-work-layout` · `docs/delivery/MASTER.md` §8.
 *
 * PURE. No React, no I/O, no clock of its own: every function that needs
 * "today" is handed it, so the browser, the tests and a CI runner in UTC can
 * never disagree about which day a delivery sits on.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question, asked once: *which delivery scopes exist, when is each one
 * actually going, and who is carrying it?* Everything the page renders — the
 * rows, the two rails and their counts — comes out of here, so the rail count
 * and the listing it filters to cannot be two different numbers (Architecture
 * Law D: a derived fact has ONE arithmetic).
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It writes nothing and it invents no truth. Sales Orders owns the customer,
 * the address and the promise; Stock owns the Unit; Delivery owns the scope,
 * the Logistics Partner, the confirmed operational date and the document. This
 * file only READS those owners and arranges what they already say.
 *
 * ── SCOPE vs JOURNEY LEG ────────────────────────────────────────────────────
 *
 * One parent row is one DELIVERY SCOPE — normally the whole order's trip. When
 * the order carries a multi-leg Delivery Journey (`orders.delivery_stops`, the
 * KL → JB → Singapore case in `docs/orders/MASTER.md`), each leg is its OWN
 * row: leg 1 finishing means the goods reached the named JB warehouse, which is
 * not the same event as the Singapore customer receiving them, and one row
 * cannot honestly carry both.
 */

import {
  deliveryOrderStatusOf,
  deliveryWorkStatusOf,
  lineKind,
  DELIVERY_WORK_STATUS_LABEL,
  type DeliveryArrangementRow,
  type DeliveryWorkStatus,
  type DeliveryHandoverKind,
  type DeliveryOrderStatus,
  type DeliveryStop,
} from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import { orderBookingDay } from "@/lib/order-booking";
import { detectState } from "@/lib/region";
import type {
  DeliveryOrderAttemptRow,
  DeliveryOrderRow,
  DeliveryHandoverKindRow,
  operationOrderListRow,
} from "@/lib/queries";
import { conciseLocality } from "./sales-order-columns";
import { itemsSummary } from "./sales-order-facts";

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD).
 *
 * `Pending` · `Not booked` · `need booking` · `Unscheduled` · `Today` ·
 * `Tomorrow` · `Due` · `Next Action` · `Priority` are all banned, and the ban
 * is the reason this object exists: a page that spells its own absences grows
 * a synonym the dictionary never approved. An absence here always states the
 * fact (*no confirmed date*), never the mood (*pending*).
 */
export const DW = {
  page: "Delivery",
  docTitle: "Delivery — Carres",
  search: "Search delivery scopes…",
  empty: "No delivery scopes",
  loadFailed: "Delivery could not be loaded",
  tryAgain: "Try again",
  railDate: "DELIVERY SCHEDULE",
  railRegion: "REGION",
  railLogistics: "LOGISTICS",
  railAll: "All",
  /** A scope Delivery has not yet fixed an operational date for. */
  noConfirmedDate: "No confirmed date",
  /**
   * A confirmed date that is already behind us and has produced no result.
   * Renamed from `Date passed` by owner ruling 2026-08-24: `Overdue` is the
   * word the operator uses for it, and the rail is a work queue rather than a
   * description of the calendar. (Both 2026-08-24 lanes made this rename
   * independently; the KEY follows the word here.)
   */
  overdue: "Overdue",
  /** No Logistics Partner on the scope yet — a fact, never `Unassigned`. */
  noLogistics: "No logistics picked",
  /**
   * `DO No`'s absence, and ONLY `DO No`'s.
   *
   * It used to double as the `Delivery Status` cell too. The owner overturned
   * that on 2026-08-24: a status column must say where the WORK is, and "there
   * is no document" says where the paperwork is. `Delivery Status` now runs
   * the seven-rung operational ladder (`deliveryWorkStatusOf`) and this string
   * went back to answering one question.
   */
  noDeliveryOrder: "No delivery order yet",
  noCustomerDate: "No delivery date",
  notGiven: "Not given",
  notRecorded: "Not recorded",
  /** The portal's established absence FORM — `No <the exact thing>`, as in
   *  `No delivery date` and `No delivery order yet`. Flagged in the card as a
   *  new absence for Jess to confirm, never as pre-approved vocabulary. */
  noTime: "No time agreed",
  noGoods: "No items on this order",
  /** Why an order is NOT delivery work yet — Sales owns each of these. */
  blockerNoLocation: "No delivery address",
  blockerNoBuilding: "No building or access facts",
  blockerNoGoods: "No goods to deliver",
  notYetHere: "Not delivery work yet",
  /** The disclosure's hover — what OPENS, never the mechanic. */
  showItems: "Show delivery items",
  /** The expansion's Loan block heading (owner wording 2026-08-24). */
  itemsToCollect: "Items to collect",
  /** The expansion's read-only physical facts (Stock and Warehouse own them). */
  where: "Where",
  whoHasIt: "Who has it",
  stockEta: "Stock ETA",
  loanHeading: "Loan with the customer",
  loanUnit: "Unit ID",
  loanItem: "Item",
  loanSince: "With customer since",
  loanReturnTo: "Return destination",
  loanReturnWarehouse: "Carres Warehouse",
} as const;

/**
 * The governed Logistics Partners, in the owner's ruled rail order. They are
 * ALWAYS on the rail, count or no count: a roster that hides a quiet partner
 * teaches the operator that the rail is a result rather than the list of people
 * who can carry goods. Anyone else in the partner table joins below them, and
 * only when they are actually carrying a scope.
 */
export const GOVERNED_LOGISTICS = [
  "NETS",
  "AL",
  "TEOW",
  "TT",
  "EU",
  "SSY",
  "HOUZS",
] as const;

/** One parent row: a delivery scope, or one leg of a Delivery Journey. */
export interface DeliveryScopeRow {
  /** Stable identity — the grid's row key and the expansion key. */
  key: string;
  orderId: string;
  so: number;
  /** The customer's own reference(s) — `CR0854`, the ref suppliers recognise. */
  refs: string[];
  /** 1-based leg number on a multi-leg Journey; null on a whole-order scope. */
  leg: number | null;
  /** `Klang WH → JB transit` — the leg's own two places, never invented. */
  legRoute: string | null;
  customer: string;
  /** The SO's promise. null when the customer has not given one. */
  customerDeliveryIso: string | null;
  /** The customer WAS asked and answered "not yet" — a different fact. */
  customerDateTbd: boolean;
  location: string;
  building: string;
  logisticsId: string | null;
  logisticsName: string | null;
  /** Delivery's own confirmed operational date for THIS scope. */
  confirmedIso: string | null;
  confirmedTime: string | null;
  goods: string;
  doNumber: string | null;
  /**
   * ⭐ THE OPERATION'S progress, never the DOCUMENT's (owner ruling
   * 2026-08-24). `Created` belongs to the Delivery Orders register; this
   * column answers *where is the work*, and it always has an answer — even
   * before any document exists.
   */
  status: DeliveryWorkStatus;
  /** True once Delivery has recorded its own arrangement for this scope. */
  hasArrangement: boolean;
  /** The order behind the row — for the expansion's own reads. */
  o: operationOrderListRow;
}

/**
 * A leg's own status, spoken in the DOCUMENT's five words rather than in a
 * second vocabulary.
 *
 * `orders.delivery_stops` stores `pending | picked_up | handed_off | delivered
 * | issue`, and two of those may never reach a screen as written: `Pending` is
 * a banned word, and `Issue` names a mood rather than what happened. Mapping
 * them onto the governed document statuses is what keeps ONE status vocabulary
 * across Delivery Work, the Delivery Orders register and the DO object.
 *
 * A leg speaks the SAME seven operational words as a whole-order scope (owner
 * ruling 2026-08-24) — one vocabulary across the workspace, so two rows of one
 * order cannot be read on two different scales.
 */
export function legWorkStatusOf(
  stop: Pick<DeliveryStop, "status">,
  confirmedIso: string | null,
): DeliveryWorkStatus {
  const say = (kind: DeliveryWorkStatus["kind"]): DeliveryWorkStatus => ({
    kind,
    label: DELIVERY_WORK_STATUS_LABEL[kind],
    reasonLabel: null,
  });
  switch (stop.status) {
    case "delivered":
    case "handed_off":
      /* `handed_off` reads Delivered on purpose: leg 1 completing means the
         goods were accepted at the named JB warehouse, which IS that leg's
         delivery. It never claims the Singapore customer received them —
         their leg is its own row with its own status. */
      return say("delivered");
    case "picked_up":
      return say("out_for_delivery");
    case "issue":
      return say("failed");
    default:
      /* A leg nobody has moved yet is exactly the two rungs the whole-order
         scope uses: a day agreed, or not. */
      return say(confirmedIso ? "confirmed" : "waiting_customer_date");
  }
}

/** The order's Logistics Partner: the formal one, else the triage assignment. */
export function logisticsOf(
  o: operationOrderListRow,
  partnerNameById: Map<string, string>,
): { id: string | null; name: string | null } {
  if (o.delivery_partners) {
    return { id: o.delivery_partners.id, name: o.delivery_partners.name };
  }
  if (o.delivery_partner_id) {
    return {
      id: o.delivery_partner_id,
      name: partnerNameById.get(o.delivery_partner_id) ?? null,
    };
  }
  if (o.ops_assigned_logistic) {
    return {
      id: o.ops_assigned_logistic,
      name: partnerNameById.get(o.ops_assigned_logistic) ?? null,
    };
  }
  return { id: null, name: null };
}

/**
 * ⭐ ONE ARITHMETIC FOR "WHEN IS THIS SCOPE GOING" (Architecture Law D).
 *
 * The DOCUMENT wins when one exists — it is the snapshot Delivery issued and
 * the thing the Warehouse and the partner are working to. Without a document,
 * the CONFIRMED booking stands (`booking_stage = confirmed` AND its date, the
 * D1 invariant). A carrier's provisional `logistic_eta` is deliberately NOT
 * confirmed: the rail says `No confirmed date` for it, because nobody has
 * agreed that day with the customer and a planning screen that pretends
 * otherwise books a truck twice.
 */
export function confirmedDeliveryOf(
  o: operationOrderListRow,
  doc: DeliveryOrderRow | null,
  arrangement?: DeliveryArrangementRow | null,
): { iso: string | null; time: string | null } {
  if (doc?.delivery_date) {
    return { iso: doc.delivery_date.slice(0, 10), time: doc.time_slot ?? null };
  }
  /* Delivery's own arrangement outranks the booking overlay: it is the record
     Delivery wrote deliberately, where the overlay is a field Sales' door also
     touches. The DOCUMENT still outranks both — it is the snapshot the
     warehouse and the partner are actually working to. */
  if (arrangement?.confirmed_date) {
    return { iso: arrangement.confirmed_date.slice(0, 10), time: arrangement.confirmed_time ?? null };
  }
  const booking = orderBookingDay(o);
  if (booking.kind === "confirmed" && booking.date) {
    return { iso: booking.date, time: booking.slot ?? null };
  }
  return { iso: null, time: null };
}

/** `Klang WH → JB transit`, from the leg's own recorded places. */
function legRouteOf(stop: DeliveryStop): string | null {
  const from = stop.from_loc?.trim() ?? "";
  const to = stop.to_loc?.trim() ?? "";
  if (!from && !to) return null;
  return [from, to].filter(Boolean).join(" → ");
}

/** The legs of a real Delivery Journey, or `null` for a single-scope order. */
function journeyLegsOf(o: operationOrderListRow): DeliveryStop[] | null {
  const stops = o.delivery_stops;
  if (!Array.isArray(stops) || stops.length < 2) return null;
  return [...stops].sort((a, b) => (a.leg ?? 0) - (b.leg ?? 0));
}

/**
 * ⭐ THE ENTRY RULE — owner ruling 2026-08-24, and it is the correction that
 * makes this page usable.
 *
 * > "Do not dump every incomplete Sales Order into Delivery Work. Missing
 * >  address/location remains Sales-owned Work and must not appear here as rows
 * >  filled with `Not given`."
 *
 * The first build admitted every open order. Measured on production the day it
 * shipped: 90 rows, 59 of them with no delivery location at all — so two thirds
 * of the workspace was a column of `Not given` that no logistics operator could
 * act on, and the one thing they DID need (an address to give a carrier) was
 * missing by definition. Those orders are not delivery work; they are SALES
 * work, and they belong in the Sales Order's own queue until somebody asks the
 * customer where the goods go.
 *
 * FOUR facts, and a scope needs all four:
 *
 * ```
 * a place to deliver to      an address or a locality — a carrier cannot be
 *                            given `Not given`
 * building/access facts      the crew has to know what they are walking into
 * goods that need delivering at least one line that is not a pure service
 * a real scope               the order is still travelling (below)
 * ```
 *
 * A scope failing the rule is not hidden work: `deliveryEntryBlockers` names
 * exactly what is missing, and the page can say so rather than dropping rows
 * into silence.
 */
export interface DeliveryEntryFacts {
  hasLocation: boolean;
  hasBuilding: boolean;
  hasGoods: boolean;
  isTravelling: boolean;
}

export function deliveryEntryFactsOf(o: operationOrderListRow): DeliveryEntryFacts {
  const line1 = o.customer_address_line1?.trim() ?? "";
  const city = o.customer_address_city?.trim() ?? "";
  const state = o.customer_address_state?.trim() ?? "";
  const freeText = o.customer_address?.trim() ?? "";
  /* A locality OR a written address. `conciseLocality` prints the first two;
     an AutoCount order often carries only the third, and refusing it would
     throw away real delivery work over a data-entry shape. */
  const hasLocation = Boolean(city || state || line1 || freeText);

  /* `building_type` is the Sales Portal's own field. Floor/lift answer the same
     question for an order that predates it — what is the crew walking into. */
  const hasBuilding =
    Boolean(o.building_type?.trim()) || o.delivery_floor != null || o.delivery_has_lift != null;

  /* A SERVICE delivers nothing. An order that is only `DELIVERY` or a warranty
     visit has no goods to put on a truck, and a truck is what this page plans. */
  const hasGoods = (o.order_lines ?? []).some(
    (l) => Number(l.qty || 0) > 0 && lineKind(l.sku) !== "service",
  );

  return { hasLocation, hasBuilding, hasGoods, isTravelling: isOpenDeliveryScope(o) };
}

/** What this order still needs before it is delivery work — in the operator's words. */
export function deliveryEntryBlockers(o: operationOrderListRow): string[] {
  const f = deliveryEntryFactsOf(o);
  const out: string[] = [];
  if (!f.hasLocation) out.push(DW.blockerNoLocation);
  if (!f.hasBuilding) out.push(DW.blockerNoBuilding);
  if (!f.hasGoods) out.push(DW.blockerNoGoods);
  return out;
}

export function entersDeliveryWork(o: operationOrderListRow): boolean {
  const f = deliveryEntryFactsOf(o);
  return f.isTravelling && f.hasLocation && f.hasBuilding && f.hasGoods;
}

/**
 * A scope belongs on the planning workspace while the goods still have to
 * travel. A delivered order is HISTORY — the Delivery Orders register and
 * Delivery History hold it — and leaving it here would make every count on the
 * rail answer a question nobody asked.
 */
export function isOpenDeliveryScope(o: operationOrderListRow): boolean {
  return o.status !== "delivered" && !o.delivered_at;
}

export interface ScopeInputs {
  orders: operationOrderListRow[];
  deliveryOrders: DeliveryOrderRow[];
  attempts: DeliveryOrderAttemptRow[];
  handoverEvents: DeliveryHandoverKindRow[];
  partnerNameById: Map<string, string>;
  /** Delivery's OWN records (0379), keyed `${orderId}#${leg}`. */
  arrangements?: Map<string, DeliveryArrangementRow>;
}

/**
 * Every open delivery scope, one row each, legs expanded.
 *
 * The document status is the SAME shared arithmetic the Delivery Orders
 * register runs (`deliveryOrderStatusOf` over the void stamp, the attempt
 * history and the §4 handover facts). Nothing here computes a second version
 * of it, so the two pages cannot disagree about whether a trip went out.
 */
export function buildDeliveryScopeRows({
  orders,
  deliveryOrders,
  attempts,
  handoverEvents,
  partnerNameById,
  arrangements,
}: ScopeInputs): DeliveryScopeRow[] {
  const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
  for (const a of attempts) {
    if (!a.do_number) continue;
    attemptsByDo.set(a.do_number, [...(attemptsByDo.get(a.do_number) ?? []), a]);
  }
  const handoverByDoId = new Map<string, DeliveryHandoverKind[]>();
  for (const e of handoverEvents) {
    handoverByDoId.set(e.delivery_order_id, [
      ...(handoverByDoId.get(e.delivery_order_id) ?? []),
      e.kind,
    ]);
  }
  const docByNumber = new Map<string, DeliveryOrderRow>();
  for (const d of deliveryOrders) docByNumber.set(d.do_number, d);

  /** The facts a document carries — fed to BOTH ladders, never re-derived. */
  const factsOf = (doc: DeliveryOrderRow | null) => ({
    attempts: doc
      ? (attemptsByDo.get(doc.do_number) ?? []).map((a) => ({
          result: a.result,
          reasonKey: a.reason_key,
          recordedAt: a.recorded_at,
        }))
      : [],
    handoverEvents: doc
      ? (handoverByDoId.get(doc.id) ?? []).map((kind) => ({ kind }))
      : [],
  });

  /* The DOCUMENT ladder is still run — it is what decides whether a voided
     document should take its scope off the workspace entirely. What it no
     longer does is print on the screen. */
  const docStatusOf = (doc: DeliveryOrderRow): DeliveryOrderStatus =>
    deliveryOrderStatusOf({
      voidedAt: doc.voided_at,
      voidReason: doc.void_reason,
      ...factsOf(doc),
    });

  const rows: DeliveryScopeRow[] = [];
  for (const o of orders) {
    /* THE ENTRY RULE (owner ruling 2026-08-24) — a Sales Order missing its
       address is Sales work, not delivery work, and must not arrive here as a
       row of `Not given`. */
    if (!entersDeliveryWork(o)) continue;

    /* The ACTIVE document is the one `orders.do_number` mirrors — the DO model's
       own definition. A superseded or failed document keeps its history in the
       Delivery Orders register; it is not this scope's current trip. */
    const doc = o.do_number ? docByNumber.get(o.do_number) ?? null : null;
    const base = {
      orderId: o.id,
      so: o.so,
      refs: (o.source_ref ?? []).filter(Boolean),
      customer: displayCustomerName(o.customer_name),
      customerDeliveryIso: o.delivery_date_tbd ? null : o.delivery_date ?? null,
      customerDateTbd: Boolean(o.delivery_date_tbd),
      location: conciseLocality(o.customer_address_city, o.customer_address_state),
      building: o.building_type?.trim() || DW.notGiven,
      goods: itemsSummary(o) || DW.noGoods,
      o,
    };

    const legs = journeyLegsOf(o);
    if (!legs) {
      /* ⭐ DELIVERY'S OWN RECORD WINS (0379). The arrangement is what Delivery
         wrote; the order's column is what Sales' door left behind. Reading the
         arrangement FIRST is what makes `Assign logistics` visible on this
         screen the moment it is saved, and the fallback is what stops anything
         disappearing on the day the table shipped empty. */
      const arrangement = arrangements?.get(`${o.id}#0`) ?? null;
      const fallbackPartner = logisticsOf(o, partnerNameById);
      const confirmed = confirmedDeliveryOf(o, doc, arrangement);
      const facts = factsOf(doc);
      rows.push({
        ...base,
        key: o.id,
        leg: null,
        legRoute: null,
        logisticsId: arrangement?.partner_id ?? fallbackPartner.id,
        logisticsName: arrangement?.partner_name ?? fallbackPartner.name,
        confirmedIso: confirmed.iso,
        confirmedTime: confirmed.time,
        doNumber: doc?.do_number ?? null,
        hasArrangement: Boolean(arrangement),
        status: deliveryWorkStatusOf({
          confirmedDate: confirmed.iso,
          /* A VOIDED document is not a live one: its scope is waiting to be
             re-planned, and calling that `Waiting for warehouse` would point at
             a warehouse holding nothing. */
          hasDeliveryOrder: Boolean(doc) && docStatusOf(doc!).kind !== "cancelled",
          ...facts,
        }),
      });
      continue;
    }

    /* A Journey leg carries its OWN partner, its own planned day and its own
       result. It does not carry the order's document: `delivery_stops` holds no
       DO link, and printing the order's number on both legs would say one
       document authorised two different handovers. */
    for (const stop of legs) {
      /* Each leg has its OWN arrangement — two carriers, two dates, two rows.
         That is the whole reason the arrangement is keyed by (order, leg). */
      const arrangement = arrangements?.get(`${o.id}#${stop.leg}`) ?? null;
      const confirmedIso =
        arrangement?.confirmed_date ??
        (stop.scheduled_at ? stop.scheduled_at.slice(0, 10) : null);
      rows.push({
        ...base,
        key: `${o.id}#leg${stop.leg}`,
        leg: stop.leg,
        legRoute: legRouteOf(stop),
        logisticsId: arrangement?.partner_id ?? stop.partner_id ?? null,
        logisticsName: arrangement?.partner_name ?? stop.partner_name ?? null,
        confirmedIso,
        confirmedTime: arrangement?.confirmed_time ?? null,
        doNumber: null,
        hasArrangement: Boolean(arrangement),
        status: legWorkStatusOf(stop, confirmedIso),
      });
    }
  }
  return rows;
}

/* ── THE REGION CLASSIFICATION — the ONE address classifier ─────────────────
 *
 * `regionBucketOf` answers *which direct state/jurisdiction is this scope
 * going to?* (owner correction 2026-09-06: the rail lists these names FLAT —
 * the EAST MALAYSIA / SINGAPORE sub-heading grammar is retired). Detection
 * reuses `@/lib/region` (state names, aliases, postcodes); a Journey leg is
 * classified by its DESTINATION — leg 1 of a Singapore journey is a KL → JB
 * run and counts under Johor. A row whose address resolves to no state joins
 * no region row and stays reachable while no region is picked; fixing its
 * address is Sales work through `Open Sales Order to change`.
 */
export const SINGAPORE_KEY = "Singapore";

/** The customer's own state — the STRUCTURED column first (a native order
 *  records it directly), then the free-text classifier over the address. */
function customerRegionOf(o: DeliveryScopeRow["o"]): string | null {
  const stated = o.customer_address_state?.trim();
  if (stated) {
    if (/singapore/i.test(stated)) return SINGAPORE_KEY;
    /* Through the classifier so an alias (`KL`, `Malacca`) lands on the one
       canonical spelling instead of minting a second rail row. */
    const canon = detectState(stated);
    if (canon) return canon;
  }
  const text =
    o.customer_address ??
    [o.customer_address_line1, o.customer_address_city, stated].filter(Boolean).join(", ");
  if (!text) return null;
  if (/singapore/i.test(text)) return SINGAPORE_KEY;
  return detectState(text);
}

/** The region row this scope counts under, or null when nothing resolves. */
export function regionBucketOf(row: DeliveryScopeRow): string | null {
  /* A Journey leg is classified by its DESTINATION — leg 1 of a Singapore
     journey is a KL → JB run and belongs on the Johor row. */
  if (row.legRoute) {
    const dest = row.legRoute.split("→").pop()?.trim() ?? "";
    if (dest && !/customer/i.test(dest)) {
      if (/singapore/i.test(dest)) return SINGAPORE_KEY;
      /* `JB` is the team's own word for Johor Bahru in leg routes. */
      if (/\bJB\b|johor/i.test(dest)) return "Johor";
      const state = detectState(dest);
      if (state) return state;
    }
    /* A destination that is the customer, or resolves nowhere, falls back. */
    return customerRegionOf(row.o);
  }
  return customerRegionOf(row.o);
}

/**
 * The footer sentence. It counts SCOPES — legs included — because that is what
 * the rows and the rail counts are; calling them orders would be a third number
 * for the same list.
 */
export function scopeFooter(shown: number, total: number): string {
  const word = total === 1 ? "delivery scope" : "delivery scopes";
  return shown === total ? `${shown} ${word}` : `${shown} of ${total} ${word}`;
}
