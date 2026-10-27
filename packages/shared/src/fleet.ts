import { z } from "zod";

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
