/**
 * THE ORDER ROUTE'S DELIVERY SCOPES — Delivery's own records, read per scope.
 *
 * ⭐ OWNER RULING 2026-09-26 (`docs/orders/MASTER.md` § THE DELIVERY GROUP READS
 * DELIVERY'S OWN RECORDS). A scope is one `(leg, trip)` of
 * `ops_delivery_orders`. This module only ARRANGES what Delivery recorded —
 * the arrangement, the live document, its attempts, its handover facts, the
 * photos bound to its number — into the lanes the Route draws. It decides no
 * status: `deliveryWorkStatusOf` does, inside the resolver.
 *
 * Three shapes, the Delivery page's own rules:
 *   Journey    two or more recorded stops — one scope per leg
 *   Split      a live document with `trip > 0` — one scope per trip, plus one
 *              for the goods no trip carries yet
 *   Ordinary   one scope, no plate
 */
import { DELIVERY_GROUPS, deliveryGroupOf, type DeliveryGroupKey } from "./delivery-groups";
import type { DeliveryHandoverKind } from "./delivery-order-status";
import { deliveryReasonLabel } from "./delivery-reasons";
import type { RouteDeliveryScope } from "./sales-order-route";

export interface RouteScopeFacts {
  /** `orders.delivery_stops`. */
  stops: ReadonlyArray<{
    leg: number;
    partner_name?: string | null;
    from_loc?: string | null;
    to_loc?: string | null;
    scheduled_at?: string | null;
  }>;
  /** `ops_delivery_arrangements`, this order's rows. */
  arrangements: ReadonlyArray<{
    leg: number;
    partner_name: string | null;
    confirmed_date: string | null;
    confirmed_time: string | null;
  }>;
  /** `ops_delivery_orders`, this order's rows — voided ones included. */
  deliveryOrders: ReadonlyArray<{
    id: string;
    do_number: string;
    leg?: number | null;
    trip?: number | null;
    trip_groups?: ReadonlyArray<string> | null;
    delivery_date?: string | null;
    time_slot?: string | null;
    logistics_partner?: string | null;
    voided_at?: string | null;
  }>;
  attempts: ReadonlyArray<{
    do_number: string | null;
    result: "delivered" | "partial" | "failed";
    reason_key: string | null;
    recorded_at: string;
  }>;
  handoverEvents: ReadonlyArray<{
    delivery_order_id: string;
    kind: DeliveryHandoverKind;
    recorded_at?: string | null;
  }>;
  /** `ops_order_control.delivery_photos`. */
  photos: ReadonlyArray<{ at?: string | null; by?: string | null; doNumber?: string | null }>;
  lines: ReadonlyArray<{ sku: string; qty: number }>;
  /** What the Sales Order's own fields say, used ONLY when Delivery recorded
   *  nothing for the whole-order scope (the table shipped without a backfill). */
  fallbackPartnerName: string | null;
  fallbackConfirmedDate: string | null;
  fallbackConfirmedTime: string | null;
}

type Doc = RouteScopeFacts["deliveryOrders"][number];

const words = (value: string | null | undefined) => value?.trim() || null;
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);
const groupKeys = new Set<string>(DELIVERY_GROUPS.map((group) => group.key));
const groupsOf = (doc: Doc): DeliveryGroupKey[] | null => {
  const list = (doc.trip_groups ?? []).filter((key): key is DeliveryGroupKey => groupKeys.has(key));
  return list.length > 0 ? list : null;
};

function recordsOf(facts: RouteScopeFacts, doc: Doc | null, takeUnbound: boolean) {
  return {
    deliveryOrder: doc ? { id: doc.id, number: doc.do_number } : null,
    attempts: doc
      ? facts.attempts
          .filter((attempt) => attempt.do_number === doc.do_number)
          .map((attempt) => ({
            result: attempt.result,
            reasonKey: attempt.reason_key,
            recordedAt: attempt.recorded_at,
            reason: attempt.reason_key ? deliveryReasonLabel(attempt.reason_key) : null,
          }))
      : [],
    handoverEvents: doc
      ? facts.handoverEvents
          .filter((event) => event.delivery_order_id === doc.id)
          .map((event) => ({ kind: event.kind, recordedAt: event.recorded_at ?? null }))
      : [],
    /* A photo belongs to the document its number names. An entry that names no
       document predates the binding; only an ordinary order may claim it. */
    photos: facts.photos
      .filter((photo) =>
        words(photo.doNumber) ? doc != null && words(photo.doNumber) === doc.do_number : takeUnbound,
      )
      .map((photo) => ({ at: photo.at ?? null, by: photo.by ?? null })),
  };
}

