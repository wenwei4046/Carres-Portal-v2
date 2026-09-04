/**
 * DELIVERY MONITOR — the calendar arithmetic behind the Monitor page.
 * `CARD-2026-09-04-delivery-01-monitor-calendar` · `docs/delivery/MASTER.md`.
 *
 * PURE. No React, no I/O, no clock of its own — every function that needs
 * "today" is handed it, so the browser, the tests and a CI runner in UTC can
 * never disagree about which day a delivery sits on.
 *
 * ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
 *
 * ONE question: *which deliveries are planned across the visible operating
 * days, and which existing record does each one open?* The six-day window, the
 * card mapping, the filters, the rail counts and the one href arithmetic all
 * live here, so the rail count and the calendar it filters cannot be two
 * different numbers (Architecture Law D).
 *
 * ── WHAT IT DELIBERATELY DOES NOT OWN ───────────────────────────────────────
 *
 * It writes nothing and derives no second truth. The scope rows come from
 * `delivery-work.ts` — the SAME `buildDeliveryScopeRows` the planning
 * workspace runs, entry rule and status ladder included — and this file only
 * arranges what those owners already say. A planned window ending proves
 * nothing: no rung of any status here reads the clock.
 *
 * ── MONITOR IS A DISPLAY, NEVER A WRITER ────────────────────────────────────
 *
 * Every card is one read-only door: an issued DO opens the Delivery Order
 * object; a scope without one opens Edit Delivery. Monitor never issues,
 * assigns, uploads or reschedules — the governed writers own those acts.
 */

import type { DeliveryArrangementRow } from "@carres/shared";
import type { DeliveryWorkStatusKind } from "@carres/shared";
import {
  buildDeliveryScopeRows,
  regionBucketOf,
  DW,
  EAST_MALAYSIA_STATES,
  GOVERNED_LOGISTICS,
  SINGAPORE_KEY,
  type DeliveryScopeRow,
  type ScopeInputs,
} from "./delivery-work";

/**
 * ⭐ EVERY VISIBLE WORD, IN ONE PLACE (COPY-STANDARD).
 *
 * Reused governed strings keep their governed spelling; the strings this Card
 * proposes (`Monitor` · `Calendar` · `No deliveries` · `NEEDS CHECKING` ·
 * `Delivered — Proof Required`) are registered as PROPOSAL copy in
 * `docs/COPY-STANDARD.md` until the owner accepts them.
 */
