/**
 * DELIVERY MONITOR — the arithmetic behind the Monitor page.
 * Owner UI correction 2026-09-06 · `docs/delivery/MASTER.md` §8.
 *
 * PURE. No React, no I/O, no clock of its own — every function that needs
 * "today" is handed it, so the browser, the tests and a CI runner in UTC can
 * never disagree about which day a delivery sits on.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question: *which deliveries are planned, and which record does each one
 * open?* Monitor projects the SAME canonical scope rows two ways (owner
 * correction 2026-09-06):
 *
 *     Calendar          day columns and cards — planning by day
 *     every other view  the standard selectable work list (DataGrid rows)
 *
 * The six-day window, the card mapping, the filters, the rail counts and the
 * one href arithmetic all live here, so the rail count and the listing it
 * filters cannot be two different numbers (Architecture Law D).
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It writes nothing and derives no second truth. The scope rows come from
 * `delivery-work.ts` — the SAME `buildDeliveryScopeRows` entry rule and status
 * ladder — and this file only arranges what those owners already say. A
 * planned window ending proves nothing: no rung of any status reads the clock.
 */

import type { DeliveryArrangementRow } from "@carres/shared";
import type { DeliveryWorkStatusKind } from "@carres/shared";
import {
  buildDeliveryScopeRows,
  regionBucketOf,
  GOVERNED_LOGISTICS,
  type DeliveryScopeRow,
  type ScopeInputs,
} from "./delivery-work";

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD, Delivery section).
 * The 2026-09-06 owner correction ruled `WORK TO DO` (one group, never split
 * into "Delivery Schedule" and "Needs Checking"), `All regions` ·
 * `All logistics`, the short empty-day `No deliveries`, the spanning
 * empty-range sentence and `Clear filters`. Reused governed strings keep
 * their governed spelling.
 */
export const MONITOR_COPY = {
  page: "Monitor",
  docTitle: "Monitor — Carres",
  search: "Search deliveries…",
  /** Owner correction 2026-09-06 — the short per-day absence; the spanning
   *  sentence below owns the fully-empty range. */
  emptyDay: "No deliveries",
  loadFailed: "Monitor could not be loaded",
  tryAgain: "Try again",
  railWork: "WORK TO DO",
  railRegion: "REGION",
  railLogistics: "LOGISTICS",
  calendar: "Calendar",
  noConfirmedDate: "No confirmed date",
  overdue: "Overdue",
  failed: "Failed Delivery",
  deliveredProofRequired: "Delivered — Proof Required",
  waitingWarehouse: "Waiting for warehouse",
  allRegions: "All regions",
  allLogistics: "All logistics",
  noLogistics: "No logistics picked",
  noDeliveryOrder: "No delivery order yet",
  hideFilters: "Hide filters",
  showFilters: "Show filters",
  previousDays: "Previous days",
  nextDays: "Next days",
  clearFilters: "Clear filters",
  openNoConfirmedDate: "Open No confirmed date",
  emptyList: "No delivery scopes",
} as const;

/** Desktop shows six operating days; Sunday is never one of them. */
export const MONITOR_DAYS = 6;

/**
 * `count` consecutive OPERATING days starting at `firstDate`, Sunday omitted.
 *
 * Bare-date arithmetic on `Date.UTC` — which day a delivery appears under is
 * never a timezone question, and this is the one clock-shaped API the file
 * touches without asking what time it is.
 */
export function operatingDaysFrom(firstDate: string, count = MONITOR_DAYS): string[] {
  const [y, m, d] = firstDate.slice(0, 10).split("-").map(Number);
  const out: string[] = [];
  /* The i < 60 guard is a runaway stop, far beyond any real run of Sundays. */
  for (let i = 0; out.length < Math.max(0, Math.trunc(count)) && i < 60; i += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + i));
    if (t.getUTCDay() !== 0) out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/** The operating day strictly BEFORE `dateIso` — Saturday when today is Monday. */
function previousOperatingDay(dateIso: string): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  for (let i = 1; i < 8; i += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - i));
    if (t.getUTCDay() !== 0) return t.toISOString().slice(0, 10);
  }
  return dateIso;
}

/**
 * The default window opens ONE operating day before today: yesterday's
 * deliveries are still being closed out (results, proof), and hiding them
 * would push the operator to the Overdue queue for ordinary morning work.
 */