function goodsWords(facts: RouteScopeFacts, groups: ReadonlyArray<DeliveryGroupKey>): string {
  return groups
    .map((key) => {
      const count = facts.lines
        .filter((line) => deliveryGroupOf(line.sku) === key)
        .reduce((sum, line) => sum + Math.max(0, Number(line.qty) || 0), 0);
      const label = DELIVERY_GROUPS.find((group) => group.key === key)?.label ?? key;
      return `${label}, ${count} ${count === 1 ? "item" : "items"}`;
    })
    .join(" · ");
}

export function routeDeliveryScopesOf(facts: RouteScopeFacts): RouteDeliveryScope[] {
  const live = facts.deliveryOrders.filter((doc) => !doc.voided_at);
  const arrangementOf = (leg: number) =>
    facts.arrangements.find((row) => Number(row.leg) === leg) ?? null;

  /* ── a Delivery Journey: two or more recorded stops ───────────────────── */
  const stops = [...facts.stops].sort((a, b) => Number(a.leg) - Number(b.leg));
  if (stops.length >= 2) {
    const last = Math.max(...stops.map((stop) => Number(stop.leg) || 0));
    return stops.map((stop) => {
      const leg = Number(stop.leg) || 0;
      const transfer = leg < last;
      const arrangement = arrangementOf(leg);
      const doc = live.find((row) => Number(row.leg ?? 0) === leg) ?? null;
      const from = words(stop.from_loc);
      /* The last leg ends at the customer, whatever spelling the stop kept. */
      const to = transfer ? words(stop.to_loc) : "customer";
      return {
        leg,
        trip: 0,
        plate: [`Leg ${leg}`, [from, to].filter(Boolean).join(" → ")].filter(Boolean).join(" · "),
        transfer,
        legStop: transfer ? words(stop.to_loc) : null,
        partnerName: words(arrangement?.partner_name) ?? words(stop.partner_name),
        confirmedDate: day(doc?.delivery_date) ?? day(arrangement?.confirmed_date) ?? day(stop.scheduled_at),
        confirmedTime: words(doc?.time_slot) ?? words(arrangement?.confirmed_time),
        tripGroups: null,
        ...recordsOf(facts, doc, false),
      };
    });
  }

  /* ── a split delivery: a live document that is a trip ─────────────────── */
  const trips = live
    .filter((doc) => Number(doc.trip ?? 0) > 0)
    .sort((a, b) => Number(a.trip) - Number(b.trip));
  if (trips.length > 0) {
    const scopes: RouteDeliveryScope[] = trips.map((doc) => {
      const groups = groupsOf(doc);
      return {
        leg: 0,
        trip: Number(doc.trip),
        plate: `Trip ${Number(doc.trip)} · ${groups ? goodsWords(facts, groups) : "All goods"}`,
        transfer: false,
        legStop: null,
        partnerName: words(doc.logistics_partner),
        confirmedDate: day(doc.delivery_date),
        confirmedTime: words(doc.time_slot),
        tripGroups: groups,
        ...recordsOf(facts, doc, false),
      };
    });
    const carried = new Set(scopes.flatMap((scope) => scope.tripGroups ?? []));
    const open = DELIVERY_GROUPS.map((group) => group.key).filter(
      (key) => !carried.has(key) && facts.lines.some((line) => deliveryGroupOf(line.sku) === key),
    );
    if (open.length > 0 && scopes.every((scope) => scope.tripGroups != null)) {
      const next = Math.max(...scopes.map((scope) => scope.trip)) + 1;
      scopes.push({
        leg: 0,
        trip: next,
        plate: `Trip ${next} · not booked yet`,
        transfer: false,
        legStop: null,
        partnerName: null,
        confirmedDate: null,
        confirmedTime: null,
        tripGroups: open,
        ...recordsOf(facts, null, false),
      });
    }
    return scopes;
  }

  /* ── an ordinary order: one scope, no plate ───────────────────────────── */
  const arrangement = arrangementOf(0);
  const doc = live.find((row) => Number(row.leg ?? 0) === 0 && Number(row.trip ?? 0) === 0) ?? null;
  return [
    {
      leg: 0,
      trip: 0,
      plate: null,
      transfer: false,
      legStop: null,
      partnerName: words(arrangement?.partner_name) ?? words(doc?.logistics_partner) ?? words(facts.fallbackPartnerName),
      confirmedDate: day(doc?.delivery_date) ?? day(arrangement?.confirmed_date) ?? day(facts.fallbackConfirmedDate),
      confirmedTime:
        words(doc?.time_slot) ?? words(arrangement?.confirmed_time) ?? words(facts.fallbackConfirmedTime),
      tripGroups: null,
      ...recordsOf(facts, doc, true),
    },
  ];
}
