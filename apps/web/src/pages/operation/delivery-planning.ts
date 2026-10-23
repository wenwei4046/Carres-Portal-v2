/**
 * Delivery Planning arithmetic — migration 0723.
 *
 * Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22): office
 * staff plan delivery dates and trips with a time slot per stop, the Houzs way
 * (Houzs DeliveryPlanning / AutoSchedule / Trips). Overturns Jess's Delivery
 * MASTER §8, §14.3 and §15 rules; Jess was not part of this decision.
 *
 * A TRIP is one day + one carrier: a Logistics company, or Carres's own lorry
 * (no company; the lorry is the free-text `vehicle`). No trip table exists.
 */
import { resolveDeliveryLocality } from "@/lib/locality";

export type PlanOrder = {
  id: string; so: number | null; customer_name: string | null;
  customer_address: string | null; customer_address_line1: string | null;
  customer_address_city: string | null; customer_address_state: string | null;
  customer_address_postcode: string | null;
  delivery_date: string | null; delivery_date_tbd: boolean | null;
  entry_data: { fields?: Record<string, unknown> } | null;
};
export type PlanArrangement = {
  order_id: string; leg: number; partner_id: string | null;
  confirmed_date: string | null; planned_date: string | null;
  stop_seq: number | null; time_slot: string | null; vehicle: string | null;
};
export type PlanRegion = { state: string; region: string; per_day: number };
export type PlanFeed = {
  orders: PlanOrder[];
  arrangements: PlanArrangement[];
  deliveryOrders: { order_id: string; leg: number; do_number: string }[];
  regions: PlanRegion[];
  residenceRules: { building_type: string; note: string }[];
  companies: { id: string; name: string }[];
};

export const NO_REGION = "No region";
export const OWN_LORRY = "Own lorry";

export type PlanRow = {
  key: string; orderId: string; leg: number; so: string; customer: string;
  location: string; state: string | null; region: string; buildingType: string; rule: string;
  requested: string | null; doNumber: string | null;
  partnerId: string | null; carrier: string; vehicle: string | null;
  /** The trip day: the scheduled day when there is one, else the planned day. */
  day: string | null; scheduled: boolean; seq: number | null; timeSlot: string | null;
};

export const carrierOf = (partnerName: string | null, vehicle: string | null) =>
  partnerName ?? (vehicle ? `${OWN_LORRY} · ${vehicle}` : OWN_LORRY);

/** The rows the four pages show: every open order (whole-order scope) plus its legs. */
export function planRows(feed: PlanFeed): PlanRow[] {
  const regionOf = new Map(feed.regions.map((r) => [r.state.toLowerCase(), r.region]));
  const ruleOf = new Map(feed.residenceRules.map((r) => [r.building_type, r.note]));
  const company = new Map(feed.companies.map((c) => [c.id, c.name]));
  const arr = new Map(feed.arrangements.map((a) => [`${a.order_id}#${a.leg}`, a]));
  const doOf = new Map<string, string>();
  for (const d of feed.deliveryOrders) {
    const k = `${d.order_id}#${d.leg ?? 0}`;
    if (!doOf.has(k)) doOf.set(k, d.do_number); // newest first from the API
  }
  const rows: PlanRow[] = [];
  for (const o of feed.orders) {
    const legs = new Set([0, ...feed.arrangements.filter((a) => a.order_id === o.id).map((a) => a.leg)]);
    const loc = resolveDeliveryLocality(o);
    const buildingType = String(o.entry_data?.fields?.building_type ?? "").trim();
    for (const leg of [...legs].sort((a, b) => a - b)) {
      const a = arr.get(`${o.id}#${leg}`);
      const partnerName = a?.partner_id ? company.get(a.partner_id) ?? null : null;
      rows.push({
        key: `${o.id}#${leg}`, orderId: o.id, leg,
        so: o.so ? `SO-${o.so}${leg > 0 ? ` · Leg ${leg}` : ""}` : "",
        customer: o.customer_name ?? "",
        location: loc.label, state: loc.stateKey,
        region: (loc.stateKey && regionOf.get(loc.stateKey.toLowerCase())) || NO_REGION,
        buildingType, rule: ruleOf.get(buildingType) ?? "",
        requested: o.delivery_date_tbd ? null : o.delivery_date,
        doNumber: doOf.get(`${o.id}#${leg}`) ?? null,
        partnerId: a?.partner_id ?? null,
        carrier: carrierOf(partnerName, a?.vehicle ?? null),
        vehicle: a?.vehicle ?? null,
        day: a?.confirmed_date ?? a?.planned_date ?? null,
        scheduled: Boolean(a?.confirmed_date),
        seq: a?.stop_seq ?? null, timeSlot: a?.time_slot ?? null,
      });
    }
  }
  return rows;
}

