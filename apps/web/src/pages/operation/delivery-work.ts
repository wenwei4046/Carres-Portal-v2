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
  deliveryStepDueIso,
  deliveryWorkStatusLabelOf,
  deliveryWorkStatusOf,
  DELIVERY_WORK_STATUS_TONE,
  lineKind,
  myHolidaySet,
  latestDeliveryContactOf,
  type DeliveryArrangementRow,
  type DeliveryContactRow,
  type DeliveryQueueLeads,
  type DeliveryStatusSpell,
  type DeliveryWorkStatus,
  type DeliveryWorkStatusKind,
  type DeliveryHandoverKind,
  type DeliveryOrderStatus,
  type DeliveryStop,
} from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import { orderBookingDay } from "@/lib/order-booking";
import { detectState } from "@/lib/region";
import type {
  DeliveryOrderAttemptRow,
  DeliveryOrderRow,
  DeliveryProofReviewRow,
  DeliveryAttemptEvidenceRow,
  DeliveryHandoverKindRow,
  operationOrderListRow,
} from "@/lib/queries";
import { conciseLocality, requestedDeliveryOf } from "./sales-order-columns";
import { itemsSummary } from "./sales-order-facts";
import {
  driverSubmissionOf,
  missingDeliveryProofOf,
  UNKNOWN_SUBMISSION,
  type MissingDeliveryProof,
  NO_PROOF_REVIEW,
  groupProofRecords,
  proofReviewOf,
  type DoProofReview,
} from "./delivery-orders-register";

/**
 * ⭐ THE ONE DATE SPELLING, handed to the shared status arithmetic (the engine
 * spells no dates — the Year Rule's one home is `fmtDate`).
 */
