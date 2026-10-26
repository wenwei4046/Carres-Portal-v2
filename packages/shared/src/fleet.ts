import { z } from "zod";
import { lineCategory, lineKind } from "./line-category";

/**
 * Carres' own lorries — Fleet Day, Run sheet, Live Map, Lorry Capacity and
 * Crew Leave (migration 0724). Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): build the Houzs behaviour (Houzs FleetDay / FleetRunSheet /
 * LorryLiveMap / LorryCapacity / DriverLeave); Jess was not part of this
 * decision. Lorries and crew are the own-fleet company's Settings → Logistics
 * Vehicles and Drivers; a lorry run is one lorry on one day.
 */

export type FleetRole = "driver" | "helper";

export interface FleetLorry { id: string; plate: string; vehicleType: string; capacity: string | null; active: boolean }
export interface FleetCrew { id: string; name: string; phone: string | null; role: FleetRole; active: boolean }
export interface FleetLeave { id: string; crewId: string; fromDate: string; toDate: string; reason: string }
export interface FleetDayCrew { day: string; vehicleId: string; driverId: string | null; helperId: string | null }
export interface FleetStop {
  day: string;
  vehicleId: string | null;
  plate: string | null;
  orderId: string;
  leg: number;
  so: number | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  confirmedTime: string | null;
  expectedArrival: string | null;
  revenue: number;
}
export interface FleetRun { day: string; vehicleId: string | null; plate: string | null; stops: FleetStop[]; revenue: number }

export const isOnLeave = (crewId: string, day: string, leave: readonly FleetLeave[]) =>
  leave.some((l) => l.crewId === crewId && l.fromDate <= day && day <= l.toDate);

/** One run per lorry per day; stops in arrival order, then SO. Unmatched plates group as `vehicleId: null`. */
export function groupRuns(stops: readonly FleetStop[]): FleetRun[] {
  const runs = new Map<string, FleetRun>();
  for (const s of stops) {
    const key = `${s.day}|${s.vehicleId ?? ""}`;
    const run = runs.get(key) ?? { day: s.day, vehicleId: s.vehicleId, plate: s.vehicleId ? s.plate : null, stops: [], revenue: 0 };
    run.stops.push(s);
    run.revenue += s.revenue;
    runs.set(key, run);
  }
  const at = (s: FleetStop) => s.expectedArrival ?? s.confirmedTime ?? "99";
  for (const r of runs.values()) r.stops.sort((a, b) => at(a).localeCompare(at(b)) || (a.so ?? 0) - (b.so ?? 0));
  // A run with no matched lorry goes last on its day.
  return [...runs.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || Number(a.plate == null) - Number(b.plate == null) || (a.plate ?? "").localeCompare(b.plate ?? ""),
  );
}

export interface CrewPick { driverId: string | null; helperId: string | null; confirmed: boolean }

/**
 * Houzs "Propose crew": every lorry gets a driver and a helper. A confirmed
 * row is kept as it is. Otherwise the lorry's most recent crew comes back,
 * then the Settings template driver of that lorry, then the first free person
 * by name. Nobody on leave, inactive or already on another lorry that day.
 */
export function proposeCrew(input: {
  day: string;
  lorries: readonly FleetLorry[];
  templateDriverName?: ReadonlyMap<string, string | null>;
  crew: readonly FleetCrew[];
  leave: readonly FleetLeave[];
  confirmed: readonly FleetDayCrew[];
  history: readonly FleetDayCrew[];
}): Map<string, CrewPick> {
  const { day, crew, leave } = input;
  const out = new Map<string, CrewPick>();
  const used = new Set<string>();
  for (const c of input.confirmed) {
    if (c.day !== day) continue;
    out.set(c.vehicleId, { driverId: c.driverId, helperId: c.helperId, confirmed: true });
    if (c.driverId) used.add(c.driverId);
    if (c.helperId) used.add(c.helperId);
  }
  const free = (role: FleetRole) =>
    crew
      .filter((c) => c.active && c.role === role && !used.has(c.id) && !isOnLeave(c.id, day, leave))
      .sort((a, b) => a.name.localeCompare(b.name));
  const past = [...input.history].filter((h) => h.day < day).sort((a, b) => b.day.localeCompare(a.day));
  for (const lorry of input.lorries) {
    if (out.has(lorry.id)) continue;
    const pick = (role: FleetRole): string | null => {
      const options = free(role);
      if (options.length === 0) return null;
      const last = past.find((h) => h.vehicleId === lorry.id && (role === "driver" ? h.driverId : h.helperId));
      const lastId = last ? (role === "driver" ? last.driverId : last.helperId) : null;
      const template = role === "driver" ? input.templateDriverName?.get(lorry.id)?.trim().toLowerCase() : undefined;
      const chosen =
        options.find((c) => c.id === lastId) ??
        (template ? options.find((c) => c.name.trim().toLowerCase() === template) : undefined) ??
        options[0];
      used.add(chosen.id);
      return chosen.id;
    };
    const driverId = pick("driver");
    const helperId = pick("helper");
    out.set(lorry.id, { driverId, helperId, confirmed: false });
  }
  return out;
}