export function defaultMonitorWindowStart(todayIso: string): string {
  return previousOperatingDay(todayIso);
}

/** Next moves exactly `count` operating days forward. */
export function nextOperatingWindowStart(firstDate: string, count = MONITOR_DAYS): string {
  return operatingDaysFrom(firstDate, count + 1)[count]!;
}

/** Previous moves exactly `count` operating days back — the exact inverse. */
export function previousOperatingWindowStart(firstDate: string, count = MONITOR_DAYS): string {
  let cursor = firstDate;
  for (let i = 0; i < count; i += 1) cursor = previousOperatingDay(cursor);
  return cursor;
}

/** One calendar card / work-list row — a read-only mapping of recorded facts. */
export interface DeliveryMonitorCard {
  /** Stable identity — the scope row's own key (order id, or `id#legN`). */
  scopeId: string;
  orderId: string;
  /** The Journey leg this card is, when the order travels in legs. */
  leg: number | null;
  /** The issued DO row's id — the Delivery Order object's address. */
  deliveryOrderId: string | null;
  doNumber: string | null;
  /** Delivery's confirmed operational date. null = no confirmed date yet. */
  confirmedDate: string | null;
  confirmedTime: string | null;
  /** A narrower arrival, only when the arrangement recorded one. */
  expectedArrival: string | null;
  customerName: string;
  locality: string | null;
  goodsSummary: string;
  logisticsPartnerId: string | null;
  logisticsPartnerName: string | null;
  region: string | null;
  statusKey: DeliveryWorkStatusKind;
  statusLabel: string;
  /**
   * A RECORDED delivery whose photo ledger is known and empty. Derived from
   * facts somebody recorded (the attempt + the T6 ledger) — never from a
   * planned window ending. An UNKNOWN ledger (older payload) claims nothing.
   */
  proofRequired: boolean;
  /** The full scope row behind the card — the work list's own columns and the
   *  governed `Assign logistics` door read it; the calendar card never does. */
  scope: DeliveryScopeRow;
}

/** The source is the workspace's own canonical reads — nothing new is fetched. */
export type DeliveryMonitorSource = ScopeInputs;

/**
 * ONE single-pick WORK TO DO group (owner correction 2026-09-06 — never split
 * into "Delivery Schedule" and "Needs Checking"). `calendar` is the default.
 */
export type MonitorWorkView =
  | "calendar"
  | "no_confirmed_date"
  | "overdue"
  | "failed"
  | "delivered_proof_required"
  | "waiting_warehouse";

export const MONITOR_WORK_VIEWS: readonly MonitorWorkView[] = [
  "calendar",
  "no_confirmed_date",
  "overdue",
  "failed",
  "delivered_proof_required",
  "waiting_warehouse",
];

export const MONITOR_VIEW_LABEL: Record<MonitorWorkView, string> = {
  calendar: MONITOR_COPY.calendar,
  no_confirmed_date: MONITOR_COPY.noConfirmedDate,
  overdue: MONITOR_COPY.overdue,
  failed: MONITOR_COPY.failed,
  delivered_proof_required: MONITOR_COPY.deliveredProofRequired,
  waiting_warehouse: MONITOR_COPY.waitingWarehouse,
};

export interface DeliveryMonitorFilters {
  view: MonitorWorkView;
  region: string | null;
  /** A partner id, `"none"` for scopes nobody carries, or null for all. */
  logisticsPartnerId: string | "none" | null;
  search: string;
  /** Business today — `Overdue` is a question about it, answered here once. */
  todayIso: string;
}

/**
 * THE PROJECTION RULE (owner correction 2026-09-06). Calendar day columns
 * render ONLY for the untouched Calendar view: any operational pick — a work
 * queue, a region, a logistics row — is an operational question, and its
 * answer is the standard selectable work list, never a card wall.
 */
export function isCalendarProjection(filters: DeliveryMonitorFilters): boolean {
  return (
    filters.view === "calendar" &&
    filters.region === null &&
    filters.logisticsPartnerId === null
  );
}

function proofRequiredOf(row: DeliveryScopeRow): boolean {
  if (row.status.kind !== "delivered") return false;
  /* The T6 photo ledger rides the list on the ops_order_control overlay
     (migration 0280). PostgREST may embed it as an object or a one-row array. */
  const control = row.o.ops_order_control;
  const overlay = Array.isArray(control) ? control[0] : control;
  const photos = overlay?.delivery_photos;
  /* `undefined`/`null` means the answer is UNKNOWN — never a missing proof. */
  if (photos === undefined || photos === null) return false;
  return photos.length === 0;
}