export const MONITOR_COPY = {
  page: "Monitor",
  docTitle: "Monitor — Carres",
  search: "Search deliveries…",
  /** T10's governed empty-day sentence — the Card proposed `No deliveries`,
   *  but the dictionary already owns this exact concept and a second spelling
   *  for one fact is the synonym the rules forbid. */
  emptyDay: "No deliveries booked this day.",
  loadFailed: "Monitor could not be loaded",
  tryAgain: "Try again",
  railSchedule: "DELIVERY SCHEDULE",
  railChecking: "NEEDS CHECKING",
  railRegion: "REGION",
  railLogistics: "LOGISTICS",
  calendar: "Calendar",
  noConfirmedDate: "No confirmed date",
  overdue: "Overdue",
  failed: "Failed Delivery",
  deliveredProofRequired: "Delivered — Proof Required",
  waitingWarehouse: "Waiting for warehouse",
  noLogistics: "No logistics picked",
  noDeliveryOrder: "No delivery order yet",
  hideFilters: "Hide filters",
  showFilters: "Show filters",
  previousDays: "Previous days",
  nextDays: "Next days",
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
 * On Friday 4 Sep the range is Thu 3 – Wed 9 (the Card's fixture).
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

/** One calendar card — a read-only mapping of facts other owners recorded. */
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
}

/** The source is the workspace's own canonical reads — nothing new is fetched. */
export type DeliveryMonitorSource = ScopeInputs;

export interface DeliveryMonitorFilters {
  schedule: "calendar" | "no_confirmed_date" | "overdue";
  checking: "failed" | "delivered_proof_required" | "waiting_warehouse" | null;
  region: string | null;
  /** A partner id, `"none"` for scopes nobody carries, or null for all. */
  logisticsPartnerId: string | "none" | null;
  search: string;
  /** Business today — `Overdue` is a question about it, answered here once. */
  todayIso: string;
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
 * Every open delivery scope as one calendar card. The rows, the entry rule and
 * the status ladder are `delivery-work.ts`'s — the ONE arithmetic the planning
 * workspace already runs — so Monitor and the workspace cannot disagree about
 * which scopes exist or where each one stands.
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

function matchesSchedule(
  card: DeliveryMonitorCard,
  schedule: DeliveryMonitorFilters["schedule"],
  todayIso: string,
  visibleDaySet: ReadonlySet<string>,
): boolean {
  switch (schedule) {
    case "no_confirmed_date":
      return card.confirmedDate === null;
    case "overdue":
      return card.confirmedDate !== null && card.confirmedDate < todayIso;
    default:
      return card.confirmedDate !== null && visibleDaySet.has(card.confirmedDate);
  }
}

function matchesChecking(
  card: DeliveryMonitorCard,
  checking: DeliveryMonitorFilters["checking"],
): boolean {
  switch (checking) {
    case null:
      return true;
    case "failed":
      return card.statusKey === "failed";
    case "delivered_proof_required":
      return card.proofRequired;
    case "waiting_warehouse":
      return card.statusKey === "waiting_warehouse";
  }
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
    card.doNumber ?? "",
    card.locality ?? "",
    card.goodsSummary,
    card.logisticsPartnerName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/**
 * DELIVERY SCHEDULE and NEEDS CHECKING are two views of ONE pick. An exception
 * queue is not a calendar question — a Failed Delivery is usually PAST-dated,
 * and composing it with the visible window would read `0` while the exception
 * sits one rail group up. So a picked checking row answers across ALL dates,
 * and the schedule applies only while no checking row is picked.
 */
export function filterDeliveryMonitorCards(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
): DeliveryMonitorCard[] {
  const daySet = new Set(visibleDays);
  return cards.filter(
    (c) =>
      (filters.checking !== null
        ? matchesChecking(c, filters.checking)
        : matchesSchedule(c, filters.schedule, filters.todayIso, daySet)) &&
      (filters.region === null || c.region === filters.region) &&
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

/* ── The rail counts — Law D: what clicking each row will actually give ── */

export interface MonitorRailRow {
  key: string;
  label: string;
  count: number;
  /** A non-clickable sub-heading row (REGION's `EAST MALAYSIA` / `SINGAPORE`,
   *  owner ruling 2026-09-01). It filters nothing and counts nothing. */
  heading?: boolean;
}

export interface MonitorRails {
  schedule: { calendar: number; noConfirmedDate: number; overdue: number };
  checking: { failed: number; deliveredProofRequired: number; waitingWarehouse: number };
  regions: MonitorRailRow[];
  logistics: MonitorRailRow[];
}

/**
 * Every group's counts are computed over the cards the OTHER groups have
 * already narrowed, so a count is always "what I will get if I click this" —
 * never a number that disagrees with the calendar under it.
 */
export function buildMonitorRails(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
  partners: readonly { id: string; name: string }[],
): MonitorRails {
  const daySet = new Set(visibleDays);
  const survives = (
    c: DeliveryMonitorCard,
    except: "schedule" | "checking" | "region" | "logistics",
  ) =>
    /* Schedule and checking are ONE pick (see filterDeliveryMonitorCards), so
       either group's own counts exclude BOTH — a count is what clicking that
       row will actually show, and clicking it replaces the other group's pick. */
    (except === "schedule" ||
      except === "checking" ||
      (filters.checking !== null
        ? matchesChecking(c, filters.checking)
        : matchesSchedule(c, filters.schedule, filters.todayIso, daySet))) &&
    (except === "region" || filters.region === null || c.region === filters.region) &&
    (except === "logistics" || matchesLogisticsPartner(c, filters.logisticsPartnerId)) &&
    matchesSearch(c, filters.search);

  const forSchedule = cards.filter((c) => survives(c, "schedule"));
  const forChecking = cards.filter((c) => survives(c, "checking"));
  const forRegion = cards.filter((c) => survives(c, "region"));
  const forLogistics = cards.filter((c) => survives(c, "logistics"));

  /* REGION keeps the workspace rail's OWN ruled grammar (owner ruling
     2026-09-01): Peninsular states by their own names ordered by count,
     then the fixed EAST MALAYSIA sub-heading with Sabah and Sarawak always
     visible (Labuan only while it holds one), then the fixed SINGAPORE
     sub-heading with Singapore always visible. */
  const regionCounts = new Map<string, number>();
  for (const c of forRegion) {
    if (c.region) regionCounts.set(c.region, (regionCounts.get(c.region) ?? 0) + 1);
  }
  /* A PICKED ROW NEVER DISAPPEARS — a chosen region stays listed at 0. */
  if (filters.region && !regionCounts.has(filters.region)) regionCounts.set(filters.region, 0);
  const east = new Set<string>(EAST_MALAYSIA_STATES);
  const regions: MonitorRailRow[] = [...regionCounts.entries()]
    .filter(([key]) => key !== SINGAPORE_KEY && !east.has(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: key, count }));
  regions.push({ key: "__east__", label: DW.railEastMalaysia, count: 0, heading: true });
  for (const s of EAST_MALAYSIA_STATES) {
    if (s === "Labuan" && !(regionCounts.get(s) ?? 0) && filters.region !== s) continue;
    regions.push({ key: s, label: s, count: regionCounts.get(s) ?? 0 });
  }
  regions.push({ key: "__sg__", label: DW.railSingapore, count: 0, heading: true });
  regions.push({
    key: SINGAPORE_KEY,
    label: SINGAPORE_KEY,
    count: regionCounts.get(SINGAPORE_KEY) ?? 0,
  });

  /* LOGISTICS — the governed roster is ALWAYS visible, count or no count (the
     workspace's own law); an ungoverned partner joins only while it carries a
     card or is the operator's own pick. `No logistics picked` closes the list. */
  const countByPartnerId = new Map<string, number>();
  /* The display name for an id comes from the partners table first, else from
     the cards themselves — a Journey leg can carry a partner the table read
     has not returned, and a raw id must never become a rail label. */
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
  const partnerIdByName = new Map(
    [...partnerNameById.entries()].map(([id, name]) => [name, id] as const),
  );
  const governedNames = new Set<string>(GOVERNED_LOGISTICS);
  /* The governed roster matches by NAME: whichever id carries that partner's
     cards is the row's key, so clicking it filters to those exact cards. */
  const logistics: MonitorRailRow[] = GOVERNED_LOGISTICS.map((name) => {
    const id = partnerIdByName.get(name) ?? name;
    return { key: id, label: name, count: countByPartnerId.get(id) ?? 0 };
  });
  const extraIds = new Set<string>([
    ...countByPartnerId.keys(),
    ...(filters.logisticsPartnerId && filters.logisticsPartnerId !== "none"
      ? [filters.logisticsPartnerId]
      : []),
  ]);
  for (const row of logistics) extraIds.delete(row.key);
  const extras = [...extraIds]
    .map((id) => ({
      key: id,
      label: partnerNameById.get(id) ?? id,
      count: countByPartnerId.get(id) ?? 0,
    }))
    .filter((r) => !governedNames.has(r.label))
    .sort((a, b) => a.label.localeCompare(b.label));
  logistics.push(...extras);
  logistics.push({ key: "none", label: MONITOR_COPY.noLogistics, count: none });

  return {
    schedule: {
      calendar: forSchedule.filter(
        (c) => c.confirmedDate !== null && daySet.has(c.confirmedDate),
      ).length,
      noConfirmedDate: forSchedule.filter((c) => c.confirmedDate === null).length,
      overdue: forSchedule.filter(
        (c) => c.confirmedDate !== null && c.confirmedDate < filters.todayIso,
      ).length,
    },
    checking: {
      failed: forChecking.filter((c) => c.statusKey === "failed").length,
      deliveredProofRequired: forChecking.filter((c) => c.proofRequired).length,
      waitingWarehouse: forChecking.filter((c) => c.statusKey === "waiting_warehouse").length,
    },
    regions,
    logistics,
  };
}