/** Mon–Sat days in [from, to] inclusive — Houzs' working-day count. */
export function workingDays(from: string, to: string): number {
  let n = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0) n += 1;
  }
  return n;
}

export interface LorryCapacityRow {
  vehicleId: string;
  plate: string;
  capacity: string | null;
  workingDays: number;
  trips: number;
  /** trips ÷ working days (Houzs' definition; null when no working days). */
  utilisation: number | null;
  stops: number;
  stopsPerTrip: number | null;
  revenue: number;
  revenuePerTrip: number | null;
}

/** Houzs Lorry Capacity over a range: one row per lorry; a trip is one lorry on one day. */
export function lorryCapacity(from: string, to: string, lorries: readonly FleetLorry[], stops: readonly FleetStop[]): LorryCapacityRow[] {
  const days = workingDays(from, to);
  const runs = groupRuns(stops.filter((s) => s.day >= from && s.day <= to));
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return lorries.map((l) => {
    const mine = runs.filter((r) => r.vehicleId === l.id);
    const stopCount = mine.reduce((n, r) => n + r.stops.length, 0);
    const revenue = mine.reduce((n, r) => n + r.revenue, 0);
    return {
      vehicleId: l.id,
      plate: l.plate,
      capacity: l.capacity,
      workingDays: days,
      trips: mine.length,
      utilisation: div(mine.length, days),
      stops: stopCount,
      stopsPerTrip: div(stopCount, mine.length),
      revenue,
      revenuePerTrip: div(revenue, mine.length),
    };
  });
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

export const fleetCrewConfirmInput = z.object({
  day: isoDate,
  vehicleId: uuid,
  driverId: uuid.nullable(),
  helperId: uuid.nullable(),
});
export const fleetCrewLeaveInput = z
  .object({ crewId: uuid, fromDate: isoDate, toDate: isoDate, reason: z.string().trim().min(1).max(200) })
  .refine((v) => v.toDate >= v.fromDate, { message: "The last day is before the first day.", path: ["toDate"] });
export const fleetPositionInput = z.object({
  vehicleId: uuid,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /* Not in the future: the Live Map shows the latest fix per lorry (row security refuses it too). */
  recordedAt: z
    .string()
    .datetime({ offset: true })
    .refine((v) => Date.parse(v) <= Date.now() + 2 * 60_000, { message: "The time is in the future." })
    .optional(),
  source: z.enum(["driver_app", "tracker"]).default("driver_app"),
});

/* ── 0725 · Fleet Health, Delivery Zones, Rate Cards ─────────────────────────
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): the Houzs way (Houzs
 * FleetHealth, DeliveryZones + zone-classify.ts, DeliveryRateCards +
 * delivery-rate-card.ts). Jess was not part of this decision.
 */

export type DueFlag = "overdue" | "due_soon" | "ok" | "not_recorded";

/** A lorry date: overdue once the day has passed, due soon within `soonDays` (Houzs: 30). */
export function dueFlag(due: string | null | undefined, today: string, soonDays = 30): DueFlag {
  if (!due) return "not_recorded";
  if (due < today) return "overdue";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + soonDays);
  return due <= soon.toISOString().slice(0, 10) ? "due_soon" : "ok";
}

/** The worst of a lorry's flags, for one status per lorry. */
export function worstFlag(flags: readonly DueFlag[]): DueFlag {
  for (const f of ["overdue", "due_soon", "not_recorded"] as const) if (flags.includes(f)) return f;
  return "ok";
}

export interface DeliveryZone { id: string; name: string; postcodes: string[] }

const RANGE = /^(\d{2}|\d{5})(?:-(\d{2}|\d{5}))?$/;
/** One zone entry as an inclusive 5-digit range: "47" = 47000–47999, "46-47", "58200-58299", "58200". */
export function postcodeRange(entry: string): [number, number] | null {
  const m = RANGE.exec(entry.trim());
  if (!m) return null;
  const lo = Number(m[1].padEnd(5, "0"));
  const hi = Number((m[2] ?? m[1]).padEnd(5, "9"));
  return lo <= hi ? [lo, hi] : null;
}

/** A 5-digit Malaysian postcode in free text (not glued to other digits). */
export const parsePostcode = (raw: string | null | undefined) => /(?<!\d)(\d{5})(?!\d)/.exec(raw ?? "")?.[1] ?? null;