/**
 * Every open delivery scope as one card. The rows, the entry rule and the
 * status ladder are `delivery-work.ts`'s — the ONE arithmetic — so Monitor
 * and every other Delivery surface cannot disagree about which scopes exist
 * or where each one stands.
 */
export function buildDeliveryMonitorCards(input: DeliveryMonitorSource): DeliveryMonitorCard[] {
  const rows = buildDeliveryScopeRows(input);
  const doIdByNumber = new Map<string, string>();
  for (const d of input.deliveryOrders) doIdByNumber.set(d.do_number, d.id);

  return rows.map((row): DeliveryMonitorCard => {
    const arrangement: DeliveryArrangementRow | null =
      input.arrangements?.get(`${row.orderId}#${row.leg ?? 0}`) ?? null;
    return {
      scopeId: row.key,
      orderId: row.orderId,
      leg: row.leg,
      deliveryOrderId: row.doNumber ? doIdByNumber.get(row.doNumber) ?? null : null,
      doNumber: row.doNumber,
      confirmedDate: row.confirmedIso,
      confirmedTime: row.confirmedTime,
      expectedArrival: arrangement?.expected_arrival ?? null,
      customerName: row.customer,
      locality: row.location || null,
      goodsSummary: row.goods,
      logisticsPartnerId: row.logisticsId,
      logisticsPartnerName: row.logisticsName,
      region: regionBucketOf(row),
      statusKey: row.status.kind,
      statusLabel: row.status.label,
      proofRequired: proofRequiredOf(row),
      scope: row,
    };
  });
}

/**
 * The one href arithmetic. An issued DO opens the formal Delivery Order; a
 * scope without one opens Edit Delivery — Monitor never issues the document.
 */
export function monitorCardHref(card: DeliveryMonitorCard): string {
  if (card.deliveryOrderId) {
    return `/operation/delivery-orders/${encodeURIComponent(card.deliveryOrderId)}`;
  }
  return `/operation/delivery/edit/${encodeURIComponent(card.orderId)}${
    card.leg != null ? `?leg=${card.leg}` : ""
  }`;
}

/* ── The filters — each one answers, and they COMBINE ──────────────────── */

function matchesView(
  card: DeliveryMonitorCard,
  view: MonitorWorkView,
  todayIso: string,
  visibleDaySet: ReadonlySet<string>,
): boolean {
  switch (view) {
    case "no_confirmed_date":
      return card.confirmedDate === null;
    case "overdue":
      return card.confirmedDate !== null && card.confirmedDate < todayIso;
    case "failed":
      return card.statusKey === "failed";
    case "delivered_proof_required":
      return card.proofRequired;
    case "waiting_warehouse":
      return card.statusKey === "waiting_warehouse";
    default:
      return card.confirmedDate !== null && visibleDaySet.has(card.confirmedDate);
  }
}

function matchesRegion(card: DeliveryMonitorCard, picked: string | null): boolean {
  return picked === null || card.region === picked;
}

function matchesLogisticsPartner(
  card: DeliveryMonitorCard,
  picked: DeliveryMonitorFilters["logisticsPartnerId"],
): boolean {
  if (picked === null) return true;
  if (picked === "none") return card.logisticsPartnerId === null;
  return card.logisticsPartnerId === picked;
}