export const DELIVERY_STATUS_SPELL: DeliveryStatusSpell = {
  date: (iso) => fmtDate(iso),
  dateTime: (iso) => fmtDate(iso, { time: true }),
};

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
   * the actor-first operational ladder (`deliveryWorkStatusOf`, Delivery
   * MASTER §8.4) and this string went back to answering one question.
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
  /** The disclosure's hover — what OPENS, never the mechanic (owner ruling
   *  2026-09-13: the four-panel delivery brief). */
  showItems: "Show delivery brief",
  /* ── REQUIRED SALES FACTS (owner ruling 2026-09-13, Delivery MASTER §8.3) ──
     A row that reaches Monitor with one of these missing is a DATA problem:
     the status reads `Order details incomplete`, the panel names the fact in
     orange, and the one door is `Open Sales Order to change`. */
  stateNotRecorded: "State not recorded",
  buildingNotRecorded: "Building type not recorded",
  floorNotRecorded: "Floor not recorded",
  liftNotRecorded: "Lift not recorded",
  requestedDateNotRecorded: "Requested delivery date not recorded",
  openSalesOrder: "Open Sales Order to change",
  /** A goods line the register has allocated no Unit to yet. */
  notAllocated: "Not allocated",
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
   * 2026-08-24, words re-ruled 2026-09-13). `Created` belongs to the Delivery
   * Orders register; this column answers *who must act and what happened*,
   * and it always has an answer — even before any document exists.
   */
  status: DeliveryWorkStatus;
  /** The contact deadline — the shared `chase` step's own due day, counted
   *  once here so the status line, the rail and the calendar agree. */
  contactDueIso: string | null;
  /** The evidence a RECORDED delivered result still lacks — the Delivery
   *  Orders register's own arithmetic over the SAME document row. */
  missingProof: MissingDeliveryProof;
  /** §6.1 (0489) — Operation's review of that evidence, the register's own
   *  arithmetic again. `NO_PROOF_REVIEW` until a result reaches the customer. */
  proofReview: DoProofReview;
  /** Delivery's own arrangement for this scope (0386) — driver, vehicle,
   *  ETA and condo registration ride the brief from it. */
  arrangement: DeliveryArrangementRow | null;
  /** The recorded handover clocks (0363) — panel 3's pickup fact. */
  handedOverAt: string | null;
  receivedAt: string | null;
  /** The live document's id and issue day — `DO No` opens it, line two is
   *  its `DO date`. */
  deliveryOrderId: string | null;
  doIssuedAt: string | null;
  /** Required Sales facts this row lacks, in the operator's words (§8.3). */
  missingFacts: string[];
  /** This scope's contact records, newest first (0487, §5.1). */
  contacts: DeliveryContactRow[];
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
  stop: Pick<DeliveryStop, "status"> & Partial<Pick<DeliveryStop, "to_loc">>,
  confirmedIso: string | null,
  partnerName: string | null = null,
  confirmedTime: string | null = null,
): DeliveryWorkStatus {
  const say = (kind: DeliveryWorkStatusKind, second: string | null = null): DeliveryWorkStatus => ({
    kind,
    label: deliveryWorkStatusLabelOf(
      kind,
      partnerName,
      kind === "confirmed" && confirmedIso ? DELIVERY_STATUS_SPELL.date(confirmedIso) : null,
    ),
    tone: DELIVERY_WORK_STATUS_TONE[kind],
    second,
    secondTone: null,
    reasonLabel: null,
  });
  switch (stop.status) {
    case "delivered":
      return say("delivered");
    case "handed_off":
      /* A leg handed off at the named partner warehouse has ARRIVED there —
         the goods reached the stop, never the customer (Delivery MASTER
         §14.1; Card 20). The customer leg is its own row with its own word. */
      return say("arrived", stop.to_loc?.trim() || null);
    case "picked_up":
      return say("collected");
    case "issue":
      return say("failed");
    default:
      /* A leg nobody has moved yet is exactly the rungs the whole-order scope
         uses: a day and a window agreed, a partner still to contact the
         customer, or no partner at all. */
      if (confirmedIso && confirmedTime) return say("confirmed", confirmedTime);
      return say(partnerName ? "partner_must_contact" : "assign_logistics");
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

/**
 * ⭐ THE ENTRY RULE, re-ruled 2026-09-13 (Delivery MASTER §8.3): an order with
 * NO delivery address at all is not a delivery and stays Sales-owned Work.
 * Every OTHER missing required Sales fact — state, building type, floor,
 * lift, the requested delivery information — is a DATA PROBLEM on a row that
 * IS delivery work: the row enters Monitor reading `Order details incomplete`
 * with the fact named in orange and the door `Open Sales Order to change`.
 */
export function entersDeliveryWork(o: operationOrderListRow): boolean {
  const f = deliveryEntryFactsOf(o);
  return f.isTravelling && f.hasLocation && f.hasGoods;
}

/** The required Sales facts this row lacks, in the operator's words. */
export function requiredSalesFactsMissing(o: operationOrderListRow): string[] {
  const out: string[] = [];
  if (!o.customer_address_state?.trim()) out.push(DW.stateNotRecorded);
  if (!o.building_type?.trim()) out.push(DW.buildingNotRecorded);
  if (o.delivery_floor == null) out.push(DW.floorNotRecorded);
  if (o.delivery_has_lift == null) out.push(DW.liftNotRecorded);
  /* The customer WAS asked and answered "not yet" is recorded information;
     a row nobody asked about is not. */
  const requested = requestedDeliveryOf(o);
  if (!requested.iso && !requested.tbd) out.push(DW.requestedDateNotRecorded);
  return out;
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
  /** Business today — `Overdue` is the one status rung about it. Absent, no
   *  row reads `Overdue`. */
  todayIso?: string;
  /** Malaysian public holidays for the contact deadline's working-day clock.
   *  Omitted → the live set, the same one every other delivery clock counts on. */
  holidays?: ReadonlySet<string>;
  /** The `Confirm delivery date` lead in working days (Purchasing → Settings,
   *  `logistics_call_working_days`). Absent leaves the seed. */
  queueLeads?: DeliveryQueueLeads;
  /** Every customer-contact record (0487); the status ladder reads the
   *  latest per scope. Absent = no contact recorded anywhere. */
  contacts?: readonly DeliveryContactRow[];
  /** §6.1 (0489) — the proof reviews and the attempt-evidence clocks the
   *  register read carries. Absent = no review recorded anywhere. */
  proofReviews?: readonly DeliveryProofReviewRow[];
  attemptEvidence?: readonly DeliveryAttemptEvidenceRow[];
}

/** PostgREST may embed a to-one overlay as an object or a one-row array. */
function overlayOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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
  todayIso,
  holidays,
  queueLeads,
  contacts,
  proofReviews,
  attemptEvidence,
}: ScopeInputs): DeliveryScopeRow[] {
  const holidaySet = holidays ?? myHolidaySet();
  const contactsByScope = new Map<string, DeliveryContactRow[]>();
  for (const contact of contacts ?? []) {
    const key = `${contact.order_id}#${contact.leg}`;
    contactsByScope.set(key, [...(contactsByScope.get(key) ?? []), contact]);
  }
  /** The latest contact's answer for the status ladder — `waiting_customer_reply`
   *  is the one result that changes the actor-first word (§8.4). */
  const latestContactOf = (key: string) => {
    const latest = latestDeliveryContactOf(contactsByScope.get(key) ?? []);
    if (!latest) return null;
    return {
      result: (latest.result_key === "waiting_for_customer_reply"
        ? "waiting_customer_reply"
        : "answered") as "waiting_customer_reply" | "answered",
      recordedOn: latest.contacted_at.slice(0, 10),
    };
  };
  const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
  for (const a of attempts) {
    if (!a.do_number) continue;
    attemptsByDo.set(a.do_number, [...(attemptsByDo.get(a.do_number) ?? []), a]);
  }
  const handoverByDoId = new Map<string, Array<{ kind: DeliveryHandoverKind; recordedAt: string | null }>>();
  const handoverClockOf = (doc: DeliveryOrderRow | null, kind: DeliveryHandoverKind): string | null =>
    doc ? handoverByDoId.get(doc.id)?.find((e) => e.kind === kind)?.recordedAt ?? null : null;
  for (const e of handoverEvents) {
    handoverByDoId.set(e.delivery_order_id, [
      ...(handoverByDoId.get(e.delivery_order_id) ?? []),
      { kind: e.kind, recordedAt: e.recorded_at ?? null },
    ]);
  }
  /* The proof a delivered trip still lacks is the Delivery Orders register's
     arithmetic over the SAME document row (Law D): the latest recorded result,
     the driver's photos scoped to THIS document, the signed file. */
  const proofOf = (
    doc: DeliveryOrderRow | null,
    o: operationOrderListRow,
    intermediateLeg = false,
  ): MissingDeliveryProof => {
    const latest = doc
      ? [...(attemptsByDo.get(doc.do_number) ?? [])].sort((a, b) =>
          a.recorded_at.localeCompare(b.recorded_at),
        ).at(-1) ?? null
      : null;
    const control =
      overlayOf(o.ops_order_control) ?? overlayOf(doc?.orders.ops_order_control ?? null);
    const submission = doc
      ? driverSubmissionOf(control?.delivery_photos, doc.do_number)
      : UNKNOWN_SUBMISSION;
    return missingDeliveryProofOf({
      latestResult: latest?.result ?? null,
      photosPresent: submission.known ? submission.photos > 0 : null,
      signedDoPresent: Boolean(doc?.orders.do_file_path),
      intermediateLeg,
    });
  };
  const docByNumber = new Map<string, DeliveryOrderRow>();
  for (const d of deliveryOrders) docByNumber.set(d.do_number, d);
  /* 0491 — a Journey leg's LIVE document, keyed by its scope. */
  const legDocOf = (orderId: string, leg: number): DeliveryOrderRow | null =>
    deliveryOrders.find(
      (d) => d.order_id === orderId && (d.leg ?? 0) === leg && !d.voided_at,
    ) ?? null;
  /* §6.1 — the review state over the SAME document row (Law D). */
  const proofRecords = groupProofRecords(proofReviews, attemptEvidence);
  const reviewOf = (
    doc: DeliveryOrderRow | null,
    o: operationOrderListRow,
    intermediateLeg = false,
  ): DoProofReview => {
    /* A warehouse arrival owes no delivery proof — nothing to review (Card 20). */
    if (!doc || intermediateLeg) return NO_PROOF_REVIEW;
    const latest = [...(attemptsByDo.get(doc.do_number) ?? [])].sort((a, b) =>
      a.recorded_at.localeCompare(b.recorded_at),
    ).at(-1) ?? null;
    if (latest?.result !== "delivered" && latest?.result !== "partial") return NO_PROOF_REVIEW;
    const control =
      overlayOf(o.ops_order_control) ?? overlayOf(doc.orders.ops_order_control ?? null);
    return proofReviewOf({
      doNumber: doc.do_number,
      ledger: control?.delivery_photos,
      signedDoUploadedAt: doc.orders.do_file_path ? doc.orders.do_uploaded_at ?? null : null,
      reviews: proofRecords.reviewsByDo.get(doc.do_number) ?? [],
      attemptEvidence: proofRecords.evidenceByDo.get(doc.do_number) ?? [],
    });
  };

  /** The facts a document carries — fed to BOTH ladders, never re-derived. */
  const factsOf = (doc: DeliveryOrderRow | null) => ({
    attempts: doc
      ? (attemptsByDo.get(doc.do_number) ?? []).map((a) => ({
          result: a.result,
          reasonKey: a.reason_key,
          recordedAt: a.recorded_at,
        }))
      : [],
    handoverEvents: doc ? handoverByDoId.get(doc.id) ?? [] : [],
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
    /* ── THE CONTACT DEADLINE — the `chase` step, counted once ────────────── */
    const contactDueIso = deliveryStepDueIso(
      "chase",
      requestedDeliveryOf(o).iso,
      { holidays: holidaySet },
      queueLeads,
    );
    const base = {
      orderId: o.id,
      so: o.so,
      refs: (o.source_ref ?? []).filter(Boolean),
      customer: displayCustomerName(o.customer_name),
      /* Sales Orders owns this date; Delivery only reads it, through the ONE
         arithmetic every surface reads it with (Architecture Law D). */
      customerDeliveryIso: requestedDeliveryOf(o).iso,
      customerDateTbd: requestedDeliveryOf(o).tbd,
      contactDueIso,
      missingFacts: requiredSalesFactsMissing(o),
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
      const missingProof = proofOf(doc, o);
      const proofReview = reviewOf(doc, o);
      const logisticsName = arrangement?.partner_name ?? fallbackPartner.name;
      const liveDoc = Boolean(doc) && docStatusOf(doc!).kind !== "cancelled";
      const scopeContacts = contactsByScope.get(`${o.id}#0`) ?? [];
      rows.push({
        ...base,
        key: o.id,
        leg: null,
        legRoute: null,
        logisticsId: arrangement?.partner_id ?? fallbackPartner.id,
        logisticsName,
        confirmedIso: confirmed.iso,
        confirmedTime: confirmed.time,
        doNumber: doc?.do_number ?? null,
        hasArrangement: Boolean(arrangement),
        missingProof,
        proofReview,
        arrangement,
        handedOverAt: handoverClockOf(doc, "handed_over"),
        receivedAt: handoverClockOf(doc, "received_by_logistics"),
        deliveryOrderId: liveDoc ? doc!.id : null,
        doIssuedAt: liveDoc ? doc!.issued_at : null,
        contacts: scopeContacts,
        status: deliveryWorkStatusOf(
          {
            partnerName: logisticsName,
            latestContact: latestContactOf(`${o.id}#0`),
            callByDate: contactDueIso,
            confirmedDate: confirmed.iso,
            confirmedTime: confirmed.time,
            /* A VOIDED document is not a live one: its scope is waiting to be
               re-planned, and naming a partner's pickup for it would point at
               a warehouse holding nothing. */
            hasDeliveryOrder: liveDoc,
            expectedArrival: arrangement?.expected_arrival ?? null,
            missingFacts: base.missingFacts,
            todayIso: todayIso ?? null,
            proof: {
              photoUploaded: missingProof.photo ? false : null,
              signedDoUploaded: missingProof.signedDo ? false : null,
              acceptedOn: proofReview.state === "accepted" ? proofReview.reviewedAt : null,
              review: { state: proofReview.state, reason: proofReview.reason },
            },
            ...facts,
          },
          DELIVERY_STATUS_SPELL,
        ),
      });
      continue;
    }

    /* A Journey leg carries its OWN partner, its own planned day and its own
       result. It does not carry the order's document: `delivery_stops` holds no
       DO link, and printing the order's number on both legs would say one
       document authorised two different handovers. */
    /* The Journey's last leg is the customer's; every leg before it is a
       warehouse trip whose success is an ARRIVAL, not a delivery (Card 20). */
    const lastLeg = legs.reduce((max, stop) => Math.max(max, Number(stop.leg) || 0), 0);
    for (const stop of legs) {
      /* Each leg has its OWN arrangement — two carriers, two dates, two rows.
         That is the whole reason the arrangement is keyed by (order, leg). */
      const arrangement = arrangements?.get(`${o.id}#${stop.leg}`) ?? null;
      const intermediateLeg = stop.leg > 0 && stop.leg < lastLeg;
      const confirmedIso =
        arrangement?.confirmed_date ??
        (stop.scheduled_at ? stop.scheduled_at.slice(0, 10) : null);
      const legPartner = arrangement?.partner_name ?? stop.partner_name ?? null;
      const legTime = arrangement?.confirmed_time ?? null;
      /* 0491 — since a leg carries its OWN document, its handover facts, its
         own attempts and its own proof ride the same ladder as a whole-order
         scope (Law D); a leg still without a document keeps the chain's own
         status words. */
      const legDoc = legDocOf(o.id, stop.leg);
      const legFacts = factsOf(legDoc);
      const legMissingProof = proofOf(legDoc, o, intermediateLeg);
      const legReview = reviewOf(legDoc, o, intermediateLeg);
      rows.push({
        ...base,
        key: `${o.id}#leg${stop.leg}`,
        leg: stop.leg,
        legRoute: legRouteOf(stop),
        logisticsId: arrangement?.partner_id ?? stop.partner_id ?? null,
        logisticsName: legPartner,
        confirmedIso,
        confirmedTime: legTime,
        doNumber: legDoc?.do_number ?? null,
        hasArrangement: Boolean(arrangement),
        missingProof: legMissingProof,
        proofReview: legReview,
        arrangement,
        handedOverAt: handoverClockOf(legDoc, "handed_over"),
        receivedAt: handoverClockOf(legDoc, "received_by_logistics"),
        deliveryOrderId: legDoc?.id ?? null,
        doIssuedAt: legDoc?.issued_at ?? null,
        contacts: contactsByScope.get(`${o.id}#${stop.leg}`) ?? [],
        status: legDoc
          ? deliveryWorkStatusOf(
              {
                partnerName: legPartner,
                latestContact: latestContactOf(`${o.id}#${stop.leg}`),
                callByDate: contactDueIso,
                confirmedDate: confirmedIso,
                confirmedTime: legTime,
                hasDeliveryOrder: true,
                expectedArrival: arrangement?.expected_arrival ?? null,
                missingFacts: base.missingFacts,
                todayIso: todayIso ?? null,
                proof: {
                  photoUploaded: legMissingProof.photo ? false : null,
                  signedDoUploaded: legMissingProof.signedDo ? false : null,
                  acceptedOn: legReview.state === "accepted" ? legReview.reviewedAt : null,
                  review: { state: legReview.state, reason: legReview.reason },
                },
                intermediateLeg,
                legStop: stop.to_loc ?? null,
                ...legFacts,
              },
              DELIVERY_STATUS_SPELL,
            )
          : legWorkStatusOf(stop, confirmedIso, legPartner, legTime),
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