/** Which zone a postcode (or an address holding one) falls in. The narrowest range wins (Houzs rule). */
export function zoneForPostcode<Z extends DeliveryZone>(raw: string | null | undefined, zones: readonly Z[]): Z | null {
  const pc = parsePostcode(raw);
  if (!pc) return null;
  const n = Number(pc);
  let best: Z | null = null;
  let width = Infinity;
  for (const z of zones) {
    for (const entry of z.postcodes) {
      const r = postcodeRange(entry);
      if (r && r[0] <= n && n <= r[1] && r[1] - r[0] < width) {
        best = z;
        width = r[1] - r[0];
      }
    }
  }
  return best;
}

export type RateBasis = "item" | "order";
/** One sofa compartment band: a sofa of `min`..`max` compartments (max null = "min and more") costs `amount`. */
export interface SofaBracket { min: number; max: number | null; amount: number }
export interface RateCard {
  id: string;
  partnerId: string;
  /** null = every other zone */
  zoneId: string | null;
  basis: RateBasis;
  firstUnit: number;
  secondUnit: number;
  furtherUnit: number;
  minCharge: number;
  /** Units up to the cap price on 1st / 2nd / each further; each unit past it costs `overageEach`. null = no cap. */
  overageCap: number | null;
  overageEach: number;
  /** A sofa is priced by its compartment band, never as a unit. */
  sofaBrackets: SofaBracket[];
  serviceCharge: number;
  pickupCharge: number;
  disposalCharge: number;
}

/** The company's card for a zone, else its "every other zone" card. */
export const rateCardFor = (cards: readonly RateCard[], partnerId: string, zoneId: string | null) =>
  cards.find((c) => c.partnerId === partnerId && zoneId != null && c.zoneId === zoneId) ??
  cards.find((c) => c.partnerId === partnerId && c.zoneId == null) ??
  null;

/** What one delivery order carries, for its charge. */
export interface DeliveryFacts {
  /** Goods counted on 1st / 2nd / each further, sofas excluded. */
  items: number;
  /** One entry per sofa: its compartments. */
  sofaCompartments?: readonly number[];
  services?: number;
  pickups?: number;
  disposals?: number;
}
export type ChargeKind = "unit" | "overage" | "sofa" | "service" | "pickup" | "disposal" | "minimum";
export interface ChargeLine { kind: ChargeKind; label: string; amount: number }

const sen = (rm: number) => Math.round((Number(rm) || 0) * 100);
const whole = (n: number | null | undefined) => Math.max(0, Math.floor(Number(n) || 0));

/**
 * A delivery order's charge on a rate card, line by line. Follows Houzs
 * backend/src/scm/lib/delivery-rate-card.ts:292-437 per Weisiang's ruling (2026-10-22): clear Carres rules,
 * implement Houzs. Order: units (1st, 2nd, each further; past the cap each unit costs the overage),
 * sofas by compartment band, service / pickup / disposal x count, then the minimum. Sums in whole sen.
 * Per delivery order = one unit (Carres's own basis). Houzs' charge cap, rounding and per-trip /
 * per-customer counting are not carried.
 */
export function deliveryCharge(card: RateCard, facts: DeliveryFacts): { total: number; lines: ChargeLine[] } {
  const lines: Array<ChargeLine & { s: number }> = [];
  const push = (kind: ChargeKind, label: string, s: number) => { if (s > 0) lines.push({ kind, label, amount: s / 100, s }); };
  const units = card.basis === "order" ? 1 : whole(facts.items);
  const cap = card.overageCap == null ? null : whole(card.overageCap);
  const tier = [sen(card.firstUnit), sen(card.secondUnit), sen(card.furtherUnit)];
  // Houzs delivery-rate-card.ts:305-324: past the cap, a unit costs the overage, not the top tier.
  const capped = cap == null ? units : Math.min(units, cap);
  const tiered = (capped >= 1 ? tier[0] : 0) + (capped >= 2 ? tier[1] : 0) + Math.max(0, capped - 2) * tier[2];
  push("unit", `${capped} ${card.basis === "order" ? "delivery order" : capped === 1 ? "item" : "items"}`, tiered);
  if (cap != null && units > cap) push("overage", `${units - cap} over ${cap}`, (units - cap) * sen(card.overageEach));
  // Houzs delivery-rate-card.ts:326-345: one band per sofa, first band that fits.
  for (const c of facts.sofaCompartments ?? []) {
    const n = whole(c);
    const band = card.sofaBrackets.find((b) => n >= whole(b.min) && (b.max == null || n <= whole(b.max)));
    if (n > 0 && band) push("sofa", `Sofa ${n} compartments`, sen(band.amount));
  }
  // Houzs delivery-rate-card.ts:365-386: rate x count.
  const each: Array<[ChargeKind, string, number | undefined, number]> = [
    ["service", "Service", facts.services, card.serviceCharge],
    ["pickup", "Pickup", facts.pickups, card.pickupCharge],
    ["disposal", "Disposal", facts.disposals, card.disposalCharge],
  ];
  for (const [kind, word, count, rate] of each) {
    const n = whole(count);
    if (n > 0) push(kind, n > 1 ? `${word} x${n}` : word, n * sen(rate));
  }
  let total = lines.reduce((t, l) => t + l.s, 0);
  // Houzs delivery-rate-card.ts:406-409: anything below the minimum is raised to it, even nothing.
  if (total < sen(card.minCharge)) { push("minimum", "Minimum", sen(card.minCharge) - total); total = sen(card.minCharge); }
  return { total: total / 100, lines: lines.map(({ s: _s, ...l }) => l) };
}

