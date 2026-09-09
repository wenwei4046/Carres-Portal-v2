/**
 * DELIVERY MONITOR — planning calendar + selectable operational work lists.
 * Owner UI corrections 2026-09-06 / 2026-09-07 · `docs/delivery/MASTER.md` §8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ TWO PROJECTIONS OF ONE CANONICAL READ
 *
 * ```
 * Calendar (DEFAULT)   Day · Week · Month in the page toolbar — delivery cards
 *                      by day, or the month's compact counts; NO checkboxes
 * a work queue picked  the standard selectable DataGrid work list
 * ```
 *
 * ⭐ CALENDAR IS A VIEW, NEVER A `WORK TO DO` ROW (owner correction
 * 2026-09-07). `Week` is the desktop default (six Mon–Sat columns fitting the
 * width — no horizontal date scrolling), a tablet's Week is the fixed
 * three-day half-week, a phone is only ever the `Day` list. A rail date or a
 * Month-view date opens that date's `Day`. Choosing Day/Week/Month clears
 * every operational pick so the Calendar actually appears.
 *
 * A work queue (`All delivery work` · `No logistics picked` · `No confirmed
 * date` · `Overdue` · `Failed Delivery` · `Upload delivery proof`), a STATE
 * row, a LOGISTICS PARTNER row or a DELIVERY STATUS row is an operational
 * question, and its answer is the same Register grammar every other module
 * answers with — never a card wall.
 *
 * ⭐ BULK LOGISTICS ASSIGNMENT LIVES HERE (owner correction 2026-09-06).
 * The planning population includes deliveries that have no formal DO yet,
 * so the journey `No logistics picked → select rows → Assign logistics` runs
 * on Monitor's work list, through the ONE governed door
 * (`AssignLogisticsDialog` → `/delivery-arrangements/assign`). Replacing an
 * existing partner is the governed `Change logistics` act (reason + history)
 * and is offered for ONE row at a time — never as an uncontrolled batch.
 *
 * ⭐ THE RAIL IS THE SHARED FilterRail GRAMMAR (240px, page-owned, never the
 * Portal sidebar), with the COMPLETE MONTH CALENDAR fixed at its top: month
 * arrows move one month, the selected date wears the governed blue, today
 * stays distinguishable, Sundays are muted, work days carry a dot, and the
 * four filter groups (WORK TO DO · STATE · LOGISTICS PARTNER · DELIVERY
 * STATUS) scroll independently BELOW it.
 *
 * ── THE WINDOWS ─────────────────────────────────────────────────────────────
 * One `?date=` drives every window — the Day, the desktop's Mon–Sat operating
 * week, the tablet's three-day half-week, the Month, the phone's one-day list
 * (its full month opens through the kit's standard date control). Arrows
 * replace the whole displayed window; the calendar never scrolls sideways.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import type { DeliveryWorkStatusKind, OrderActionTone } from "@carres/shared";
import { fmtDate, fmtMonth, appTodayIso } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import {
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useDeliveryArrangements,
  useOperationOrders,
  useSalesOrderExpansion,
  type DeliveryArrangementRow,
} from "@/lib/queries";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import AssignLogisticsDialog from "./components/AssignLogisticsDialog";
import { lineName } from "./sales-order-facts";
import { requestedDeliveryText } from "./sales-order-columns";
import { DATE_TO_BE_CONFIRMED_FULL } from "./sales-order-guidance";
import { DW, type DeliveryScopeRow } from "./delivery-work";
import Segmented from "@/components/Segmented";
import {
  DEFAULT_CALENDAR_VIEW,
  MONITOR_CALENDAR_VIEWS,
  MONITOR_CALENDAR_VIEW_LABEL,
  MONITOR_COLUMN,
  MONITOR_COPY,
  MONITOR_DAYS,
  MONITOR_STATUS_FILTERS,
  MONITOR_STATUS_LABEL,
  MONITOR_VIEW_LABEL,
  MONITOR_WORK_VIEWS,
  activeFilterLabels,
  buildDeliveryMonitorCards,
  buildMonitorRails,
  deliveriesFooter,
  emptyRangeSentence,
  filterMonitorCalendarCards,
  filterMonitorListRows,
  groupCardsByDay,
  isCalendarProjection,
  matchesMonitorSearch,
  missingProofLabels,
  monitorCardHref,
  monitorRowAction,
  monitorRowActionText,
  monthDayCounts,
  monthDaysOf,
  monthStepStart,
  needConfirmedDateSentence,
  nextOperatingWindowStart,
  operatingDaysFrom,
  operatingWeekOf,
  previousOperatingWindowStart,
  selectedSentence,
  tabletWindowOf,
  type DeliveryMonitorCard,
  type DeliveryMonitorFilters,
  type MonitorCalendarView,
  type MonitorDeliveryStatus,
  type MonitorWorkView,
} from "./delivery-monitor";
import MonitorMonthCalendar from "./components/MonitorMonthCalendar";
import MonitorMonthView from "./components/MonitorMonthView";
import DatePicker from "@/components/kit/DatePicker";

/** The two governed action words on this workspace (COPY-STANDARD). */
const ASSIGN_LOGISTICS = "Assign logistics";
const CHANGE_LOGISTICS = "Change logistics";
const EDIT_DELIVERY = "Edit Delivery";

/** The rail-collapse memory (LOCAL FILTER RAIL COLLAPSE law). */
const FILTER_RAIL_STORAGE_KEY = "carres.deliveryMonitor.filterRail";
/* v3 — the 2026-09-09 chase correction changed the DEFAULT column order and
   added `Actions`. A persisted `order` array wins over the default, so a key
   that kept its name would have shown the old sheet to every operator who had
   ever opened this page. */
const WORK_LIST_STORAGE_KEY = "carres.deliveryMonitor.workList.v3";

/**
 * The OPERATIONAL ladder's tones (owner ruling 2026-08-24): waiting is the
 * normal state of most rows, so only a recorded exception spends the
 * attention colour.
 */
const STATUS_TONE: Record<DeliveryWorkStatusKind, OrderActionTone> = {
  waiting_customer_date: "neutral",
  confirmed: "info",
  waiting_warehouse: "neutral",
  ready_for_handover: "info",
  out_for_delivery: "info",
  delivered: "success",
  failed: "warning",
};

/**
 * THE THREE FIXED WINDOWS (owner correction 2026-09-06). The calendar never
 * scrolls horizontally; the viewport picks a FINITE window instead:
 *
 *   phone   < 768px   one operating day (list), full month via the kit's
 *                     standard date control
 *   tablet  < 1280px  a fixed three-day half of the operating week
 *   desktop ≥ 1280px  the fixed six-day operating week, fitting its width
 */
const PHONE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1280;

