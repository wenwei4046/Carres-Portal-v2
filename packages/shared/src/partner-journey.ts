/**
 * Delivery Card 03 (0411) — the ONE backward calculation
 * (docs/delivery/MASTER.md §5.1, owner ruling 2026-09-01).
 *
 *   customer delivery date
 *   → latest arrival at the partner warehouse / destination region
 *   → the partner's actual KL pickup day
 *   → latest Carres Warehouse ready date
 *
 * The facts are the carrier's own (0411: pickup_days · journey_regions ·
 * surcharge_areas). This module is the one engine that turns them into the
 * chain; the API and every surface read it, and Warehouse/Purchasing CONSUME
 * the result — nobody recalculates it (stock/MASTER §5).
 *
 * ABSENCE STAYS SILENT (the 0283/T7 law): a partner with no recorded pickup
 * week, or no rule for the destination region, produces a named absence — never
 * a guessed date. The chain INFORMS; it never blocks an assignment, because the
 * carrier is reachable by phone.
 *
 * PURE — no I/O, no clock, no locale. Holidays are passed in.
 */

import type { IsoDate } from "./working-days";

/** One destination region as the carrier states it. `deliveryDays: null` means
 *  the carrier only states its pickup week — the engine then derives
 *  delivery = pickup + transitDays and says so via `deliveryDerived`. */
export interface JourneyRegionRule {
  /** Weekday numbers (0=Sun…6=Sat) the carrier delivers in this region. */
  deliveryDays: number[] | null;
  /** Whole days from KL pickup to delivery in this region. 0 = same day. */
  transitDays: number;
}

export interface PartnerJourneyCalendar {
  /** Weekday numbers (1=Mon…6=Sat) the carrier collects from Carres Klang.
   *  null = not recorded ⇒ every chain is a named absence. */
  pickupDays: number[] | null;
  regions: Record<string, JourneyRegionRule>;
  surchargeAreas: string[];
}

/** Normalise the DB row shape (0411 columns) into the calendar. A row nobody
 *  has configured reads as "not recorded" and stays silent. */
export function partnerJourneyCalendar(raw: {
  pickup_days?: number[] | null;
  journey_regions?: unknown;
  surcharge_areas?: string[] | null;
} | null | undefined): PartnerJourneyCalendar {
  const regions: Record<string, JourneyRegionRule> = {};
  const rr = raw?.journey_regions;
  if (rr && typeof rr === "object" && !Array.isArray(rr)) {
    for (const [name, v] of Object.entries(rr as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = v as { deliveryDays?: unknown; transitDays?: unknown };
      const days = Array.isArray(o.deliveryDays)
        ? o.deliveryDays.filter(
            (d): d is number => typeof d === "number" && d >= 0 && d <= 6,
          )
        : null;
      const transit =
        typeof o.transitDays === "number" && o.transitDays >= 0 && o.transitDays <= 14
          ? Math.floor(o.transitDays)
          : 0;
      regions[name] = { deliveryDays: days, transitDays: transit };
    }
  }
  return {
    pickupDays:
      Array.isArray(raw?.pickup_days) && raw.pickup_days.length > 0
        ? raw.pickup_days
        : null,
    regions,
    surchargeAreas: raw?.surcharge_areas ?? [],
  };
}

export type JourneyChain =
  | {
      kind: "chain";
      /** Latest delivery day in the region on or before the customer date. */
      deliveryDay: IsoDate;
      /** true when the region states no delivery week and the day is derived
       *  from pickup + transit. */
      deliveryDerived: boolean;
      /** The carrier's actual KL pickup day feeding that delivery. */
      pickupDay: IsoDate;
      /** Latest Carres Warehouse ready date — the pickup day itself: the goods
       *  must be ready when the carrier arrives. */
      warehouseReadyBy: IsoDate;
    }
  /** The carrier never stated a pickup week, or has no rule for this region. */
  | { kind: "no_calendar" }
  /** The stated weeks give no possible day within the search window. */
  | { kind: "no_day_found" };

const DAY_MS = 24 * 60 * 60 * 1000;

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function addDaysIso(iso: string, days: number): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, (d ?? 1)) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Latest date ≤ `fromIso` whose weekday is in `days` and which is not a
 *  holiday, searching back `window` calendar days. null when none. */
function latestOnOrBefore(
  fromIso: string,
  days: number[],
  holidays: ReadonlySet<string> | undefined,
  window: number,
): IsoDate | null {
  let cur = fromIso.slice(0, 10);
  for (let i = 0; i <= window; i++) {
    if (days.includes(weekdayOf(cur)) && !holidays?.has(cur)) return cur;
    cur = addDaysIso(cur, -1);
  }
  return null;
}

export interface JourneyChainInput {
  /** The date the customer must receive the goods (or, for leg 1 of a two-leg
   *  journey, the latest arrival date at the partner warehouse). */
  customerDateIso: IsoDate;
  /** Destination region key as stored in journey_regions (e.g. "JB", "Melaka"). */
  region: string;
  calendar: PartnerJourneyCalendar;
  /** Malaysian public holidays as 'YYYY-MM-DD'. */
  holidays?: ReadonlySet<string>;
}

/**
 * The ONE backward calculation. Walks back from the customer date to the
 * latest region delivery day, then back `transitDays`, then to the latest KL
 * pickup day. `warehouseReadyBy` is the pickup day: Warehouse and Purchasing
 * consume it through dated Work and never guess it.
 */
export function latestWarehouseReadyDate({
  customerDateIso,
  region,
  calendar,
  holidays,
}: JourneyChainInput): JourneyChain {
  const rule = calendar.regions[region];
  if (!calendar.pickupDays || !rule) return { kind: "no_calendar" };

  const target = customerDateIso.slice(0, 10);
  const WINDOW = 21;

  let deliveryDay: IsoDate | null;
  let deliveryDerived = false;

  if (rule.deliveryDays && rule.deliveryDays.length > 0) {
    deliveryDay = latestOnOrBefore(target, rule.deliveryDays, holidays, WINDOW);
  } else {
    // The carrier states no delivery week for this region: the delivery day is
    // derived as pickup + transit, so the constraint lives on the pickup walk.
    deliveryDay = target;
    deliveryDerived = true;
  }
  if (!deliveryDay) return { kind: "no_day_found" };

  const latestPickupCandidate = addDaysIso(deliveryDay, -rule.transitDays);
  const pickupDay = latestOnOrBefore(
    latestPickupCandidate,
    calendar.pickupDays,
    holidays,
    WINDOW,
  );
  if (!pickupDay) return { kind: "no_day_found" };

  if (deliveryDerived) {
    deliveryDay = addDaysIso(pickupDay, rule.transitDays);
  }

  return {
    kind: "chain",
    deliveryDay,
    deliveryDerived,
    pickupDay,
    warehouseReadyBy: pickupDay,
  };
}