/** Sofa bands as typed: "1-3 50, 4-5 70, 6+ 90" (compartments, then RM). null = not readable. */
export function parseSofaBands(text: string): SofaBracket[] | null {
  const out: SofaBracket[] = [];
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d{1,2})(?:(\+)|-(\d{1,2}))?\s+(\d+(?:\.\d{1,2})?)$/.exec(part);
    if (!m) return null;
    const min = Number(m[1]);
    const max = m[2] ? null : Number(m[3] ?? m[1]);
    if (min < 1 || (max != null && max < min)) return null;
    out.push({ min, max, amount: Number(m[4]) });
  }
  return out;
}
export const formatSofaBands = (bands: readonly SofaBracket[]) =>
  bands.map((b) => `${b.min}${b.max == null ? "+" : b.max === b.min ? "" : `-${b.max}`} ${b.amount}`).join(", ");

/** Houzs positional tiers for a count of goods only (the DO page). */
export const deliveryCost = (card: RateCard, items: number) => deliveryCharge(card, { items }).total;

/**
 * A delivery order's goods as charge facts. Follows Houzs delivery-rate-card.ts:23-27 per Weisiang's
 * ruling (2026-10-22): clear Carres rules, implement Houzs — a sofa is not a unit, it is priced by its
 * compartments. A built sofa's compartments are its lines sharing `attrs.sofa_build_key`.
 */
// ponytail: a sofa line with no build key counts its qty as one sofa's compartments; read a model's compartment count if that proves wrong.
export function deliveryFacts(lines: ReadonlyArray<{ sku: string; qty: number; attrs?: Record<string, unknown> | null }>): DeliveryFacts {
  let items = 0;
  const sofas = new Map<string, number>();
  lines.forEach((l, i) => {
    const qty = whole(l.qty);
    if (lineKind(l.sku) !== "core") return; // accessories and service lines are not goods on the lorry
    if (lineCategory(l.sku) !== "sofa") { items += qty; return; }
    const key = String(l.attrs?.sofa_build_key ?? `line-${i}`);
    sofas.set(key, (sofas.get(key) ?? 0) + qty);
  });
  return { items, sofaCompartments: [...sofas.values()] };
}

const dateOrNull = isoDate.nullable();
export const fleetHealthInput = z.object({
  vehicleId: uuid,
  puspakomDue: dateOrNull,
  roadTaxDue: dateOrNull,
  insuranceDue: dateOrNull,
  serviceDue: dateOrNull,
});
export const deliveryZoneInput = z.object({
  id: uuid.nullish(),
  name: z.string().trim().min(1).max(60),
  postcodes: z
    .array(z.string().trim())
    .max(200)
    .refine((xs) => xs.every((x) => postcodeRange(x) !== null), { message: "Write each range as 47, 46-47, 58200-58299 or 58200." }),
});
const money = z.number().min(0).max(99_999_999);
export const rateCardInput = z.object({
  id: uuid.nullish(),
  partnerId: uuid,
  zoneId: uuid.nullable(),
  basis: z.enum(["item", "order"]),
  firstUnit: money,
  secondUnit: money,
  furtherUnit: money,
  minCharge: money.default(0),
  overageCap: z.number().int().min(1).max(999).nullable().default(null),
  overageEach: money.default(0),
  sofaBrackets: z
    .array(z.object({ min: z.number().int().min(1).max(99), max: z.number().int().min(1).max(99).nullable(), amount: money }))
    .max(20)
    .refine((bs) => bs.every((b) => b.max == null || b.min <= b.max), { message: "A band's lowest compartments must not be above its highest." })
    .default([]),
  serviceCharge: money.default(0),
  pickupCharge: money.default(0),
  disposalCharge: money.default(0),
});
