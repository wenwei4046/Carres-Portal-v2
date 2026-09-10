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
  return `No pickups on ${dateLabel}. Choose another date.`;
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
  /** The individual the Partner assigned — a separate stored fact, never
   *  merged into the company name. Null until the Partner assigns one. */
  driverName: string | null;
  vehicle: string | null;
  expectedCollectionWindow: string | null;
  /** The driver's own independent collection confirmation for this DO scope
   *  (the arrangement's fact), or null. Never the warehouse's loading fact. */
  actualCollectionAt: string | null;
  /** The LATEST accepted physical handover in this scope, or null. */
  actualHandoverAt: string | null;
  /** Exact Unit rows — the drill-down every count owes (§3.5.1). */
  units: DeliveryWarehouseScheduleEvent[];
  unitsRequired: number;
  handedOver: number;
  notHandedOver: number;
  /** How many exact Units the LOGISTICS side itself confirmed receiving —
   *  the counterparty's independent statement, never the loading count. */
  driverConfirmed: number;
  /** Every product of this scope, with the three counts kept apart. */
  products: OutboundProduct[];
  /** A handover fact exists whose admitted evidence is missing. */
  evidenceNotSubmitted: boolean;
  deliveryOrderHref: string;
  sourceHref: string;
}

/** One product of one DO scope. Required, loaded and driver-confirmed are
 *  three different facts and never collapse into one number. */