type ViewportMode = "phone" | "tablet" | "desktop";

function useViewportMode(): ViewportMode {
  const phoneQuery = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;
  const tabletQuery = `(max-width: ${TABLET_BREAKPOINT - 1}px)`;
  const read = (): ViewportMode => {
    if (typeof window === "undefined") return "desktop";
    if (window.matchMedia(phoneQuery).matches) return "phone";
    if (window.matchMedia(tabletQuery).matches) return "tablet";
    return "desktop";
  };
  const [mode, setMode] = useState<ViewportMode>(read);
  useEffect(() => {
    const phone = window.matchMedia(phoneQuery);
    const tablet = window.matchMedia(tabletQuery);
    const onChange = () => setMode(read());
    phone.addEventListener("change", onChange);
    tablet.addEventListener("change", onChange);
    return () => {
      phone.removeEventListener("change", onChange);
      tablet.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneQuery, tabletQuery]);
  return mode;
}

/** This workspace's row, through the portal's ONE `Requested Delivery Date`
 *  spelling — Sales Orders owns the date, and every reader prints it the
 *  same way. */
function requestedText(r: DeliveryMonitorCard): string {
  return requestedDeliveryText({
    iso: r.scope.customerDeliveryIso,
    tbd: r.scope.customerDateTbd,
  });
}

/** ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15. */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * ONE CARD, ONE LINK. No nested button, no competing click target: the card
 * IS the door, and where it opens is the module's one href arithmetic.
 * Calendar cards carry NO checkbox and take no batch selection. A card shows
 * ONLY (owner correction 2026-09-07): confirmed time · DO No or `No delivery
 * order yet` · Customer · City and State · Goods summary · Logistics Partner ·
 * Delivery Status. A recorded result stays `Delivered` — the missing evidence
 * is the `Upload delivery proof` queue's job, never a second status word.
 */
function MonitorCard({ card }: { card: DeliveryMonitorCard }) {
  return (
    <Link
      to={monitorCardHref(card)}
      data-testid={`delivery-monitor-card-${card.scopeId}`}
      className="block min-h-11 rounded-control border border-kit-slate-5 bg-white shadow-sm hover:border-kit-slate-6 hover:bg-hovertint"
    >
      <div className="flex flex-col gap-0.5 px-2 py-1.5 text-body">
        {card.confirmedTime ? (
          <div className="font-medium text-kit-slate-12">{card.confirmedTime}</div>
        ) : null}
        {card.doNumber ? (
          <div className="font-mono font-medium text-blue-700">{card.doNumber}</div>
        ) : (
          /* The absence is a stage, not a missing click — the governed gate
             issues the document; this card only explains today's door. */
          <div className="text-kit-slate-9">{MONITOR_COPY.noDeliveryOrder}</div>
        )}
        <div className="truncate font-medium" title={card.customerName}>
          {card.customerName}
        </div>
        {card.locality ? (
          <div className="truncate text-kit-slate-11" title={card.locality}>
            {card.locality}
          </div>
        ) : null}
        <div className="truncate text-kit-slate-11" title={card.goodsSummary}>
          {card.goodsSummary}
        </div>
        {card.logisticsPartnerName ? (
          <div className="text-kit-slate-12">{card.logisticsPartnerName}</div>
        ) : null}
      </div>
      <div className="border-t border-kit-slate-4 px-2 py-1">
        <StatusPill tone={STATUS_TONE[card.statusKey]}>{card.statusLabel}</StatusPill>
      </div>
    </Link>
  );
}

/**
 * ⭐ THE PHONE'S WORK LIST — a readable list, never the desktop sheet squeezed.
 *
 * A work queue on a phone answers the same question it answers on a desk, and
 * the operator standing in a warehouse chasing a carrier must see, WITHOUT
 * opening a Columns chooser: what the customer asked for, whether anyone has
 * agreed a day, who carries it, and the one thing to do next. Those four
 * facts are the card; everything else the sheet offers is a desk job.
 *
 * The words, the absences and the act are the SAME ones the DataGrid prints —
 * `monitorRowAction` and the governed absence strings — so the two viewports
 * can never tell an operator two different things.
 */
function MonitorWorkCard({
  card,
  onAssign,
  onEdit,
  onOpenOrder,
}: {
  card: DeliveryMonitorCard;
  onAssign: (card: DeliveryMonitorCard) => void;
  onEdit: (card: DeliveryMonitorCard) => void;
  onOpenOrder: (card: DeliveryMonitorCard) => void;
}) {
  const action = monitorRowAction(card);
  /* The SAME words the sheet prints — the phone never spells a date twice. */
  const requested = requestedText(card);
  const confirmed = card.confirmedDate ? fmtDate(card.confirmedDate) : DW.noConfirmedDate;
  const row = (label: string, value: string, muted: boolean) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-label text-kit-slate-11">{label}</span>
      <span
        className={`min-w-0 truncate text-body ${muted ? "text-kit-slate-9" : "text-kit-slate-12"}`}
        {...(muted ? { "data-absence": "true" } : {})}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div
      className="rounded-control border border-kit-slate-5 bg-white shadow-sm"
      data-testid={`delivery-monitor-work-card-${card.scopeId}`}
    >
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            className="shrink-0 font-mono font-medium text-blue-700 underline-offset-2"
            onClick={() => onOpenOrder(card)}
          >
            SO-{card.scope.so}
          </button>
          <span className="min-w-0 truncate font-medium text-kit-slate-12">
            {card.customerName}
          </span>
        </div>
        {row(MONITOR_COLUMN.requestedDelivery, requested, !card.scope.customerDeliveryIso)}
        {row(MONITOR_COLUMN.confirmedDelivery, confirmed, card.confirmedDate === null)}
        {row(
          MONITOR_COLUMN.logisticsPartner,
          card.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
          card.logisticsPartnerName === null,
        )}
      </div>
      <div className="flex flex-col gap-1 border-t border-kit-slate-4 px-2.5 py-2">
        {action.kind === "confirm_date" ? (
          <span className="text-body text-kit-slate-12">{action.call}</span>
        ) : null}
        <button
          type="button"
          className="min-h-11 rounded-control border border-kit-slate-6 bg-white px-3 text-body font-medium text-kit-slate-12"
          data-testid={`delivery-monitor-action-${action.kind}-${card.scopeId}`}
          onClick={() =>
            action.kind === "assign_logistics" ? onAssign(card) : onEdit(card)
          }
        >
          {action.label}
        </button>
      </div>
    </div>
  );
}

/**
 * ▸ HAS EXACTLY ONE JOB (owner correction 2026-09-06): this scope's goods
 * lines, read-only — the shared `GoodsMiniTable`, nothing else. Its own
 * component because the Unit facts are their own query and a hook cannot be
 * called inside a render callback.
 */