function matchesSearch(card: DeliveryMonitorCard, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    card.customerName,
    `SO-${card.scope.so}`,
    card.doNumber ?? "",
    card.locality ?? "",
    card.goodsSummary,
    card.logisticsPartnerName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/** The Calendar projection's cards: inside the visible window, plus search. */
export function filterMonitorCalendarCards(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
): DeliveryMonitorCard[] {
  const daySet = new Set(visibleDays);
  return cards.filter(
    (c) =>
      c.confirmedDate !== null &&
      daySet.has(c.confirmedDate) &&
      matchesSearch(c, filters.search),
  );
}

/**
 * The WORK LIST's rows. A work queue is an operational question and answers
 * across ALL dates (a Failed Delivery is usually past-dated; hiding it behind
 * the window would read `0` while the exception is real). The untouched
 * `calendar` view constrains nothing here — a region or logistics pick alone
 * lists every matching open scope.
 */
export function filterMonitorListRows(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
): DeliveryMonitorCard[] {
  const daySet = new Set(visibleDays);
  return cards.filter(
    (c) =>
      (filters.view === "calendar"
        ? true
        : matchesView(c, filters.view, filters.todayIso, daySet)) &&
      matchesRegion(c, filters.region) &&
      matchesLogisticsPartner(c, filters.logisticsPartnerId) &&
      matchesSearch(c, filters.search),
  );
}

/**
 * Each visible day's cards, in reading order: the planned window's start, then
 * the customer (locale-aware), then the stable scope id. Card height never
 * implies duration and no hour axis exists — the order IS the timeline.
 * Every visible day answers, an empty one with an empty list.
 */
export function groupCardsByDay(
  cards: readonly DeliveryMonitorCard[],
  visibleDays: readonly string[],
): Map<string, DeliveryMonitorCard[]> {
  const grouped = new Map<string, DeliveryMonitorCard[]>();
  for (const day of visibleDays) grouped.set(day, []);
  for (const c of cards) {
    if (c.confirmedDate && grouped.has(c.confirmedDate)) grouped.get(c.confirmedDate)!.push(c);
  }
  for (const list of grouped.values()) {
    list.sort(
      (a, b) =>
        /* A card with no agreed window sorts after every agreed one. */
        (a.confirmedTime ?? "￿").localeCompare(b.confirmedTime ?? "￿") ||
        a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" }) ||
        a.scopeId.localeCompare(b.scopeId),
    );
  }
  return grouped;
}

/* ── The calendar's empty range — ONE spanning sentence, never six copies ── */

/**
 * The whole visible range holding nothing prints one spanning state (owner
 * correction 2026-09-06), never the same absence repeated in every column.
 * The caller supplies the printed date strings — `fmt-date.ts` owns spelling.
 */
export function emptyRangeSentence(
  visibleDays: readonly string[],
  fmt: (iso: string) => string,
): string {
  const first = visibleDays[0];
  const last = visibleDays[visibleDays.length - 1];
  if (!first || !last) return "No deliveries are scheduled.";
  return `No deliveries are scheduled from ${fmt(first)} to ${fmt(last)}.`;
}

/** `86 deliveries need a confirmed date.` — printed only from the REAL count. */
export function needConfirmedDateSentence(n: number): string {
  return n === 1
    ? "1 delivery needs a confirmed date."
    : `${n} deliveries need a confirmed date.`;
}

/* ── The active-filter summary above the work list ───────────────────────── */

/**
 * Every active pick, in rail order, so a combined narrowing (86 → 35) is
 * visible above the rows it produced rather than only in a rail row the
 * operator may have scrolled past. Empty = the unfiltered work view.
 */
export function activeFilterLabels(
  filters: DeliveryMonitorFilters,
  partnerNameOf: (id: string) => string | null,
): string[] {
  const out: string[] = [];
  if (filters.view !== "calendar") out.push(MONITOR_VIEW_LABEL[filters.view]);
  if (filters.region !== null) out.push(filters.region);
  if (filters.logisticsPartnerId === "none") out.push(MONITOR_COPY.noLogistics);
  else if (filters.logisticsPartnerId !== null) {
    out.push(partnerNameOf(filters.logisticsPartnerId) ?? filters.logisticsPartnerId);
  }
  return out;
}

/* ── The rail counts — Law D: what clicking each row will actually give ── */

export interface MonitorRailRow {
  key: string;
  label: string;
  count: number;
}

export interface MonitorRails {
  work: Record<MonitorWorkView, number>;
  regions: MonitorRailRow[];
  logistics: MonitorRailRow[];
}

/**
 * Every group's counts are computed over the cards the OTHER groups have
 * already narrowed, so a count is always "what I will get if I click this" —
 * never a number that disagrees with the listing under it.
 *
 * REGION (owner correction 2026-09-06): direct state/jurisdiction names only,
 * derived from the real records — no EAST MALAYSIA / WEST MALAYSIA / SINGAPORE
 * sub-headings, no `Other` bucket, no fixed zero rows. A picked region stays
 * listed at 0 until it is unpicked.
 *
 * LOGISTICS (same correction): only partners genuinely carrying a matching
 * scope (governed roster order first, then others by name), the operator's own
 * pick even at 0, and `No logistics picked` always — it is the bulk-assignment
 * journey's entry.
 */
export function buildMonitorRails(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
  partners: readonly { id: string; name: string }[],
): MonitorRails {
  const daySet = new Set(visibleDays);
  const survives = (c: DeliveryMonitorCard, except: "view" | "region" | "logistics") =>
    (except === "view" ||
      filters.view === "calendar" ||
      matchesView(c, filters.view, filters.todayIso, daySet)) &&
    (except === "region" || matchesRegion(c, filters.region)) &&
    (except === "logistics" || matchesLogisticsPartner(c, filters.logisticsPartnerId)) &&
    matchesSearch(c, filters.search);

  const forWork = cards.filter((c) => survives(c, "view"));
  const forRegion = cards.filter((c) => survives(c, "region"));
  const forLogistics = cards.filter((c) => survives(c, "logistics"));

  /* The Calendar row previews what clicking it shows: the six-day window when
     no other pick holds (the calendar projection), else the full work list. */
  const calendarCount =
    filters.region === null && filters.logisticsPartnerId === null
      ? forWork.filter((c) => c.confirmedDate !== null && daySet.has(c.confirmedDate)).length
      : forWork.length;

  const work: Record<MonitorWorkView, number> = {
    calendar: calendarCount,
    no_confirmed_date: forWork.filter((c) => c.confirmedDate === null).length,
    overdue: forWork.filter(
      (c) => c.confirmedDate !== null && c.confirmedDate < filters.todayIso,
    ).length,
    failed: forWork.filter((c) => c.statusKey === "failed").length,
    delivered_proof_required: forWork.filter((c) => c.proofRequired).length,
    waiting_warehouse: forWork.filter((c) => c.statusKey === "waiting_warehouse").length,
  };

  /* REGION — flat direct names from the data, ordered by count then name. */
  const regionCounts = new Map<string, number>();
  for (const c of forRegion) {
    if (c.region) regionCounts.set(c.region, (regionCounts.get(c.region) ?? 0) + 1);
  }
  /* A PICKED ROW NEVER DISAPPEARS — a chosen region stays listed at 0. */
  if (filters.region && !regionCounts.has(filters.region)) regionCounts.set(filters.region, 0);
  const regions: MonitorRailRow[] = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: key, count }));

  /* LOGISTICS — partners actually carrying a matching scope. The display name
     for an id comes from the partners table first, else from the cards — a raw
     id must never become a rail label. */
  const countByPartnerId = new Map<string, number>();
  const partnerNameById = new Map(partners.map((p) => [p.id, p.name] as const));
  let none = 0;
  for (const c of forLogistics) {
    if (c.logisticsPartnerId === null) none += 1;
    else {
      countByPartnerId.set(
        c.logisticsPartnerId,
        (countByPartnerId.get(c.logisticsPartnerId) ?? 0) + 1,
      );
      if (!partnerNameById.has(c.logisticsPartnerId) && c.logisticsPartnerName) {
        partnerNameById.set(c.logisticsPartnerId, c.logisticsPartnerName);
      }
    }
  }
  const ids = new Set<string>([
    ...countByPartnerId.keys(),
    ...(filters.logisticsPartnerId && filters.logisticsPartnerId !== "none"
      ? [filters.logisticsPartnerId]
      : []),
  ]);
  const rowsById = [...ids].map((id) => ({
    key: id,
    label: partnerNameById.get(id) ?? id,
    count: countByPartnerId.get(id) ?? 0,
  }));
  /* Governed roster order first (NETS · AL · TEOW · TT · EU · SSY · HOUZS),
     then anyone else by name — the ruled reading order, applied only to the
     partners genuinely present. */
  const rank = new Map(GOVERNED_LOGISTICS.map((name, i) => [name, i] as const));
  const logistics = rowsById.sort((a, b) => {
    const ra = rank.get(a.label as (typeof GOVERNED_LOGISTICS)[number]) ?? 99;
    const rb = rank.get(b.label as (typeof GOVERNED_LOGISTICS)[number]) ?? 99;
    return ra - rb || a.label.localeCompare(b.label);
  });
  logistics.push({ key: "none", label: MONITOR_COPY.noLogistics, count: none });

  return { work, regions, logistics };
}
