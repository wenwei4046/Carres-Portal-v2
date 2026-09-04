import type { DeliveryWarehouseScheduleEvent } from "./delivery-warehouse-schedule";
import { isWorkingDay, type IsoDate, type WorkingDayOptions } from "./working-days";

/**
 * WAREHOUSE CARD 03 — the Dashboard Calendar's dates and the ONE card
 * arithmetic (docs/stock/MASTER.md §2 "WAREHOUSE DASHBOARD CALENDAR",
 * owner-approved 2026-09-04; docs/delivery/MASTER.md §4).
 *
 * The Warehouse operates a six-day week (Mon–Sat, minus governed closed
 * dates). The Dashboard shows six OPERATING dates in one chronological
 * horizontal sequence; the same projection becomes a one-day agenda at
 * narrow width. Every count here derives from the schedule feed's exact
 * Unit rows — nothing is stored, and required = handed over + not handed
 * over is the shared §3.5.1 projection, never a second total.
 */

/** The Warehouse week: Sunday is the governed weekly closure. */
export const WAREHOUSE_OFF_DAYS: readonly number[] = [0];

export const WAREHOUSE_DASHBOARD_DATE_COUNT = 6;

/**
 * The `n` Warehouse operating dates starting at `from` (itself included when
 * it operates). Sundays and governed closed dates are skipped, never renamed.
 */
export function warehouseOperatingDates(
  from: IsoDate,
  n: number = WAREHOUSE_DASHBOARD_DATE_COUNT,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): IsoDate[] {
  const opts: WorkingDayOptions = { offDays: WAREHOUSE_OFF_DAYS, holidays };
  const out: IsoDate[] = [];
  let cur = from.slice(0, 10);
  let guard = 0;
  while (out.length < n && guard < 60) {
    if (isWorkingDay(cur, opts)) out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cur = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
    guard++;
  }
  return out;
}

/**
 * The anchor of the previous/next six-date window. Moving forward starts the
 * next window on the first operating date after the current window's last
 * date; moving back walks six operating dates backwards.
 */
export function warehouseRangeShift(
  currentDates: readonly IsoDate[],
  direction: 1 | -1,
  holidays: ReadonlySet<IsoDate> | readonly IsoDate[] = [],
): IsoDate {
  const opts: WorkingDayOptions = { offDays: WAREHOUSE_OFF_DAYS, holidays };
  if (currentDates.length === 0) return "";
  if (direction === 1) {
    const last = currentDates[currentDates.length - 1];
    return warehouseOperatingDates(step(last, 1), 1, holidays)[0] ?? last;
  }
  // Backwards: collect six operating dates strictly before the first.
  let cur = currentDates[0];
  let found: IsoDate | null = null;
  let count = 0;
  let guard = 0;
  while (count < WAREHOUSE_DASHBOARD_DATE_COUNT && guard < 60) {
    cur = step(cur, -1);
    if (isWorkingDay(cur, opts)) {
      count++;
      found = cur;
    }
    guard++;
  }
  return found ?? currentDates[0];
}

function step(iso: IsoDate, dir: 1 | -1): IsoDate {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + dir));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The governed empty-date sentence — registered in COPY-STANDARD, exact.
 * `{date}` is the formatted date the operator chose.
 */
export function warehouseEmptyDaySentence(dateLabel: string): string {
  return `No outbound handovers on ${dateLabel}. Choose another date.`;
}

/**
 * ONE Calendar card = ONE active customer Delivery Order scope (never one
 * Sales Order, never one Unit). Aggregation is display-only: every count
 * carries the exact Unit rows it was counted from.
 */
export interface WarehouseOutboundCard {
  doNumber: string;
  /** The DO document row id the governed act doors address, or null. */
  deliveryOrderId: string | null;
  orderId: string;
  leg: number;
  /** `SO-<n>` — the source document identity. */
  source: string;
  soDate: string | null;
  eventDate: IsoDate;
  fromLocation: string;
  toCustomer: string;
  logisticsPartner: string;
  expectedCollectionWindow: string | null;
  /** The LATEST accepted physical handover in this scope, or null. */
  actualHandoverAt: string | null;
  /** Exact Unit rows — the drill-down every count owes (§3.5.1). */
  units: DeliveryWarehouseScheduleEvent[];
  unitsRequired: number;
  handedOver: number;
  notHandedOver: number;
  /** A handover fact exists whose admitted evidence is missing. */
  evidenceNotSubmitted: boolean;
  deliveryOrderHref: string;
  sourceHref: string;
}

/**
 * Group the schedule feed's per-Unit pickup events into DO cards — the ONE
 * arithmetic the Dashboard, Outbound and their tests all read (Law D).
 * Only `customer_delivery_pickup` events participate; `customer_handover`
 * is the Delivery calendar's projection, not Warehouse work.
 */
export function warehouseOutboundCards(
  events: readonly DeliveryWarehouseScheduleEvent[],
): WarehouseOutboundCard[] {
  const byDo = new Map<string, DeliveryWarehouseScheduleEvent[]>();
  for (const e of events) {
    if (e.kind !== "customer_delivery_pickup") continue;
    const list = byDo.get(e.doNumber);
    if (list) list.push(e);
    else byDo.set(e.doNumber, [e]);
  }
  const cards: WarehouseOutboundCard[] = [];
  for (const units of byDo.values()) {
    const first = units[0];
    const handed = units.filter((u) => Boolean(u.unitHandedOverAt));
    const latest = handed
      .map((u) => u.unitHandedOverAt as string)
      .sort()
      .at(-1);
    cards.push({
      doNumber: first.doNumber,
      deliveryOrderId: first.deliveryOrderId ?? null,
      orderId: first.orderId,
      leg: first.leg,
      source: first.source,
      soDate: first.soDate ?? null,
      eventDate: first.eventDate,
      fromLocation: first.fromLocation,
      toCustomer: first.toCustomer,
      logisticsPartner: first.logisticsPartner,
      expectedCollectionWindow: first.expectedCollectionWindow,
      actualHandoverAt: latest ?? null,
      units,
      unitsRequired: units.length,
      handedOver: handed.length,
      notHandedOver: units.length - handed.length,
      evidenceNotSubmitted: units.some(
        (u) => Boolean(u.unitHandedOverAt) && !u.hasEvidence,
      ),
      deliveryOrderHref: first.deliveryOrderHref,
      sourceHref: first.sourceHref,
    });
  }
  cards.sort((a, b) =>
    a.eventDate === b.eventDate
      ? a.doNumber.localeCompare(b.doNumber)
      : a.eventDate.localeCompare(b.eventDate),
  );
  return cards;
}

/**
 * The plain reason a Unit is still not handed over — derived from its own
 * recorded facts, never stored, never a status word.
 */
export function warehouseUnitPendingReason(
  u: Pick<
    DeliveryWarehouseScheduleEvent,
    "unitHandedOverAt" | "unitScannedAt" | "unitCheckedAt" | "unitPackedAt"
  >,
): string | null {
  if (u.unitHandedOverAt) return null;
  if (!u.unitScannedAt) return "Not scanned yet";
  if (!u.unitCheckedAt) return "Not checked yet";
  if (!u.unitPackedAt) return "Not packed yet";
  return "Waiting for handover";
}