export interface OutboundProduct {
  sku: string | null;
  name: string | null;
  qty: number;
  loaded: number;
  driverConfirmed: number;
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
    const confirmed = units.filter((u) => Boolean(u.unitDriverConfirmedAt));
    const latest = handed
      .map((u) => u.unitHandedOverAt as string)
      .sort()
      .at(-1);
    const bySku = new Map<string, OutboundProduct>();
    for (const u of units) {
      const key = u.sku ?? " no-sku";
      const entry = bySku.get(key) ?? {
        sku: u.sku,
        name: u.productName,
        qty: 0,
        loaded: 0,
        driverConfirmed: 0,
      };
      entry.qty += 1;
      if (u.unitHandedOverAt) entry.loaded += 1;
      if (u.unitDriverConfirmedAt) entry.driverConfirmed += 1;
      bySku.set(key, entry);
    }
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
      driverName: first.driverName ?? null,
      vehicle: first.vehicle ?? null,
      expectedCollectionWindow: first.expectedCollectionWindow,
      actualCollectionAt: first.actualCollectionAt ?? null,
      actualHandoverAt: latest ?? null,
      units,
      unitsRequired: units.length,
      handedOver: handed.length,
      notHandedOver: units.length - handed.length,
      driverConfirmed: confirmed.length,
      products: [...bySku.values()].sort((a, b) =>
        (a.name ?? a.sku ?? "~").localeCompare(b.name ?? b.sku ?? "~"),
      ),
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
/** Rail view semantics. `open` (the menu default) keeps every arrangement
 *  still owing loading work under its ORIGINAL date; `loaded` is the
 *  completed record query; `no-evidence` overlaps both — progress and
 *  exceptions are never mutually exclusive. `not-loaded` is the legacy
 *  spelling of `open` and stays honoured. */
export function outboundViewMatches(
  c: Pick<WarehouseOutboundCard, "notHandedOver" | "evidenceNotSubmitted">,
  view: string | null,
): boolean {
  return (
    !view ||
    view === "all" ||
    ((view === "open" || view === "not-loaded") && c.notHandedOver > 0) ||
    (view === "loaded" && c.notHandedOver === 0) ||
    (view === "no-evidence" && c.evidenceNotSubmitted)
  );
}

/** One filter pipeline for the Outbound Register — the rail counts, the
 *  list, the footer and the export all read THIS, so no count can describe
 *  a different scope than the rows beside it. `omit` recomputes the scope
 *  without one dimension (facet counting, exactly as Inbound does). */
export function filterOutboundCards(
  cards: readonly WarehouseOutboundCard[],
  p: URLSearchParams,
  omit?: "view" | "site",
): WarehouseOutboundCard[] {
  const q = (p.get("q") ?? "").trim().toLowerCase();
  const start = p.get("date") || p.get("from");
  const end = p.get("to") || start;
  return cards.filter((c) => {
    if (omit !== "view" && !outboundViewMatches(c, p.get("view")))
      return false;
    if (omit !== "site" && p.get("site") && p.get("site") !== c.fromLocation)
      return false;
    if (p.get("do") && p.get("do") !== c.doNumber) return false;
    if (start && c.eventDate < start) return false;
    if (end && c.eventDate > end) return false;
    return (
      !q ||
      [
        c.doNumber,
        c.source,
        c.toCustomer,
        c.logisticsPartner,
        c.driverName ?? "",
        ...c.units.map((u) => u.unitId),
        ...c.products.map((x) => `${x.name ?? ""} ${x.sku ?? ""}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  });
}

export interface OutboundRegisterFacets {
  view: Record<string, number>;
  site: Record<string, number>;
}

/** The Register view: rows, facet counts over the complete result, and the
 *  Unit totals of exactly the listed rows (arrangements and Units are two
 *  different counts and are labelled apart). */
export function buildOutboundRegisterView(
  cards: readonly WarehouseOutboundCard[],
  p: URLSearchParams,
) {
  const viewRows = filterOutboundCards(cards, p, "view");
  const siteRows = filterOutboundCards(cards, p, "site");
  const facets: OutboundRegisterFacets = {
    view: Object.fromEntries(
      ["all", "open", "loaded", "no-evidence"].map((word) => [
        word,
        viewRows.filter((row) => outboundViewMatches(row, word)).length,
      ]),
    ),
    site: {},
  };
  for (const row of siteRows)
    facets.site[row.fromLocation] = (facets.site[row.fromLocation] ?? 0) + 1;
  const rows = filterOutboundCards(cards, p);
  return {
    rows,
    facets,
    totals: {
      required: rows.reduce((n, c) => n + c.unitsRequired, 0),
      loaded: rows.reduce((n, c) => n + c.handedOver, 0),
      driverConfirmed: rows.reduce((n, c) => n + c.driverConfirmed, 0),
    },
  };
}

/** One physical-progress word per arrangement. Loading, handover, driver
 *  confirmation and customer receipt are four different facts; this word
 *  speaks ONLY the Warehouse loading progress. */
export function outboundStatusWordOf(
  card: Pick<WarehouseOutboundCard, "handedOver" | "notHandedOver">,
): string {
  if (card.handedOver === 0) return "Not loaded yet";
  if (card.notHandedOver > 0) return "Part loaded";
  return "Loaded";
}

/** The row's exception lines — each names its exact Unit or fact. A loaded
 *  Unit the driver has not matched, and a driver-confirmed Unit nobody
 *  recorded loading, are both differences that stay visible until resolved. */
export function outboundExceptionLines(
  card: WarehouseOutboundCard,
  todayIso: string,
  fmt: (iso: string) => string = (iso) => iso,
): string[] {
  const lines: string[] = [];
  const receiver = (card.driverName ?? "").trim() || card.logisticsPartner;
  if (card.eventDate < todayIso && card.notHandedOver > 0)
    lines.push(
      `Scheduled handover was ${fmt(card.eventDate)}. ${card.notHandedOver} Unit${card.notHandedOver === 1 ? "" : "s"} not loaded`,
    );
  if (card.evidenceNotSubmitted)
    lines.push("Loading evidence not submitted");
  for (const u of card.units) {
    if (u.unitHandedOverAt && card.driverConfirmed > 0 && !u.unitDriverConfirmedAt)
      lines.push(`${u.unitId} · Loaded, not confirmed by ${receiver}`);
    if (!u.unitHandedOverAt && u.unitDriverConfirmedAt)
      lines.push(
        `${u.unitId} · Confirmed by ${receiver}, no Warehouse loading record`,
      );
  }
  return lines;
}

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
  return "Waiting to be loaded";
}
