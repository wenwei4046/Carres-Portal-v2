/**
 * DELIVERY MONITOR — the arithmetic behind the Monitor page.
 * Owner UI corrections 2026-09-06 / 2026-09-07 · `docs/delivery/MASTER.md` §8.
 *
 * PURE. No React, no I/O, no clock of its own — every function that needs
 * "today" is handed it, so the browser, the tests and a CI runner in UTC can
 * never disagree about which day a delivery sits on.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question: *which deliveries are planned, and which record does each one
 * open?* Monitor projects the SAME canonical rows two ways:
 *
 *     Calendar (DEFAULT)     Day · Week · Month in the page toolbar — the
 *                            delivery cards by day, or the month's counts
 *     a work queue picked    the standard selectable work list (DataGrid rows)
 *
 * ⭐ CALENDAR IS A VIEW, NEVER A `WORK TO DO` ROW (owner correction
 * 2026-09-07). `Week` is the desktop default; a rail date or a Month-view
 * date opens that date's `Day`; a phone only ever shows `Day`.
 *
 * The windows, the card mapping, the filters, the rail counts, the month
 * counts and the one href arithmetic all live here, so the rail count and the
 * listing it filters cannot be two different numbers (Architecture Law D).
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It writes nothing and derives no second truth. The rows come from
 * `delivery-work.ts` — the SAME `buildDeliveryScopeRows` entry rule and status
 * ladder — the missing-evidence facts come from the Delivery Orders register's
 * own `missingDeliveryProofOf`, and this file only arranges what those owners
 * already say. A planned window ending proves nothing: no rung of any status
 * reads the clock.
 */

import type { DeliveryWorkStatusKind } from "@carres/shared";
import { DELIVERY_WORK_STATUS_LABEL } from "@carres/shared";
import {
  buildDeliveryScopeRows,
  regionBucketOf,
  GOVERNED_LOGISTICS,
  type DeliveryScopeRow,
  type ScopeInputs,
} from "./delivery-work";
import {
  DOR_COPY,
  missingDeliveryProofOf,
  type MissingDeliveryProof,
} from "./delivery-orders-register";

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD, Delivery section).
 * Reused governed strings keep their governed spelling. `scope` and `leg`
 * never reach an employee's screen (owner correction 2026-09-07).
 */