function ScopeExpansion({ row }: { row: DeliveryScopeRow }) {
  const expansion = useSalesOrderExpansion(row.orderId);
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));

  const miniLines: GoodsMiniLine[] = [
    ...lines.map((line, index): GoodsMiniLine => {
      const fact = factsByLine.get(line.id ?? "");
      return {
        key: line.id ?? `${line.sku}-${index}`,
        testId: `delivery-good-${line.sku}`,
        category: goodsCategoryOf(line),
        unitIds: fact?.unitIds ?? [],
        unitAbsence: "Not allocated",
        deliverTo: (fact?.deliverTo ?? []).map((d) =>
          (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
        ),
        deliverToAbsence: expansion.isLoading ? "Loading…" : DW.notRecorded,
        sku: line.sku,
        qty: line.qty,
        item: lineName(line),
        selectable: true,
      };
    }),
    /* A Service moves no goods and allocates no Unit — the dash is the shipped
       ruling for that cell, not an invented word. */
    ...addons.map((addon, index): GoodsMiniLine => ({
      key: `addon-${index}`,
      category: "Service",
      unitIds: [],
      unitAbsence: "—",
      deliverTo: [],
      deliverToAbsence: "—",
      sku: addon.addon_key ?? "",
      qty: addon.qty,
      item: addon.addon_key?.replace(/[_-]+/g, " ") ?? "Add-on",
      selectable: false,
    })),
  ];

  return (
    <div data-testid="delivery-scope-expansion">
      {miniLines.length === 0 ? (
        <div className="px-2 py-2 text-body text-kit-slate-11">{DW.noGoods}</div>
      ) : (
        <GoodsMiniTable label={`Goods on SO-${row.so}`} lines={miniLines} />
      )}
    </div>
  );
}

