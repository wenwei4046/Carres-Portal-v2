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
  type DeliveryHandoverKind,
  type DeliveryOrderStatus,
  type DeliveryStop,
} from "@carres/shared";
import { displayCustomerName } from "@/lib/customer-name";
import { orderBookingDay } from "@/lib/order-booking";
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
  page: "Delivery Work",
  docTitle: "Delivery Work — Carres",
  search: "Search delivery scopes…",
  empty: "No delivery scopes",
  loadFailed: "Delivery Work could not be loaded",
  tryAgain: "Try again",
  railDate: "DELIVERY DATE",
  railLogistics: "LOGISTICS",
  railAll: "All",
  /** A scope Delivery has not yet fixed an operational date for. */
  noConfirmedDate: "No confirmed date",
  /** A confirmed date that is already behind us and has produced no result. */
  datePassed: "Date passed",
  /** No Logistics Partner on the scope yet — a fact, never `Unassigned`. */
  noLogistics: "No logistics picked",
  /**
   * ⭐ ONE SENTENCE, USED IN BOTH CELLS, AND THAT IS DELIBERATE.
   *
   * The card rules this exact string for `DO No`. `Delivery Status` reuses it
   * rather than minting a second one, because Constitution §2 forbids a word
   * the dictionary has not approved and because the two columns are genuinely
   * answering the same fact when no document exists: `DO No` asks *which
   * document*, `Delivery Status` asks *what state* — and until the system
   * issues one, both answers are "there is not a document yet". A dedicated
   * status word is an owner call, not this card's to invent.
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

/** The rail key for a scope nobody is carrying yet. */
export const NO_LOGISTICS_KEY = "__none";
/** The two dateless rail buckets. Every other key is a real ISO date. */
export const NO_DATE_KEY = "__no_date";
export const DATE_PASSED_KEY = "__passed";

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
  /** The document's derived status; null when no document exists yet. */
  status: DeliveryOrderStatus | null;
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
 * `handed_off` reads `Delivered` on purpose: leg 1 completing means the goods
 * were accepted at the named JB warehouse (`docs/orders/MASTER.md` — Singapore
 * Sales Order), which is that leg's delivery. It is never the Singapore
 * customer's, and it never claims to be, because the customer's leg is its own
 * row with its own status.
 */