export const planStatus = (r: PlanRow) =>
  !r.day ? "Waiting for a date" : r.scheduled ? "Scheduled" : `Planned, ${r.carrier} may change it`;

/** One trip = one day + one carrier, stops in order. */
export type Trip = { key: string; day: string; carrier: string; stops: PlanRow[] };
export function tripsOf(rows: PlanRow[]): Trip[] {
  const trips = new Map<string, Trip>();
  for (const r of rows) {
    if (!r.day) continue;
    const carrierKey = r.partnerId ?? `own:${(r.vehicle ?? "").toLowerCase()}`;
    const key = `${r.day}|${carrierKey}`;
    const t = trips.get(key) ?? { key, day: r.day, carrier: r.carrier, stops: [] };
    t.stops.push(r);
    trips.set(key, t);
  }
  for (const t of trips.values()) t.stops.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999) || a.so.localeCompare(b.so));
  return [...trips.values()].sort((a, b) => a.day.localeCompare(b.day) || a.carrier.localeCompare(b.carrier));
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * AUTO-SCHEDULE (Houzs AutoSchedule): each waiting delivery gets the earliest
 * delivery day on or after both `start` and the customer's requested date on
 * which its region still has room (`per_day`, counting deliveries already on
 * that day). Oldest requested first. Nothing is written until staff confirm.
 */
export function proposeDates(
  waiting: PlanRow[], all: PlanRow[], regions: PlanRegion[], start: string,
  refusal: (iso: string) => unknown,
): Map<string, string> {
  const perDay = new Map<string, number>();
  for (const r of regions) perDay.set(r.region, Math.max(perDay.get(r.region) ?? 0, r.per_day));
  const load = new Map<string, number>();
  for (const r of all) if (r.day) load.set(`${r.region}|${r.day}`, (load.get(`${r.region}|${r.day}`) ?? 0) + 1);
  const out = new Map<string, string>();
  const ordered = [...waiting].sort((a, b) => (a.requested ?? "9999").localeCompare(b.requested ?? "9999") || a.so.localeCompare(b.so));
  for (const r of ordered) {
    const cap = perDay.get(r.region) ?? 10;
    let day = r.requested && r.requested > start ? r.requested : start;
    // ponytail: walks day by day, a year at most.
    for (let i = 0; i < 366; i += 1, day = addDays(day, 1)) {
      if (refusal(day)) continue;
      const k = `${r.region}|${day}`;
      if ((load.get(k) ?? 0) < cap) {
        load.set(k, (load.get(k) ?? 0) + 1);
        out.set(r.key, day);
        break;
      }
    }
  }
  return out;
}

/** Trips' `Fill time slots`: two-hour slots from 09:00 by stop order; a stop keeps a slot it has. */
export function fillTimeSlots(stops: PlanRow[]): { row: PlanRow; seq: number; timeSlot: string }[] {
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  // ponytail: fixed two-hour slots, the sixth stop onward shares 17:00-19:00; staff edit any slot.
  const from = (i: number) => Math.min(9 + 2 * i, 17);
  return stops.map((row, i) => ({ row, seq: i + 1, timeSlot: row.timeSlot ?? `${hh(from(i))}-${hh(from(i) + 2)}` }));
}