export const MONITOR_COPY = {
  page: "Monitor",
  docTitle: "Monitor — Carres",
  search: "Search deliveries…",
  /** Owner correction 2026-09-06 — the short per-day absence; the spanning
   *  sentence below owns the fully-empty range. */
  emptyDay: "No deliveries",
  emptyList: "No deliveries",
  emptySearch: "No matching deliveries.",
  loadFailed: "Monitor could not be loaded",
  tryAgain: "Try again",
  railWork: "WORK TO DO",
  railState: "STATE",
  railLogistics: "LOGISTICS PARTNER",
  railStatus: "DELIVERY STATUS",
  allDeliveryWork: "All delivery work",
  noLogistics: "No logistics picked",
  noConfirmedDate: "No confirmed date",
  overdue: "Overdue",
  failed: "Failed Delivery",
  /** Owner correction 2026-09-07 — the queue names the JOB; each row then
   *  names the exact missing file (`DOR_COPY.uploadPhoto` / `uploadSignedDo`). */
  uploadProof: "Upload delivery proof",
  noDeliveryOrder: "No delivery order yet",
  hideFilters: "Hide filters",
  showFilters: "Show filters",
  previousDays: "Previous days",
  nextDays: "Next days",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  clearFilters: "Clear filters",
  openNoConfirmedDate: "Open No confirmed date",
  calendarViews: "Calendar view",
  day: "Day",
  week: "Week",
  month: "Month",
  /** The Month view's compact cell lines — the rail row grammar (label, then
   *  the count) so the operator reads what the rail already taught. */
  cellDeliveries: "Deliveries",
  cellExceptions: "Exceptions",
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
 * THE FIXED OPERATING WEEK (owner correction 2026-09-06) — Monday to Saturday,
 * the six operating days containing `dateIso`. A Sunday input belongs to no
 * operating week and snaps FORWARD to Monday first, the same rule the phone's
 * one-day view has always applied. Windows are week-aligned: the arrows
 * replace the whole displayed work week, never scroll it.
 */
export function operatingWeekOf(dateIso: string): string[] {
  const snapped = operatingDaysFrom(dateIso, 1)[0]!;
  const [y, m, d] = snapped.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const monday = new Date(t);
  monday.setUTCDate(t.getUTCDate() - (t.getUTCDay() - 1));
  const out: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    out.push(day.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * THE TABLET WINDOW — a fixed three-day half of the operating week (Mon–Wed
 * or Thu–Sat), so the window is aligned and finite rather than a horizontal
 * scroll. Previous/next moves three operating days, landing on the other half.
 */
export function tabletWindowOf(dateIso: string): string[] {
  const week = operatingWeekOf(dateIso);
  const snapped = operatingDaysFrom(dateIso, 1)[0]!;
  return week.indexOf(snapped) < 3 ? week.slice(0, 3) : week.slice(3, 6);
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

/* ── THE MONTH (owner correction 2026-09-07) ─────────────────────────────── */

/** Every calendar day of the month containing `dateIso` — Sundays included,
 *  because a delivery recorded on one is a fact the month must still count. */
export function monthDaysOf(dateIso: string): string[] {
  const [y, m] = dateIso.slice(0, 10).split("-").map(Number);
  const out: string[] = [];
  for (let d = 1; d <= 31; d += 1) {
    const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d));
    if (t.getUTCMonth() !== (m ?? 1) - 1) break;
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/** The first OPERATING day of the month `delta` months away — the Month
 *  view's arrows replace the whole displayed month, never scroll it. */
export function monthStepStart(dateIso: string, delta: 1 | -1): string {
  const [y, m] = dateIso.slice(0, 10).split("-").map(Number);
  const first = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + delta, 1));
  return operatingDaysFrom(first.toISOString().slice(0, 10), 1)[0]!;
}

/* ── THE VIEWS ───────────────────────────────────────────────────────────── */

/** The page-toolbar control (owner correction 2026-09-07): `Week` is the
 *  desktop default; a phone only ever shows `Day`. */
export type MonitorCalendarView = "day" | "week" | "month";
export const MONITOR_CALENDAR_VIEWS: readonly MonitorCalendarView[] = ["day", "week", "month"];
export const MONITOR_CALENDAR_VIEW_LABEL: Record<MonitorCalendarView, string> = {
  day: MONITOR_COPY.day,
  week: MONITOR_COPY.week,
  month: MONITOR_COPY.month,
};
export const DEFAULT_CALENDAR_VIEW: MonitorCalendarView = "week";

/**
 * ONE single-pick WORK TO DO group (owner correction 2026-09-06 — never split
 * into "Delivery Schedule" and "Needs Checking"), in the ruled order (owner
 * correction 2026-09-07). `no_logistics` sits here as a PRIMARY work queue —
 * the bulk-assignment journey's entry — and never appears a second time under
 * LOGISTICS PARTNER. `Calendar` and `Waiting for warehouse` are NOT queues:
 * one is a view, the other a DELIVERY STATUS filter.
 */
export type MonitorWorkView =
  | "all"
  | "no_logistics"
  | "no_confirmed_date"
  | "overdue"
  | "failed"
  | "upload_proof";

export const MONITOR_WORK_VIEWS: readonly MonitorWorkView[] = [
  "all",
  "no_logistics",
  "no_confirmed_date",
  "overdue",
  "failed",
  "upload_proof",
];

export const MONITOR_VIEW_LABEL: Record<MonitorWorkView, string> = {
  all: MONITOR_COPY.allDeliveryWork,
  no_logistics: MONITOR_COPY.noLogistics,
  no_confirmed_date: MONITOR_COPY.noConfirmedDate,
  overdue: MONITOR_COPY.overdue,
  failed: MONITOR_COPY.failed,
  upload_proof: MONITOR_COPY.uploadProof,
};

/**
 * The DELIVERY STATUS group (owner correction 2026-09-07) — filters over the
 * shared operational ladder's three "arranged and moving" rungs. Not actions,
 * not document statuses, and never a WORK TO DO queue: `Waiting for warehouse`
 * means Delivery has arranged the trip and Warehouse has not yet recorded
 * `Ready for handover` — it never means missing stock.
 */
export type MonitorDeliveryStatus = "waiting_warehouse" | "ready_for_handover" | "out_for_delivery";
export const MONITOR_STATUS_FILTERS: readonly MonitorDeliveryStatus[] = [
  "waiting_warehouse",
  "ready_for_handover",
  "out_for_delivery",
];
export const MONITOR_STATUS_LABEL: Record<MonitorDeliveryStatus, string> = {
  waiting_warehouse: DELIVERY_WORK_STATUS_LABEL.waiting_warehouse,
  ready_for_handover: DELIVERY_WORK_STATUS_LABEL.ready_for_handover,
  out_for_delivery: DELIVERY_WORK_STATUS_LABEL.out_for_delivery,
};

/** One calendar card / work-list row — a read-only mapping of recorded facts. */
export interface DeliveryMonitorCard {
  /** Stable identity — the row's own key (order id, or `id#legN`). */
  scopeId: string;
  orderId: string;
  /** The Journey leg this card is, when the order travels in legs. Rides the
   *  href only — never printed as a word. */
  leg: number | null;
  /** The issued DO row's id — the Delivery Order object's address. */
  deliveryOrderId: string | null;
  doNumber: string | null;
  /** Delivery's confirmed operational date. null = no confirmed date yet. */
  confirmedDate: string | null;
  confirmedTime: string | null;
  customerName: string;
  /** City and State — `conciseLocality`'s own spelling. */
  locality: string | null;
  goodsSummary: string;
  logisticsPartnerId: string | null;
  logisticsPartnerName: string | null;
  region: string | null;
  statusKey: DeliveryWorkStatusKind;
  statusLabel: string;
  /**
   * The evidence a RECORDED delivered result still lacks — the Delivery
   * Orders register's own arithmetic, never from a planned window ending. Both
   * false for any row whose result has not reached the customer.
   */
  missingProof: MissingDeliveryProof;
  /** The full row behind the card — the work list's own columns and the
   *  governed `Assign logistics` door read it; the calendar card never does. */
  scope: DeliveryScopeRow;
}

/** The source is the workspace's own canonical reads — nothing new is fetched. */
export type DeliveryMonitorSource = ScopeInputs;

export interface DeliveryMonitorFilters {
  /** The picked WORK TO DO queue; null = no queue (the Calendar shows). */
  view: MonitorWorkView | null;
  region: string | null;
  /** A partner id, or null for all. `"none"` survives only for a retired
   *  shared URL — the UI's own unassigned queue is the `no_logistics` view. */
  logisticsPartnerId: string | "none" | null;
  status: MonitorDeliveryStatus | null;
  search: string;
  /** Business today — `Overdue` is a question about it, answered here once. */
  todayIso: string;
}

/**
 * THE PROJECTION RULE. The Calendar renders ONLY while no operational pick
 * holds: a work queue, a STATE row, a LOGISTICS PARTNER row or a DELIVERY
 * STATUS row is an operational question, and its answer is the standard
 * selectable work list, never a card wall.
 */
export function isCalendarProjection(filters: DeliveryMonitorFilters): boolean {
  return (
    filters.view === null &&
    filters.region === null &&
    filters.logisticsPartnerId === null &&
    filters.status === null
  );
}

/** PostgREST may embed a to-one overlay as an object or a one-row array. */
function overlayOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Every open delivery row as one card. The rows, the entry rule and the
 * status ladder are `delivery-work.ts`'s — the ONE arithmetic — so Monitor
 * and every other Delivery surface cannot disagree about which rows exist
 * or where each one stands. The missing-evidence facts are the Delivery
 * Orders register's, read off the SAME document row it reads.
 */
export function buildDeliveryMonitorCards(input: DeliveryMonitorSource): DeliveryMonitorCard[] {
  const rows = buildDeliveryScopeRows(input);
  const docByNumber = new Map(input.deliveryOrders.map((d) => [d.do_number, d] as const));
  /* The LATEST recorded attempt per document — the same "latest" the Delivery
     Orders register reads (newest `recorded_at`). */
  const latestByDo = new Map<string, { result: "delivered" | "partial" | "failed"; at: string }>();
  for (const a of input.attempts) {
    if (!a.do_number) continue;
    const prev = latestByDo.get(a.do_number);
    if (!prev || a.recorded_at > prev.at) {
      latestByDo.set(a.do_number, { result: a.result, at: a.recorded_at });
    }
  }

  return rows.map((row): DeliveryMonitorCard => {
    const doc = row.doNumber ? docByNumber.get(row.doNumber) ?? null : null;
    /* The T6 photo ledger rides the list on the ops_order_control overlay
       (migration 0280) — the order's own embed first (what the workspace
       read carries), the document's embed second. */
    const control =
      overlayOf(row.o.ops_order_control) ?? overlayOf(doc?.orders.ops_order_control ?? null);
    const photos = control?.delivery_photos;
    const missingProof = missingDeliveryProofOf({
      latestResult: doc ? latestByDo.get(doc.do_number)?.result ?? null : null,
      photosPresent: photos === undefined || photos === null ? null : photos.length > 0,
      signedDoPresent: Boolean(doc?.orders.do_file_path),
    });
    return {
      scopeId: row.key,
      orderId: row.orderId,
      leg: row.leg,
      deliveryOrderId: doc?.id ?? null,
      doNumber: row.doNumber,
      confirmedDate: row.confirmedIso,
      confirmedTime: row.confirmedTime,
      customerName: row.customer,
      locality: row.location || null,
      goodsSummary: row.goods,
      logisticsPartnerId: row.logisticsId,
      logisticsPartnerName: row.logisticsName,
      region: regionBucketOf(row),
      statusKey: row.status.kind,
      statusLabel: row.status.label,
      missingProof,
      scope: row,
    };
  });
}
/** A recorded delivered result still owed evidence — the `Upload delivery
 *  proof` queue's one membership test. */
export function needsProof(card: DeliveryMonitorCard): boolean {
  return card.missingProof.photo || card.missingProof.signedDo;
}

/** The exact missing action(s), in the governed words — both when both. */
export function missingProofLabels(card: DeliveryMonitorCard): string[] {
  const out: string[] = [];
  if (card.missingProof.photo) out.push(DOR_COPY.uploadPhoto);
  if (card.missingProof.signedDo) out.push(DOR_COPY.uploadSignedDo);
  return out;
}

/**
 * The one href arithmetic. An issued DO opens the formal Delivery Order; a
 * row without one opens Edit Delivery — Monitor never issues the document.
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

function matchesView(card: DeliveryMonitorCard, view: MonitorWorkView, todayIso: string): boolean {
  switch (view) {
    case "all":
      /* Every open delivery row — the unfiltered selectable listing. */
      return true;
    case "no_logistics":
      /* The bulk-assignment queue: nobody carries this row yet — across ALL
         dates, with or without a DO or a confirmed date. */
      return card.logisticsPartnerId === null;
    case "no_confirmed_date":
      return card.confirmedDate === null;
    case "overdue":
      /* A confirmed date behind us with no delivered result. A recorded
         delivery is never overdue — its remaining work is proof, below. */
      return (
        card.confirmedDate !== null &&
        card.confirmedDate < todayIso &&
        card.statusKey !== "delivered"
      );
    case "failed":
      return card.statusKey === "failed";
    case "upload_proof":
      return needsProof(card);
  }
}