export function legStatusOf(stop: Pick<DeliveryStop, "status">): DeliveryOrderStatus {
  switch (stop.status) {
    case "delivered":
    case "handed_off":
      return { kind: "delivered", label: "Delivered", reasonLabel: null };
    case "picked_up":
      return { kind: "out_for_delivery", label: "Out for delivery", reasonLabel: null };
    case "issue":
      return { kind: "exception", label: "Delivery exception", reasonLabel: null };
    default:
      return { kind: "created", label: DW.noDeliveryOrder, reasonLabel: null };
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
): { iso: string | null; time: string | null } {
  if (doc?.delivery_date) {
    return { iso: doc.delivery_date.slice(0, 10), time: doc.time_slot ?? null };
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

  const statusOf = (doc: DeliveryOrderRow): DeliveryOrderStatus =>
    deliveryOrderStatusOf({
      voidedAt: doc.voided_at,
      voidReason: doc.void_reason,
      attempts: (attemptsByDo.get(doc.do_number) ?? []).map((a) => ({
        result: a.result,
        reasonKey: a.reason_key,
        recordedAt: a.recorded_at,
      })),
      handoverEvents: (handoverByDoId.get(doc.id) ?? []).map((kind) => ({ kind })),
    });

  const rows: DeliveryScopeRow[] = [];
  for (const o of orders) {
    if (!isOpenDeliveryScope(o)) continue;

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
      const confirmed = confirmedDeliveryOf(o, doc);
      const partner = logisticsOf(o, partnerNameById);
      rows.push({
        ...base,
        key: o.id,
        leg: null,
        legRoute: null,
        logisticsId: partner.id,
        logisticsName: partner.name,
        confirmedIso: confirmed.iso,
        confirmedTime: confirmed.time,
        doNumber: doc?.do_number ?? null,
        status: doc ? statusOf(doc) : null,
      });
      continue;
    }

    /* A Journey leg carries its OWN partner, its own planned day and its own
       result. It does not carry the order's document: `delivery_stops` holds no
       DO link, and printing the order's number on both legs would say one
       document authorised two different handovers. */
    for (const stop of legs) {
      rows.push({
        ...base,
        key: `${o.id}#leg${stop.leg}`,
        leg: stop.leg,
        legRoute: legRouteOf(stop),
        logisticsId: stop.partner_id ?? null,
        logisticsName: stop.partner_name ?? null,
        confirmedIso: stop.scheduled_at ? stop.scheduled_at.slice(0, 10) : null,
        confirmedTime: null,
        doNumber: null,
        status: legStatusOf(stop),
      });
    }
  }
  return rows;
}

/** Which rail bucket a scope's confirmed date falls in. */
export function dateBucketOf(row: DeliveryScopeRow, todayIso: string): string {
  if (!row.confirmedIso) return NO_DATE_KEY;
  return row.confirmedIso < todayIso ? DATE_PASSED_KEY : row.confirmedIso;
}

export interface RailItem {
  key: string;
  label: string;
  count: number;
}

/**
 * THE DELIVERY DATE RAIL — two named facts, then the real calendar.
 *
 * `No confirmed date` first because it is the largest pile of work on a manual
 * planning screen, `Date passed` second because it is the loudest, then one row
 * per actual day, ascending. **Never `Today`, never `Tomorrow`** (owner ruling
 * 2026-08-15): the operator reads the weekday off the date itself, so the date
 * has to say which day it is. The caller supplies the printed date string —
 * this file decides the ORDER and the COUNTS, `fmt-date.ts` decides the
 * spelling, and neither borrows the other's job.
 */
export function buildDateRail(
  rows: DeliveryScopeRow[],
  todayIso: string,
  fmt: (iso: string) => string,
  /* ⭐ A PICKED ROW NEVER DISAPPEARS. The rail draws only the days that hold
     scopes, so a day whose last scope moves away would vanish while its choice
     was still on the URL — leaving an empty listing and no visible control to
     undo it. A chosen day stays on the rail at 0 until the operator unpicks it. */
  picked: ReadonlySet<string> = new Set(),
): RailItem[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = dateBucketOf(r, todayIso);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = [
    ...new Set([
      ...counts.keys(),
      ...[...picked].filter((k) => k !== NO_DATE_KEY && k !== DATE_PASSED_KEY),
    ]),
  ]
    .filter((k) => k !== NO_DATE_KEY && k !== DATE_PASSED_KEY)
    .sort();
  return [
    { key: NO_DATE_KEY, label: DW.noConfirmedDate, count: counts.get(NO_DATE_KEY) ?? 0 },
    { key: DATE_PASSED_KEY, label: DW.datePassed, count: counts.get(DATE_PASSED_KEY) ?? 0 },
    ...days.map((iso) => ({ key: iso, label: fmt(iso), count: counts.get(iso) ?? 0 })),
  ];
}

/**
 * THE LOGISTICS RAIL — the governed roster first, always, then whoever else is
 * genuinely carrying something.
 *
 * `All` leads and is active when nothing is picked. The seven governed partners
 * follow in the owner's ruled order and stay visible at zero. A partner outside
 * that list appears only while it holds a scope — that is what "future active
 * governed partners" buys without turning the rail into a copy of the partner
 * table. `No logistics picked` is last and appears only when scopes have none;
 * it is the workspace's first real question, and without it those scopes are
 * reachable from `All` alone.
 */
export function buildLogisticsRail(
  rows: DeliveryScopeRow[],
  partners: { id: string; name: string }[],
  /* Same rule as the date rail: an ungoverned partner is admitted only while
     it is carrying something, EXCEPT while it is the operator's own choice. */
  picked: ReadonlySet<string> = new Set(),
): RailItem[] {
  const countByName = new Map<string, number>();
  let none = 0;
  for (const r of rows) {
    if (!r.logisticsName) {
      none += 1;
      continue;
    }
    countByName.set(r.logisticsName, (countByName.get(r.logisticsName) ?? 0) + 1);
  }
  const governed = new Set<string>(GOVERNED_LOGISTICS);
  const items: RailItem[] = GOVERNED_LOGISTICS.map((name) => ({
    key: name,
    label: name,
    count: countByName.get(name) ?? 0,
  }));
  const extra = [...new Set([...partners.map((p) => p.name), ...picked])]
    .filter(
      (name) =>
        name !== NO_LOGISTICS_KEY &&
        !governed.has(name) &&
        ((countByName.get(name) ?? 0) > 0 || picked.has(name)),
    )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ key: name, label: name, count: countByName.get(name) ?? 0 }));
  const tail =
    none > 0 || picked.has(NO_LOGISTICS_KEY)
      ? [{ key: NO_LOGISTICS_KEY, label: DW.noLogistics, count: none }]
      : [];
  return [...items, ...extra, ...tail];
}

/** Does this row survive the picked date buckets? Empty set = every date. */
export function matchesDate(
  row: DeliveryScopeRow,
  picked: ReadonlySet<string>,
  todayIso: string,
): boolean {
  return picked.size === 0 || picked.has(dateBucketOf(row, todayIso));
}

/** Does this row survive the picked partners? Empty set = every partner. */
export function matchesLogistics(row: DeliveryScopeRow, picked: ReadonlySet<string>): boolean {
  if (picked.size === 0) return true;
  return picked.has(row.logisticsName ?? NO_LOGISTICS_KEY);
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