export default function OperationDelivery() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  const today = appTodayIso();
  const viewport = useViewportMode();
  const isPhone = viewport === "phone";

  /* The rail-collapse memory — the browser remembers open/closed (ui MASTER,
     LOCAL FILTER RAIL COLLAPSE). On a phone the rail starts closed: the
     drawer opens on demand and never squeezes the one-day list. */
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    try {
      return localStorage.getItem(FILTER_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage may be unavailable; the live state still works. */
    }
  };
  /* The phone drawer opens on demand only — it overlays the one-day list and
     never squeezes it, so the persistent desktop choice is not consulted. */
  const [phoneRailOverride, setPhoneRailOverride] = useState(false);
  const railVisible = isPhone ? phoneRailOverride : filterRailOpen;

  /* ── THE URL IS THE STATE ──────────────────────────────────────────────── */
  /* ONE selected date (`?date=`) drives every window: the phone's day, the
     tablet's three-day half-week, the desktop's fixed operating week — and
     the rail calendar's blue selection. The retired `?start=`/`?day=`
     spellings still resolve so an old shared URL keeps answering. A Sunday
     lands on the next operating day rather than an empty page nobody planned. */
  const selectedDate = operatingDaysFrom(
    searchParams.get("date") ?? searchParams.get("day") ?? searchParams.get("start") ?? today,
    1,
  )[0]!;

  /* `?view=` carries EITHER the calendar view (`day` · `week` · `month`) OR
     the one WORK TO DO pick. Absent = the default `Week` Calendar (owner
     correction 2026-09-07). The retired spellings still resolve so a shared
     or bookmarked URL keeps answering: `calendar` → the week ·
     `delivered_proof_required` → `upload_proof` · `waiting_warehouse` (once a
     queue) → the DELIVERY STATUS filter · `?schedule=`/`?checking=` → their
     queue · `?start=`/`?day=` only ever named the calendar → its week. */
  const viewParam =
    searchParams.get("view") ??
    searchParams.get("schedule") ??
    (searchParams.get("checking") === "failed"
      ? "failed"
      : searchParams.get("checking") === "delivered_proof_required"
        ? "upload_proof"
        : searchParams.get("checking") === "waiting_warehouse"
          ? "waiting_warehouse"
          : null);
  const view: MonitorWorkView | null =
    viewParam === "all" ||
    viewParam === "no_logistics" ||
    viewParam === "no_confirmed_date" ||
    viewParam === "overdue" ||
    viewParam === "failed" ||
    viewParam === "upload_proof"
      ? viewParam
      : viewParam === "delivered_proof_required"
        ? "upload_proof"
        : null;
  const requestedCalendarView: MonitorCalendarView =
    viewParam === "day" || viewParam === "week" || viewParam === "month"
      ? viewParam
      : DEFAULT_CALENDAR_VIEW;
  /* A phone is ONLY ever the Day list — the Week and Month grids are never
     squeezed into it, whatever the URL asks for. */
  const calendarView: MonitorCalendarView = isPhone ? "day" : requestedCalendarView;

  const q = searchParams.get("q") ?? "";
  const region = searchParams.get("region");
  const logistics = searchParams.get("logistics");
  const statusParam = searchParams.get("status") ?? (viewParam === "waiting_warehouse" ? "waiting_warehouse" : null);
  const status: MonitorDeliveryStatus | null =
    statusParam === "waiting_warehouse" ||
    statusParam === "ready_for_handover" ||
    statusParam === "out_for_delivery"
      ? statusParam
      : null;

  const setParams = useCallback(
    (mutate: (next: URLSearchParams) => void, replace = false) => {
      const next = new URLSearchParams(searchParams);
      /* The retired spellings never survive a new pick. */
      next.delete("schedule");
      next.delete("checking");
      mutate(next);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams],
  );
  const setParam = (key: string, value: string | null, replace = false) =>
    setParams((next) => {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }, replace);
  /* Picking again unpicks — the rail's own toggle grammar. Unpicking any
     queue lands on the default Calendar (`Week`). */
  const pickView = (value: MonitorWorkView) =>
    setParams((next) => {
      if (view === value) next.delete("view");
      else next.set("view", value);
    });
  const toggleParam = (key: "region" | "logistics" | "status", value: string) =>
    setParams((next) => {
      if (searchParams.get(key) === value) next.delete(key);
      else next.set(key, value);
      /* A retired `?view=waiting_warehouse` was this filter — it may not
         linger beside the real one. */
      if (key === "status" && viewParam === "waiting_warehouse") next.delete("view");
    });
  const clearFilters = () =>
    setParams((next) => {
      next.delete("view");
      next.delete("region");
      next.delete("logistics");
      next.delete("status");
    });
  /* Choosing Day / Week / Month clears every operational pick and returns the
     right workspace to the Calendar (owner correction 2026-09-07). `Week` is
     the default and is spelled by its absence. */
  const pickCalendarView = (value: MonitorCalendarView) =>
    setParams((next) => {
      if (value === DEFAULT_CALENDAR_VIEW) next.delete("view");
      else next.set("view", value);
      next.delete("region");
      next.delete("logistics");
      next.delete("status");
    });
  /* The one date write from the window arrows — the calendar view stays. */
  const setDate = (iso: string) =>
    setParams((next) => {
      next.set("date", iso);
      next.delete("day");
      next.delete("start");
    });
  /* A rail-calendar or Month-view date click OPENS that date's Day view in
     the right workspace and clears the selected work queue. */
  const pickCalendarDate = (iso: string) =>
    setParams((next) => {
      next.set("date", iso);
      next.delete("day");
      next.delete("start");
      next.set("view", "day");
      next.delete("region");
      next.delete("logistics");
      next.delete("status");
    });

  const filters: DeliveryMonitorFilters = useMemo(() => {
    const base = {
      view,
      region,
      logisticsPartnerId: logistics,
      status,
      search: "",
      todayIso: today,
    };
    /* `?q=` narrows the CALENDAR only. The work list's one search is the
       grid's own box — an invisible second narrowing from a carried-over URL
       would make the listing look complete while it is not. */
    return { ...base, search: isCalendarProjection(base) ? q : "" };
  }, [view, region, logistics, status, q, today]);
  const calendarMode = isCalendarProjection(filters);

  /* ── The cards — the workspace's own reads, mapped once ────────────────── */
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);
  const arrangementsByScope = useMemo(() => {
    const m = new Map<string, DeliveryArrangementRow>();
    for (const a of arrangementsQ.data?.arrangements ?? []) m.set(`${a.order_id}#${a.leg}`, a);
    return m;
  }, [arrangementsQ.data]);
  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);

  const cards = useMemo(
    () =>
      buildDeliveryMonitorCards({
        orders: ordersQ.data?.orders ?? [],
        deliveryOrders: docsQ.data?.deliveryOrders ?? [],
        attempts: docsQ.data?.attempts ?? [],
        handoverEvents: docsQ.data?.handoverEvents ?? [],
        partnerNameById,
        arrangements: arrangementsByScope,
      }),
    [ordersQ.data, docsQ.data, partnerNameById, arrangementsByScope],
  );

  /* The FIXED window for this view and viewport — never a horizontal date
     scroll: the Day, the tablet's three-day half-week, the desktop's Mon–Sat
     operating week, or every day of the Month. */
  const visibleDays = useMemo(
    () =>
      calendarView === "day"
        ? [selectedDate]
        : calendarView === "month"
          ? monthDaysOf(selectedDate)
          : viewport === "tablet"
            ? tabletWindowOf(selectedDate)
            : operatingWeekOf(selectedDate),
    [calendarView, viewport, selectedDate],
  );
  /* The dot days for the rail's month calendar — every date genuinely
     holding a confirmed delivery, whatever month it sits in. */
  const workDayIsos = useMemo(
    () => [...new Set(cards.map((c) => c.confirmedDate).filter((d): d is string => d !== null))],
    [cards],
  );
  const rails = useMemo(
    () => buildMonitorRails(cards, filters, partners),
    [cards, filters, partners],
  );
  const calendarCards = useMemo(
    () => filterMonitorCalendarCards(cards, filters, visibleDays),
    [cards, filters, visibleDays],
  );
  /* The PHONE work list's own search box. It is deliberately LOCAL, not the
     URL's `?q=`: a carried-over URL search must never narrow a work list
     invisibly (the desktop sheet applies the same rule with the grid's own
     box), and the phone has no sheet toolbar to put one in. */
  const [phoneSearch, setPhoneSearch] = useState("");

  const listRows = useMemo(() => filterMonitorListRows(cards, filters), [cards, filters]);
  /* The phone list's visible rows — the same rows, narrowed by its own box. */
  const phoneRows = useMemo(
    () => listRows.filter((c) => matchesMonitorSearch(c, phoneSearch)),
    [listRows, phoneSearch],
  );
  const byDay = useMemo(
    () => groupCardsByDay(calendarCards, visibleDays),
    [calendarCards, visibleDays],
  );
  /* The Month's compact counts — over the SAME calendar cards. */
  const countsByDay = useMemo(() => monthDayCounts(calendarCards, today), [calendarCards, today]);

  const isError = ordersQ.isError || docsQ.isError;
  const isLoading = ordersQ.isLoading || docsQ.isLoading;

  /* ── SELECTION — work list only. Changing any filter clears it, so a batch
     can never quietly include rows the operator is no longer looking at. ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<DeliveryScopeRow[] | null>(null);
  useEffect(() => {
    setSelected(new Set());
  }, [view, region, logistics, status]);

  const toggleRow = useCallback(
    (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  /* The header checkbox acts on the VISIBLE filtered rows only — the engine
     hands exactly those keys; hidden or unfiltered rows are never touched. */
  const toggleAll = useCallback(
    (keys: string[], allSelected: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      }),
    [],
  );

  const selectedRows = useMemo(
    () => listRows.filter((r) => selected.has(r.scopeId)),
    [listRows, selected],
  );
  /* THE SAFE BULK DEFAULT (owner correction 2026-09-06): bulk assignment only
     when EVERY selected row is unassigned. Replacing an existing partner is
     the governed `Change logistics` act, one row at a time, reason recorded. */
  const allUnassigned =
    selectedRows.length > 0 && selectedRows.every((r) => r.logisticsPartnerId === null);
  const oneAssigned =
    selectedRows.length === 1 && selectedRows[0]!.logisticsPartnerId !== null;

  const openOrder = useCallback(
    (r: DeliveryMonitorCard) => navigate(`/operation/orders/so/${r.orderId}`),
    [navigate],
  );
  /**
   * The Delivery-owned editor, carrying THIS workspace back with it: the
   * operator records the confirmed date and returns to the same queue and the
   * same narrowing, with the row now gone from it. The Journey leg still
   * rides the URL and never reaches the screen as a word.
   */
  const openEditDelivery = useCallback(
    (r: DeliveryMonitorCard) => {
      const params = new URLSearchParams();
      if (r.leg != null) params.set("leg", String(r.leg));
      params.set("from", `${location.pathname}${location.search}`);
      navigate(`/operation/delivery/edit/${r.orderId}?${params.toString()}`);
    },
    [navigate, location.pathname, location.search],
  );

  /* ── THE WORK LIST — the same shared Register engine as Sales Orders ───── */
  const columns = useMemo<DataGridColumn<DeliveryMonitorCard>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN — pins while the sheet scrolls. The customer's
           own reference rides the same cell (the string a partner recognises);
           a Journey leg adds its leg number and route. */
        key: "so",
        label: MONITOR_COLUMN.so,
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <span className="block min-w-0">
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                openOrder(r);
              }}
            >
              SO-{r.scope.so}
            </button>
            {r.scope.refs.length > 0 ? (
              <span className="ml-1.5 text-kit-slate-11">{r.scope.refs.join(" · ")}</span>
            ) : null}
            {r.scope.legRoute ? (
              /* A Journey row names its own two places — the route IS the
                 word; `leg` never reaches the screen (owner correction
                 2026-09-07). */
              <span
                className="block truncate text-label text-kit-slate-11"
                title={r.scope.legRoute}
              >
                {r.scope.legRoute}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => `SO-${r.scope.so} ${r.scope.so} ${r.scope.refs.join(" ")}`,
        filterValue: (r) => `SO-${r.scope.so}`,
        exportValue: (r) =>
          `SO-${r.scope.so}${r.scope.refs.length ? ` ${r.scope.refs.join(" ")}` : ""}`,
        sortFn: (a, b) => a.scope.so - b.scope.so || (a.leg ?? 0) - (b.leg ?? 0),
      },
      {
        key: "customer",
        label: MONITOR_COLUMN.customer,
        width: 170,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.customerName}>
            {r.customerName}
          </span>
        ),
        searchValue: (r) => `${r.customerName} ${r.scope.o.customer_phone ?? ""}`,
        filterValue: (r) => r.customerName,
      },
      {
        /* The rail's REGION answer, on the row — the ONE address classifier
           (`regionBucketOf`), never a second derivation. */
        key: "state",
        label: MONITOR_COLUMN.state,
        width: 110,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) => r.region ?? <Absent>{DW.notRecorded}</Absent>,
        searchValue: (r) => r.region ?? "",
        filterValue: (r) => r.region ?? DW.notRecorded,
      },
      {
        /* Sales Orders' promise, in the governed word (`Requested Delivery
           Date`, owner ruling 2026-08-27). Delivery reads it, never writes it. */
        key: "customer_delivery",
        label: MONITOR_COLUMN.requestedDelivery,
        width: 176,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.scope.customerDeliveryIso,
        accessor: (r) =>
          r.scope.customerDeliveryIso ? (
            requestedText(r)
          ) : (
            <span title={r.scope.customerDateTbd ? DATE_TO_BE_CONFIRMED_FULL : undefined}>
              <Absent>{requestedText(r)}</Absent>
            </span>
          ),
        /* ⭐ ONE SPELLING for the cell, the search, the filter and the sheet:
           the export used to flatten `To be confirmed` into `No delivery
           date`, telling an Excel reader the customer had named no day when
           the customer had asked for one still being settled. */
        searchValue: requestedText,
        exportValue: requestedText,
        filterValue: requestedText,
        sortFn: (a, b) =>
          (a.scope.customerDeliveryIso ?? "").localeCompare(b.scope.customerDeliveryIso ?? ""),
      },
      {
        key: "logistics",
        label: MONITOR_COLUMN.logisticsPartner,
        width: 140,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) =>
          r.logisticsPartnerName ?? <Absent>{MONITOR_COPY.noLogistics}</Absent>,
        searchValue: (r) => r.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
        filterValue: (r) => r.logisticsPartnerName ?? MONITOR_COPY.noLogistics,
      },
      {
        /* Delivery's OWN confirmed operational date — the document's when one
           exists, else the confirmed booking. A carrier's provisional date is
           not confirmed and is not printed here. */
        key: "confirmed_delivery",
        label: MONITOR_COLUMN.confirmedDelivery,
        width: 150,
        sortable: true,
        filterType: "date",
        chooserGroup: "Delivery",
        dateValue: (r) => r.confirmedDate,
        accessor: (r) =>
          r.confirmedDate ? fmtDate(r.confirmedDate) : <Absent>{DW.noConfirmedDate}</Absent>,
        searchValue: (r) => (r.confirmedDate ? fmtDate(r.confirmedDate) : DW.noConfirmedDate),
        filterValue: (r) => (r.confirmedDate ? fmtDate(r.confirmedDate) : DW.noConfirmedDate),
        sortFn: (a, b) => (a.confirmedDate ?? "").localeCompare(b.confirmedDate ?? ""),
      },
      {
        key: "confirmed_time",
        label: MONITOR_COLUMN.confirmedTime,
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) => r.confirmedTime ?? <Absent>{DW.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DW.noTime,
        filterValue: (r) => r.confirmedTime ?? DW.noTime,
      },
      {
        key: "do_number",
        label: MONITOR_COLUMN.doNumber,
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) =>
          r.doNumber ? (
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`);
              }}
            >
              {r.doNumber}
            </button>
          ) : (
            /* The SYSTEM issues the document when the trip's requirements are
               met, so the absence is a stage, not a missing click. */
            <Absent>{MONITOR_COPY.noDeliveryOrder}</Absent>
          ),
        searchValue: (r) => r.doNumber ?? MONITOR_COPY.noDeliveryOrder,
        filterValue: (r) => r.doNumber ?? MONITOR_COPY.noDeliveryOrder,
      },
      {
        key: "location",
        label: MONITOR_COLUMN.location,
        width: 170,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.scope.location}>
            {r.scope.location}
          </span>
        ),
        searchValue: (r) => r.scope.location,
        filterValue: (r) => r.scope.location,
      },
      {
        key: "goods",
        label: MONITOR_COLUMN.goods,
        width: 220,
        sortable: true,
        chooserGroup: "Items",
        accessor: (r) => (
          <span className="block truncate" title={r.goodsSummary}>
            {r.goodsSummary}
          </span>
        ),
        searchValue: (r) => r.goodsSummary,
        filterValue: (r) => r.goodsSummary,
      },
      {
        key: "delivery_status",
        label: MONITOR_COLUMN.deliveryStatus,
        width: 180,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        /* ⭐ THE OPERATION'S progress, not the DOCUMENT's (owner ruling
           2026-08-24) — it always has an answer, and it is never `Created`. */
        accessor: (r) => {
          /* The result stays `Delivered`; the row names the EXACT missing
             evidence beneath it — `Upload delivery photo` and/or `Upload
             signed Delivery Order` (owner correction 2026-09-07). */
          const missing = missingProofLabels(r);
          const second = r.scope.status.reasonLabel ?? (missing.length ? missing.join(" · ") : null);
          return (
            <span className="block min-w-0">
              <StatusPill tone={STATUS_TONE[r.statusKey]}>{r.statusLabel}</StatusPill>
              {second ? (
                <span
                  className="block truncate text-label font-normal text-base-600"
                  title={second}
                  data-testid={missing.length ? "delivery-monitor-missing-proof" : undefined}
                >
                  {second}
                </span>
              ) : null}
            </span>
          );
        },
        searchValue: (r) => [r.statusLabel, ...missingProofLabels(r)].join(" "),
        filterValue: (r) => r.statusLabel,
      },
      {
        /* ⭐ THE CHASE COLUMN — who must be contacted, and the one door that
           records the answer (Delivery MASTER §8, the requested-vs-confirmed
           chase). The act comes from RECORDED facts through the module's one
           `monitorRowAction` arithmetic:

             no Logistics Partner   `Assign logistics` — the governed door
             partner, no date       `Call {partner} — confirm delivery date`,
                                    then `Edit Delivery` records what they said
             everything agreed      `Edit Delivery`

           The partner's NAME comes from the row; no carrier and no employee
           is ever hard-coded here. */
        key: "actions",
        label: MONITOR_COLUMN.actions,
        width: 250,
        chooserGroup: "Delivery",
        accessor: (r) => {
          const action = monitorRowAction(r);
          return (
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              {action.kind === "confirm_date" ? (
                <span className="block max-w-full truncate text-kit-slate-12" title={action.call}>
                  {action.call}
                </span>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-6 bg-white px-2 py-0.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                data-testid={`delivery-monitor-action-${action.kind}-${r.scopeId}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (action.kind === "assign_logistics") setAssigning([r.scope]);
                  else openEditDelivery(r);
                }}
              >
                {action.label}
              </button>
            </span>
          );
        },
        /* The sheet prints the same words the screen shows. */
        searchValue: monitorRowActionText,
        exportValue: monitorRowActionText,
        filterValue: monitorRowActionText,
      },
      {
        /* Off by default: the crew facts belong one click away rather than
           permanently widening the sheet. */
        key: "building",
        label: MONITOR_COLUMN.building,
        width: 120,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) =>
          r.scope.building === DW.notGiven ? (
            <Absent>{DW.notGiven}</Absent>
          ) : (
            r.scope.building
          ),
        searchValue: (r) => r.scope.building,
        filterValue: (r) => r.scope.building,
      },
      {
        key: "phone",
        label: MONITOR_COLUMN.phone,
        width: 140,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => r.scope.o.customer_phone ?? <Absent>{DW.notGiven}</Absent>,
        searchValue: (r) => r.scope.o.customer_phone ?? "",
        filterValue: (r) => r.scope.o.customer_phone ?? DW.notGiven,
      },
    ],
    [navigate, openOrder, openEditDelivery],
  );

  const contextMenu = useCallback(
    (r: DeliveryMonitorCard): DataGridContextMenuItem[] => [
      { label: EDIT_DELIVERY, onClick: () => openEditDelivery(r) },
      /* The row's act is ALSO one right-click away. `Actions` is the last of
         twelve ruled columns and a wide sheet scrolls, so the governed door
         must not depend on the operator reaching the right-hand edge — and
         `Assign logistics` was the one act the menu could not reach. */
      ...(r.logisticsPartnerId === null
        ? [{ label: ASSIGN_LOGISTICS, onClick: () => setAssigning([r.scope]) }]
        : []),
      { divider: true },
      { label: `Open SO-${r.scope.so}`, onClick: () => openOrder(r) },
      ...(r.doNumber
        ? [
            {
              label: `Open ${r.doNumber}`,
              onClick: () =>
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`),
            },
          ]
        : []),
    ],
    [navigate, openOrder, openEditDelivery],
  );

  const rangeLabel =
    calendarView === "day"
      ? fmtDate(selectedDate)
      : calendarView === "month"
        ? fmtMonth(selectedDate.slice(0, 7))
        : `${fmtDate(visibleDays[0]!)} – ${fmtDate(visibleDays[visibleDays.length - 1]!)}`;

  /* Previous/next REPLACES the whole displayed window: one operating day in
     Day, the three-day half-week on a tablet, the whole operating week on the
     desktop (six operating days = exactly one week, Sundays skipped), the
     whole month in Month. */
  const windowStep = calendarView === "day" ? 1 : viewport === "tablet" ? 3 : MONITOR_DAYS;
  const goPrevious = () =>
    setDate(
      calendarView === "month"
        ? monthStepStart(selectedDate, -1)
        : previousOperatingWindowStart(selectedDate, windowStep),
    );
  const goNext = () =>
    setDate(
      calendarView === "month"
        ? monthStepStart(selectedDate, 1)
        : nextOperatingWindowStart(selectedDate, windowStep),
    );
  const previousLabel = calendarView === "month" ? MONITOR_COPY.previousMonth : MONITOR_COPY.previousDays;
  const nextLabel = calendarView === "month" ? MONITOR_COPY.nextMonth : MONITOR_COPY.nextDays;

  /* ── THE PAGE-TOOLBAR CALENDAR CONTROL — Day · Week · Month ──────────────
     Present on both projections: on the work list nothing is lit, and one
     click on any of the three returns to the Calendar. Never on a phone,
     which is only ever the Day list. */
  const calendarControl = isPhone ? null : (
    <Segmented<MonitorCalendarView>
      options={MONITOR_CALENDAR_VIEWS.map((v) => ({ value: v, label: MONITOR_CALENDAR_VIEW_LABEL[v] }))}
      value={calendarMode ? calendarView : null}
      onChange={pickCalendarView}
      ariaLabel={MONITOR_COPY.calendarViews}
      testId="delivery-monitor-calendar-view"
    />
  );

  const showFiltersButton = (
    <button
      type="button"
      aria-label={MONITOR_COPY.showFilters}
      title={MONITOR_COPY.showFilters}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      data-testid="delivery-monitor-show-filters"
      onClick={() => {
        setFilterRailVisible(true);
        setPhoneRailOverride(true);
      }}
    >
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  /* ── THE RAIL — month calendar FIXED on top, filters scrolling below ───── */
  const rail = (
    <FilterRail
      testId="delivery-monitor-rail"
      onHide={() => {
        setFilterRailVisible(false);
        setPhoneRailOverride(false);
      }}
      /* The complete month, always in view (owner correction 2026-09-06):
         scrolling the filter groups never removes it. Clicking a date opens
         that date's Day view in the right workspace. */
      header={
        <MonitorMonthCalendar
          selectedIso={selectedDate}
          onSelect={pickCalendarDate}
          workDayIsos={workDayIsos}
          testId="delivery-monitor-month-calendar"
        />
      }
    >
      <FilterRailGroup title={MONITOR_COPY.railWork}>
        {MONITOR_WORK_VIEWS.map((key) => (
          <FilterRailRow
            key={key}
            label={MONITOR_VIEW_LABEL[key]}
            count={rails.work[key]}
            active={view === key}
            onClick={() => pickView(key)}
            testId={`delivery-monitor-work-${key}`}
          />
        ))}
      </FilterRailGroup>
      <FilterRailGroup title={MONITOR_COPY.railState}>
        {rails.regions.map((item) => (
          <FilterRailRow
            key={item.key}
            label={item.label}
            count={item.count}
            active={region === item.key}
            onClick={() => toggleParam("region", item.key)}
            testId={`delivery-monitor-region-${item.key}`}
          />
        ))}
      </FilterRailGroup>
      <FilterRailGroup title={MONITOR_COPY.railLogistics}>
        {rails.logistics.map((item) => (
          <FilterRailRow
            key={item.key}
            label={item.label}
            count={item.count}
            active={logistics === item.key}
            onClick={() => toggleParam("logistics", item.key)}
            testId={`delivery-monitor-logistics-${item.key}`}
          />
        ))}
      </FilterRailGroup>
      <FilterRailGroup title={MONITOR_COPY.railStatus}>
        {MONITOR_STATUS_FILTERS.map((key) => (
          <FilterRailRow
            key={key}
            label={MONITOR_STATUS_LABEL[key]}
            count={rails.status[key]}
            active={status === key}
            onClick={() => toggleParam("status", key)}
            testId={`delivery-monitor-status-${key}`}
          />
        ))}
      </FilterRailGroup>
    </FilterRail>
  );

  /** One day's stack — the SAME cards and order on desktop and phone. */
  const dayCards = (iso: string) => {
    const list = byDay.get(iso) ?? [];
    if (list.length === 0) {
      return <div className="px-2 py-3 text-body text-kit-slate-9">{MONITOR_COPY.emptyDay}</div>;
    }
    return (
      <div className="flex flex-col gap-1.5 p-1.5">
        {list.map((card) => (
          <MonitorCard key={card.scopeId} card={card} />
        ))}
      </div>
    );
  };

  /* ── THE SPANNING EMPTY RANGE (owner correction 2026-09-06) — one state,
     never the same sentence repeated in six columns. The confirmed-date count
     it offers is the REAL rail count, never an invented number. ──────────── */
  const emptyRange = (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center"
      data-testid="delivery-monitor-empty-range"
    >
      <p className="text-body text-kit-slate-12">
        {emptyRangeSentence(visibleDays, fmtDate)}
      </p>
      {rails.work.no_confirmed_date > 0 ? (
        <>
          <p className="text-body text-kit-slate-11">
            {needConfirmedDateSentence(rails.work.no_confirmed_date)}
          </p>
          <button
            type="button"
            className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            onClick={() => pickView("no_confirmed_date")}
            data-testid="delivery-monitor-open-no-confirmed-date"
          >
            {MONITOR_COPY.openNoConfirmedDate}
          </button>
        </>
      ) : null}
    </div>
  );

  /* ── THE ACTIVE-FILTER SUMMARY — every pick, visible above the rows ────── */
  const filterLabels = activeFilterLabels(filters, (id) => partnerNameById.get(id) ?? null);
  const filterSummary =
    filterLabels.length > 0 ? (
      <div
        className="flex h-9 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3"
        data-testid="delivery-monitor-filter-summary"
      >
        <span className="min-w-0 truncate text-body font-medium text-kit-slate-12">
          {filterLabels.join(" · ")}
        </span>
        <button
          type="button"
          className="ml-auto shrink-0 text-meta font-medium text-blue-700 underline-offset-2 hover:underline"
          onClick={clearFilters}
          data-testid="delivery-monitor-clear-filters"
        >
          {MONITOR_COPY.clearFilters}
        </button>
      </div>
    ) : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-kit-canvas"
      data-testid="operation-delivery-monitor"
    >
      <ModuleHeader
        testId="delivery-monitor-destination-header"
        word={MONITOR_COPY.page}
        docTitle={MONITOR_COPY.docTitle}
        destinationHeader
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {railVisible ? (
          isPhone ? (
            /* The phone FILTER DRAWER — the same rail, overlaid, never
               squeezing the one-day list underneath it. */
            <div className="absolute inset-y-0 left-0 z-20 flex shadow-lg">{rail}</div>
          ) : (
            rail
          )
        ) : null}

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-kit-slate-12">{MONITOR_COPY.loadFailed}</p>
              {((ordersQ.error ?? docsQ.error) as Error | undefined)?.message ? (
                <p className="text-meta text-kit-slate-11">
                  {((ordersQ.error ?? docsQ.error) as Error).message}
                </p>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                onClick={() => {
                  void ordersQ.refetch();
                  void docsQ.refetch();
                }}
              >
                {MONITOR_COPY.tryAgain}
              </button>
            </div>
          ) : calendarMode ? (
            <>
              {/* The calendar toolbar: where the window stands, Day · Week ·
                  Month, and the one search. */}
              <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
                {!railVisible ? showFiltersButton : null}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={previousLabel}
                    data-testid="delivery-monitor-previous"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goPrevious}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {isPhone ? (
                    /* The phone's full month opens through the kit's one
                       STANDARD date control (UI-KIT §11) — never a squeezed
                       desktop calendar. */
                    <div className="w-36 shrink-0" data-testid="delivery-monitor-date-control">
                      <DatePicker
                        id="delivery-monitor-date"
                        value={selectedDate}
                        onChange={(iso) => {
                          if (iso) pickCalendarDate(iso);
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      className="min-w-0 truncate px-1 text-body font-medium text-kit-slate-12"
                      data-testid="delivery-monitor-range"
                    >
                      {rangeLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={nextLabel}
                    data-testid="delivery-monitor-next"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goNext}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {calendarControl}
                <input
                  type="search"
                  value={q}
                  placeholder={MONITOR_COPY.search}
                  /* min-w-0 lets the box yield on a phone so the window
                     arrows and the date control always stay reachable. */
                  className="ml-auto h-8 w-full min-w-0 max-w-60 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
                  onChange={(e) => setParam("q", e.target.value, true)}
                />
              </div>

              {calendarView === "day" ? (
                /* ── THE DAY LIST — one operating day, the same cards and
                   order on every viewport; on a phone the ONLY calendar. ── */
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="delivery-monitor-daily">
                  <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-3 py-2 text-body font-semibold text-kit-slate-12">
                    {fmtDate(selectedDate)}
                  </div>
                  {dayCards(selectedDate)}
                </div>
              ) : !isLoading && calendarCards.length === 0 ? (
                q.trim() ? (
                  /* A search that matches nothing is a FILTERED empty — a
                     different fact from a genuinely empty range. */
                  <div
                    className="flex min-h-0 flex-1 items-center justify-center px-4 text-body text-kit-slate-11"
                    data-testid="delivery-monitor-empty-search"
                  >
                    {MONITOR_COPY.emptySearch}
                  </div>
                ) : (
                  emptyRange
                )
              ) : calendarView === "month" ? (
                /* ── THE MONTH — compact counts per date, never cards; a
                   date click opens its Day. ──────────────────────────────── */
                <MonitorMonthView
                  monthOfIso={selectedDate}
                  selectedIso={selectedDate}
                  countsByDay={countsByDay}
                  onSelect={pickCalendarDate}
                  testId="delivery-monitor-month-view"
                />
              ) : (
                /* ── THE WEEK'S COLUMNS — six on desktop, three on a tablet,
                   always fitting the available width (no horizontal date
                   scrolling; vertical scrolling inside the days). ───────── */
                <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isLoading}>
                  <div
                    className={`grid h-full divide-x divide-kit-slate-4 ${
                      viewport === "tablet" ? "grid-cols-3" : "grid-cols-6"
                    }`}
                  >
                    {visibleDays.map((iso) => (
                      <div
                        key={iso}
                        className="flex min-h-0 min-w-0 flex-col"
                        data-testid={`delivery-monitor-day-${iso}`}
                      >
                        <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-2 py-1.5 text-body font-semibold text-kit-slate-12">
                          {fmtDate(iso)}
                        </div>
                        {dayCards(iso)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── THE WORK LIST — the standard selectable Register ──────────── */
            <>
              {filterSummary}
              {isPhone ? (
                /* ⭐ MOBILE IS A LIST, NOT A SQUEEZED SHEET. Same rows, same
                   order, same words — and the three facts a chase needs are
                   on the card, never behind a Columns chooser. Bulk selection
                   stays a desk act: a phone assigns one delivery at a time. */
                <>
                {/* The rail is a DRAWER on a phone, so the door back to it
                    must stay on screen — the sheet's toolbar is not here to
                    carry it. */}
                <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
                  {!railVisible ? showFiltersButton : null}
                  <input
                    type="search"
                    value={phoneSearch}
                    placeholder={MONITOR_COPY.search}
                    className="ml-auto h-8 w-full min-w-0 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
                    data-testid="delivery-monitor-work-list-search"
                    onChange={(e) => setPhoneSearch(e.target.value)}
                  />
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto p-2"
                  data-testid="delivery-monitor-work-list"
                  aria-busy={isLoading}
                >
                  {phoneRows.length === 0 ? (
                    <div className="px-1 py-3 text-body text-kit-slate-9">
                      {cards.length === 0 ? MONITOR_COPY.emptyList : MONITOR_COPY.emptySearch}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        {phoneRows.map((card) => (
                          <MonitorWorkCard
                            key={card.scopeId}
                            card={card}
                            onAssign={(r) => setAssigning([r.scope])}
                            onEdit={openEditDelivery}
                            onOpenOrder={openOrder}
                          />
                        ))}
                      </div>
                      <div
                        className="px-1 py-2 text-meta text-kit-slate-11"
                        data-testid="delivery-monitor-work-list-footer"
                      >
                        {/* `{n} of {m} deliveries` while a search narrows —
                            the sheet's own footer grammar. */}
                        {deliveriesFooter(phoneRows.length, listRows.length)}
                      </div>
                    </>
                  )}
                </div>
                </>
              ) : (
              <div
                className="flex min-w-0 min-h-0 flex-1 flex-col p-2"
                data-testid="delivery-monitor-work-list"
              >
                <DataGrid<DeliveryMonitorCard>
                  appearance="reference"
                  rows={listRows}
                  columns={columns}
                  storageKey={WORK_LIST_STORAGE_KEY}
                  rowKey={(r) => r.scopeId}
                  exportName={MONITOR_COPY.page}
                  searchPlaceholder={MONITOR_COPY.search}
                  isLoading={isLoading}
                  emptyMessage={
                    cards.length === 0 ? MONITOR_COPY.emptyList : MONITOR_COPY.emptySearch
                  }
                  groupBanner={false}
                  stickyIdentity
                  chooserGroupOrder={["Document", "Customer", "Delivery", "Dates", "Items"]}
                  /* A row on this workspace IS a delivery, so opening it
                     opens the delivery (owner correction 2026-08-24). */
                  onRowDoubleClick={openEditDelivery}
                  contextMenu={contextMenu}
                  expandTitle={DW.showItems}
                  expandable={{
                    renderExpansion: (r) => <ScopeExpansion row={r.scope} />,
                  }}
                  selectable={{
                    selectedKeys: selected,
                    onToggle: toggleRow,
                    onToggleAll: toggleAll,
                  }}
                  /* `{N} selected · Clear · Assign logistics` — no invented
                     unit word and nothing between the three (owner correction
                     2026-09-07); the sheet's Export stays on the normal toolbar. */
                  selectionSummary={selectedSentence}
                  hideSelectionExport
                  selectionActions={[
                    ...(allUnassigned
                      ? [
                          {
                            /* Bulk initial assignment — Delivery's own write,
                               through the ONE governed door. */
                            label: () => ASSIGN_LOGISTICS,
                            kind: "write" as const,
                            onClick: (rows: never[]) =>
                              setAssigning(
                                (rows as unknown as DeliveryMonitorCard[]).map((c) => c.scope),
                              ),
                          },
                        ]
                      : []),
                    ...(oneAssigned
                      ? [
                          {
                            /* ONE assigned row — the governed reason/history
                               flow. Never a batch replacement. */
                            label: () => CHANGE_LOGISTICS,
                            kind: "write" as const,
                            onClick: (rows: never[]) =>
                              setAssigning(
                                (rows as unknown as DeliveryMonitorCard[]).map((c) => c.scope),
                              ),
                          },
                        ]
                      : []),
                    {
                      /* ONE row only — Edit Delivery opens a single
                         arrangement. */
                      label: () => EDIT_DELIVERY,
                      kind: "write",
                      visible: (n) => n === 1,
                      onClick: (rows) => {
                        const row = (rows as unknown as DeliveryMonitorCard[])[0];
                        if (row) openEditDelivery(row);
                      },
                    },
                  ]}
                  toolbarStart={
                    <>
                      {!railVisible ? showFiltersButton : null}
                      {calendarControl}
                    </>
                  }
                  statusSummary={(filtered) => {
                    const line = deliveriesFooter(filtered.length, listRows.length);
                    return (
                      <span className="block truncate" title={line}>
                        {line}
                      </span>
                    );
                  }}
                />
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {assigning && assigning.length > 0 && (
        <AssignLogisticsDialog
          scopes={assigning}
          open
          onOpenChange={(next) => {
            if (!next) setAssigning(null);
          }}
          onAssigned={() => {
            /* The picks are spent: leaving them ticked would offer `Assign
               logistics` again over scopes that just took one. */
            setSelected(new Set());
            setAssigning(null);
            void ordersQ.refetch();
            void arrangementsQ.refetch();
          }}
        />
      )}
    </div>
  );
}