/** The queues that are exceptions — the Month view's `Exceptions` count is
 *  exactly what these three rail rows would list, never a fourth number. */
const EXCEPTION_VIEWS: readonly MonitorWorkView[] = ["overdue", "failed", "upload_proof"];

export function isExceptionCard(card: DeliveryMonitorCard, todayIso: string): boolean {
  return EXCEPTION_VIEWS.some((v) => matchesView(card, v, todayIso));
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

function matchesStatus(card: DeliveryMonitorCard, picked: MonitorDeliveryStatus | null): boolean {
  return picked === null || card.statusKey === picked;
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
 * the window would read `0` while the exception is real). No queue picked
 * constrains nothing here — a state, partner or status pick alone lists every
 * matching open row.
 */
export function filterMonitorListRows(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
): DeliveryMonitorCard[] {
  return cards.filter(
    (c) =>
      (filters.view === null ? true : matchesView(c, filters.view, filters.todayIso)) &&
      matchesRegion(c, filters.region) &&
      matchesLogisticsPartner(c, filters.logisticsPartnerId) &&
      matchesStatus(c, filters.status) &&
      matchesSearch(c, filters.search),
  );
}

/**
 * Each visible day's cards, in reading order: the planned window's start, then
 * the customer (locale-aware), then the stable row id. Card height never
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

/* ── THE MONTH'S COUNTS — compact, never cards (owner correction 2026-09-07) ── */

export interface MonthDayCounts {
  deliveries: number;
  exceptions: number;
  noLogistics: number;
}

/**
 * Per date: how many deliveries are confirmed, how many of them are an
 * exception (the same three exception queues the rail lists) and how many
 * still have no Logistics Partner. Zero everywhere prints nothing.
 */
export function monthDayCounts(
  cards: readonly DeliveryMonitorCard[],
  todayIso: string,
): Map<string, MonthDayCounts> {
  const out = new Map<string, MonthDayCounts>();
  for (const c of cards) {
    if (!c.confirmedDate) continue;
    const cell = out.get(c.confirmedDate) ?? { deliveries: 0, exceptions: 0, noLogistics: 0 };
    cell.deliveries += 1;
    if (isExceptionCard(c, todayIso)) cell.exceptions += 1;
    if (c.logisticsPartnerId === null) cell.noLogistics += 1;
    out.set(c.confirmedDate, cell);
  }
  return out;
}

/** The month cell's aria sentence — the same three facts, in words. */
export function monthDaySentence(dateLabel: string, counts: MonthDayCounts | undefined): string {
  if (!counts || counts.deliveries === 0) return `${dateLabel} — ${MONITOR_COPY.emptyDay}`;
  const parts = [
    `${counts.deliveries} ${counts.deliveries === 1 ? "delivery" : "deliveries"}`,
  ];
  if (counts.exceptions > 0) {
    parts.push(`${counts.exceptions} ${counts.exceptions === 1 ? "exception" : "exceptions"}`);
  }
  if (counts.noLogistics > 0) parts.push(`${counts.noLogistics} ${MONITOR_COPY.noLogistics}`);
  return `${dateLabel} — ${parts.join(" · ")}`;
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

/** The work list's footer — it counts deliveries (a Journey leg is its own
 *  delivery), never `scopes` and never orders (owner correction 2026-09-07). */
export function deliveriesFooter(shown: number, total: number): string {
  const word = total === 1 ? "delivery" : "deliveries";
  return shown === total ? `${shown} ${word}` : `${shown} of ${total} ${word}`;
}

/** The selection toolbar's count — no invented unit word (COPY-STANDARD,
 *  owner correction 2026-09-07). */
export function selectedSentence(n: number): string {
  return `${n} selected`;
}

/* ── The active-filter summary above the work list ───────────────────────── */

/**
 * Every active pick, in rail order, so a combined narrowing (86 → 35) is
 * visible above the rows it produced rather than only in a rail row the
 * operator may have scrolled past. Empty = nothing picked. `All delivery
 * work` is a queue like any other and prints, so the way back to the
 * Calendar (`Clear filters`) is always on screen.
 */
export function activeFilterLabels(
  filters: DeliveryMonitorFilters,
  partnerNameOf: (id: string) => string | null,
): string[] {
  const out: string[] = [];
  if (filters.view !== null) out.push(MONITOR_VIEW_LABEL[filters.view]);
  if (filters.region !== null) out.push(filters.region);
  if (filters.logisticsPartnerId === "none") out.push(MONITOR_COPY.noLogistics);
  else if (filters.logisticsPartnerId !== null) {
    out.push(partnerNameOf(filters.logisticsPartnerId) ?? filters.logisticsPartnerId);
  }
  if (filters.status !== null) out.push(MONITOR_STATUS_LABEL[filters.status]);
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
  status: Record<MonitorDeliveryStatus, number>;
}

/**
 * Every group's counts are computed over the cards the OTHER groups have
 * already narrowed, so a count is always "what I will get if I click this" —
 * never a number that disagrees with the listing under it.
 *
 * STATE: direct state/jurisdiction names only, derived from the real records
 * — no EAST MALAYSIA / WEST MALAYSIA / SINGAPORE sub-headings, no `Other`
 * bucket, no fixed zero rows. A picked state stays listed at 0 until unpicked.
 *
 * LOGISTICS PARTNER: only the governed partners genuinely carrying a matching
 * row (governed roster order first, then others by name), and the operator's
 * own pick even at 0. `No logistics picked` lives in WORK TO DO as a primary
 * queue and is never duplicated here.
 *
 * DELIVERY STATUS: the three fixed rungs, live counts, zero printed.
 */
export function buildMonitorRails(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  partners: readonly { id: string; name: string }[],
): MonitorRails {
  const survives = (
    c: DeliveryMonitorCard,
    except: "view" | "region" | "logistics" | "status",
  ) =>
    (except === "view" ||
      filters.view === null ||
      matchesView(c, filters.view, filters.todayIso)) &&
    (except === "region" || matchesRegion(c, filters.region)) &&
    (except === "logistics" || matchesLogisticsPartner(c, filters.logisticsPartnerId)) &&
    (except === "status" || matchesStatus(c, filters.status)) &&
    matchesSearch(c, filters.search);

  const forWork = cards.filter((c) => survives(c, "view"));
  const forRegion = cards.filter((c) => survives(c, "region"));
  const forLogistics = cards.filter((c) => survives(c, "logistics"));
  const forStatus = cards.filter((c) => survives(c, "status"));

  const work = Object.fromEntries(
    MONITOR_WORK_VIEWS.map((v) => [
      v,
      forWork.filter((c) => matchesView(c, v, filters.todayIso)).length,
    ]),
  ) as Record<MonitorWorkView, number>;

  /* STATE — flat direct names from the data, ordered by count then name. */
  const regionCounts = new Map<string, number>();
  for (const c of forRegion) {
    if (c.region) regionCounts.set(c.region, (regionCounts.get(c.region) ?? 0) + 1);
  }
  /* A PICKED ROW NEVER DISAPPEARS — a chosen state stays listed at 0. */
  if (filters.region && !regionCounts.has(filters.region)) regionCounts.set(filters.region, 0);
  const regions: MonitorRailRow[] = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: key, count }));

  /* LOGISTICS PARTNER — partners actually carrying a matching row. The display
     name for an id comes from the partners table first, else from the cards —
     a raw id must never become a rail label. */
  const countByPartnerId = new Map<string, number>();
  const partnerNameById = new Map(partners.map((p) => [p.id, p.name] as const));
  for (const c of forLogistics) {
    if (c.logisticsPartnerId === null) continue;
    countByPartnerId.set(
      c.logisticsPartnerId,
      (countByPartnerId.get(c.logisticsPartnerId) ?? 0) + 1,
    );
    if (!partnerNameById.has(c.logisticsPartnerId) && c.logisticsPartnerName) {
      partnerNameById.set(c.logisticsPartnerId, c.logisticsPartnerName);
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

  const status = Object.fromEntries(
    MONITOR_STATUS_FILTERS.map((s) => [s, forStatus.filter((c) => c.statusKey === s).length]),
  ) as Record<MonitorDeliveryStatus, number>;

  return { work, regions, logistics, status };
}
