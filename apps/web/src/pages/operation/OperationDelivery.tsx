/**
 * DELIVERY MONITOR — planning calendar + selectable operational work lists.
 * Owner UI correction 2026-09-06 · `docs/delivery/MASTER.md` §8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ TWO PROJECTIONS OF ONE CANONICAL READ
 *
 * ```
 * Calendar (untouched)   six operating-day columns, delivery cards, NO checkboxes
 * every operational pick the standard selectable DataGrid work list
 * ```
 *
 * A work queue (`No confirmed date` · `Overdue` · `Failed Delivery` ·
 * `Delivered — Proof Required` · `Waiting for warehouse`), a REGION row or a
 * LOGISTICS row is an operational question, and its answer is the same
 * Register grammar every other module answers with — never a card wall.
 *
 * ⭐ BULK LOGISTICS ASSIGNMENT LIVES HERE (owner correction 2026-09-06).
 * The planning population includes delivery scopes that have no formal DO yet,
 * so the journey `No logistics picked → select rows → Assign logistics` runs
 * on Monitor's work list, through the ONE governed door
 * (`AssignLogisticsDialog` → `/delivery-arrangements/assign`). Replacing an
 * existing partner is the governed `Change logistics` act (reason + history)
 * and is offered for ONE row at a time — never as an uncontrolled batch.
 *
 * ⭐ THE RAIL IS THE SHARED FilterRail GRAMMAR (240px, page-owned): one
 * WORK TO DO group, REGION as direct state names from the real records (no
 * EAST/WEST MALAYSIA sub-headings), LOGISTICS as the partners genuinely
 * carrying matching scopes plus `No logistics picked`.
 *
 * ── MOBILE ──────────────────────────────────────────────────────────────────
 * The calendar becomes a one-day list; a work list stays the selectable grid
 * (sticky identity + horizontal scroll); the rail becomes the filter drawer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, PanelLeftOpen } from "lucide-react";
import type { DeliveryWorkStatusKind, OrderActionTone } from "@carres/shared";
import { fmtDate, appTodayIso } from "@/lib/fmt-date";
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
import {
  DATE_TO_BE_CONFIRMED_CELL,
  DATE_TO_BE_CONFIRMED_FULL,
} from "./sales-order-guidance";
import { DW, scopeFooter, type DeliveryScopeRow } from "./delivery-work";
import {
  MONITOR_COPY,
  MONITOR_DAYS,
  MONITOR_VIEW_LABEL,
  activeFilterLabels,
  buildDeliveryMonitorCards,
  buildMonitorRails,
  defaultMonitorWindowStart,
  emptyRangeSentence,
  filterMonitorCalendarCards,
  filterMonitorListRows,
  groupCardsByDay,
  isCalendarProjection,
  monitorCardHref,
  needConfirmedDateSentence,
  nextOperatingWindowStart,
  operatingDaysFrom,
  previousOperatingWindowStart,
  type DeliveryMonitorCard,
  type DeliveryMonitorFilters,
  type MonitorWorkView,
} from "./delivery-monitor";

/** The two governed action words on this workspace (COPY-STANDARD). */
const ASSIGN_LOGISTICS = "Assign logistics";
const CHANGE_LOGISTICS = "Change logistics";
const EDIT_DELIVERY = "Edit Delivery";

/** The rail-collapse memory (LOCAL FILTER RAIL COLLAPSE law). */
const FILTER_RAIL_STORAGE_KEY = "carres.deliveryMonitor.filterRail";
const WORK_LIST_STORAGE_KEY = "carres.deliveryMonitor.workList.v1";

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

/** Edit Delivery's own governed words for the arrangement's narrower arrival. */
const EXPECTED_ARRIVAL = "Expected arrival";

/** Below this width six readable date columns cannot exist — the same
 *  projection becomes the one-day list (the Warehouse agenda's own law). */
const PHONE_BREAKPOINT = 768;

function useIsPhoneWidth(): boolean {
  const query = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
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
 * Calendar cards carry NO checkbox and take no batch selection.
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
        {card.expectedArrival ? (
          <div className="text-label text-kit-slate-11">
            {EXPECTED_ARRIVAL} {card.expectedArrival}
          </div>
        ) : null}
      </div>
      <div className="border-t border-kit-slate-4 px-2 py-1">
        <StatusPill tone={card.proofRequired ? "warning" : STATUS_TONE[card.statusKey]}>
          {card.proofRequired ? MONITOR_COPY.deliveredProofRequired : card.statusLabel}
        </StatusPill>
      </div>
    </Link>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  const today = appTodayIso();
  const isPhone = useIsPhoneWidth();

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
  const start = searchParams.get("start") ?? defaultMonitorWindowStart(today);
  /* The phone's one selected day. A Sunday in the URL lands on the next
     operating day rather than an empty page nobody planned. */
  const day = operatingDaysFrom(searchParams.get("day") ?? today, 1)[0]!;

  /* `?view=` is the one WORK TO DO pick. The retired `?schedule=`/`?checking=`
     spellings still resolve so a shared or bookmarked URL keeps answering. */
  const viewParam =
    searchParams.get("view") ??
    searchParams.get("schedule") ??
    (searchParams.get("checking") === "failed"
      ? "failed"
      : searchParams.get("checking") === "delivered_proof_required"
        ? "delivered_proof_required"
        : searchParams.get("checking") === "waiting_warehouse"
          ? "waiting_warehouse"
          : null);
  const view: MonitorWorkView =
    viewParam === "no_confirmed_date" ||
    viewParam === "overdue" ||
    viewParam === "failed" ||
    viewParam === "delivered_proof_required" ||
    viewParam === "waiting_warehouse"
      ? viewParam
      : "calendar";

  const q = searchParams.get("q") ?? "";
  const region = searchParams.get("region");
  const logistics = searchParams.get("logistics");

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
  /* Picking again unpicks — the rail's own toggle grammar. */
  const pickView = (value: MonitorWorkView) =>
    setParams((next) => {
      if (value === "calendar" || view === value) next.delete("view");
      else next.set("view", value);
    });
  const toggleParam = (key: "region" | "logistics", value: string) =>
    setParams((next) => {
      if (searchParams.get(key) === value) next.delete(key);
      else next.set(key, value);
    });
  const clearFilters = () =>
    setParams((next) => {
      next.delete("view");
      next.delete("region");
      next.delete("logistics");
    });

  const filters: DeliveryMonitorFilters = useMemo(
    () => ({
      view,
      region,
      logisticsPartnerId: logistics,
      search: q,
      todayIso: today,
    }),
    [view, region, logistics, q, today],
  );
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

  const visibleDays = useMemo(
    () => (isPhone ? [day] : operatingDaysFrom(start, MONITOR_DAYS)),
    [isPhone, day, start],
  );
  const rails = useMemo(
    () => buildMonitorRails(cards, filters, visibleDays, partners),
    [cards, filters, visibleDays, partners],
  );
  const calendarCards = useMemo(
    () => filterMonitorCalendarCards(cards, filters, visibleDays),
    [cards, filters, visibleDays],
  );
  const listRows = useMemo(
    () => filterMonitorListRows(cards, filters, visibleDays),
    [cards, filters, visibleDays],
  );
  const byDay = useMemo(
    () => groupCardsByDay(calendarCards, visibleDays),
    [calendarCards, visibleDays],
  );

  const isError = ordersQ.isError || docsQ.isError;
  const isLoading = ordersQ.isLoading || docsQ.isLoading;

  /* ── SELECTION — work list only. Changing any filter clears it, so a batch
     can never quietly include rows the operator is no longer looking at. ── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<DeliveryScopeRow[] | null>(null);
  useEffect(() => {
    setSelected(new Set());
  }, [view, region, logistics]);

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
  const openEditDelivery = useCallback(
    (r: DeliveryMonitorCard) =>
      navigate(
        `/operation/delivery/edit/${r.orderId}${r.leg != null ? `?leg=${r.leg}` : ""}`,
      ),
    [navigate],
  );

  /* ── THE WORK LIST — the same shared Register engine as Sales Orders ───── */
  const columns = useMemo<DataGridColumn<DeliveryMonitorCard>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN — pins while the sheet scrolls. The customer's
           own reference rides the same cell (the string a partner recognises);
           a Journey leg adds its leg number and route. */
        key: "so",
        label: "SO No",
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
            {r.leg != null ? (
              <span
                className="block truncate text-label text-kit-slate-11"
                title={r.scope.legRoute ?? undefined}
              >
                Leg {r.leg}
                {r.scope.legRoute ? ` · ${r.scope.legRoute}` : ""}
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
        label: "Customer",
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
        /* Sales Orders' promise, in the governed word (`Requested Delivery
           Date`, owner ruling 2026-08-27). Delivery reads it, never writes it. */
        key: "customer_delivery",
        label: "Requested Delivery Date",
        width: 176,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.scope.customerDeliveryIso,
        accessor: (r) =>
          r.scope.customerDeliveryIso ? (
            fmtDate(r.scope.customerDeliveryIso)
          ) : r.scope.customerDateTbd ? (
            <span title={DATE_TO_BE_CONFIRMED_FULL}>
              <Absent>{DATE_TO_BE_CONFIRMED_CELL}</Absent>
            </span>
          ) : (
            <Absent>{DW.noCustomerDate}</Absent>
          ),
        searchValue: (r) =>
          r.scope.customerDeliveryIso ? fmtDate(r.scope.customerDeliveryIso) : DW.noCustomerDate,
        filterValue: (r) =>
          r.scope.customerDeliveryIso
            ? fmtDate(r.scope.customerDeliveryIso)
            : r.scope.customerDateTbd
              ? DATE_TO_BE_CONFIRMED_CELL
              : DW.noCustomerDate,
        sortFn: (a, b) =>
          (a.scope.customerDeliveryIso ?? "").localeCompare(b.scope.customerDeliveryIso ?? ""),
      },
      {
        key: "location",
        label: "Delivery Location",
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
        /* The rail's REGION answer, on the row — the ONE address classifier
           (`regionBucketOf`), never a second derivation. */
        key: "state",
        label: "State",
        width: 110,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) => r.region ?? <Absent>{DW.notRecorded}</Absent>,
        searchValue: (r) => r.region ?? "",
        filterValue: (r) => r.region ?? DW.notRecorded,
      },
      {
        key: "logistics",
        label: "Logistics Partner",
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
        label: "Confirmed Delivery",
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
        label: "Confirmed Time",
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) => r.confirmedTime ?? <Absent>{DW.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DW.noTime,
        filterValue: (r) => r.confirmedTime ?? DW.noTime,
      },
      {
        key: "goods",
        label: "Goods",
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
        key: "do_number",
        label: "DO No",
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
        key: "delivery_status",
        label: "Delivery Status",
        width: 180,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        /* ⭐ THE OPERATION'S progress, not the DOCUMENT's (owner ruling
           2026-08-24) — it always has an answer, and it is never `Created`. */
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={STATUS_TONE[r.statusKey]}>{r.statusLabel}</StatusPill>
            {r.scope.status.reasonLabel ? (
              <span className="block truncate text-label font-normal text-base-600">
                {r.scope.status.reasonLabel}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => r.statusLabel,
        filterValue: (r) => r.statusLabel,
      },
      {
        /* Off by default: the crew facts belong one click away rather than
           permanently widening the sheet. */
        key: "building",
        label: "Building",
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
        label: "Phone",
        width: 140,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => r.scope.o.customer_phone ?? <Absent>{DW.notGiven}</Absent>,
        searchValue: (r) => r.scope.o.customer_phone ?? "",
        filterValue: (r) => r.scope.o.customer_phone ?? DW.notGiven,
      },
    ],
    [navigate, openOrder],
  );

  const contextMenu = useCallback(
    (r: DeliveryMonitorCard): DataGridContextMenuItem[] => [
      { label: EDIT_DELIVERY, onClick: () => openEditDelivery(r) },
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

  const rangeLabel = isPhone
    ? fmtDate(day)
    : `${fmtDate(visibleDays[0]!)} – ${fmtDate(visibleDays[visibleDays.length - 1]!)}`;

  const goPrevious = () =>
    isPhone
      ? setParam("day", previousOperatingWindowStart(day, 1))
      : setParam("start", previousOperatingWindowStart(start, MONITOR_DAYS));
  const goNext = () =>
    isPhone
      ? setParam("day", nextOperatingWindowStart(day, 1))
      : setParam("start", nextOperatingWindowStart(start, MONITOR_DAYS));

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

  /* ── THE RAIL — the shared FilterRail grammar (240px, page-owned) ──────── */
  const rail = (
    <FilterRail
      testId="delivery-monitor-rail"
      onHide={() => {
        setFilterRailVisible(false);
        setPhoneRailOverride(false);
      }}
    >
      <FilterRailGroup title={MONITOR_COPY.railWork}>
        {(
          [
            "calendar",
            "no_confirmed_date",
            "overdue",
            "failed",
            "delivered_proof_required",
            "waiting_warehouse",
          ] as const
        ).map((key) => (
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
      <FilterRailGroup title={MONITOR_COPY.railRegion}>
        <FilterRailRow
          label={MONITOR_COPY.allRegions}
          active={region === null}
          onClick={() => setParam("region", null)}
          testId="delivery-monitor-region-all"
        />
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
        <FilterRailRow
          label={MONITOR_COPY.allLogistics}
          active={logistics === null}
          onClick={() => setParam("logistics", null)}
          testId="delivery-monitor-logistics-all"
        />
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
              {/* The calendar toolbar: where the window stands, and the one search. */}
              <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
                {!railVisible ? showFiltersButton : null}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={MONITOR_COPY.previousDays}
                    className="flex h-8 w-8 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goPrevious}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span
                    className="min-w-0 truncate px-1 text-body font-medium text-kit-slate-12"
                    data-testid="delivery-monitor-range"
                  >
                    {rangeLabel}
                  </span>
                  <button
                    type="button"
                    aria-label={MONITOR_COPY.nextDays}
                    className="flex h-8 w-8 items-center justify-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-hovertint"
                    onClick={goNext}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <input
                  type="search"
                  value={q}
                  placeholder={MONITOR_COPY.search}
                  className="ml-auto h-8 w-full max-w-60 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
                  onChange={(e) => setParam("q", e.target.value, true)}
                />
              </div>

              {isPhone ? (
                /* ── THE ONE-DAY LIST — never the grid squeezed into a phone. ── */
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="delivery-monitor-daily">
                  <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-3 py-2 text-body font-semibold text-kit-slate-12">
                    {fmtDate(day)}
                  </div>
                  {dayCards(day)}
                </div>
              ) : !isLoading && calendarCards.length === 0 ? (
                q.trim() ? (
                  /* A search that matches nothing is a FILTERED empty — a
                     different fact from a genuinely empty range. */
                  <div
                    className="flex min-h-0 flex-1 items-center justify-center px-4 text-body text-kit-slate-11"
                    data-testid="delivery-monitor-empty-search"
                  >
                    No matching delivery scopes.
                  </div>
                ) : (
                  emptyRange
                )
              ) : (
                /* ── SIX OPERATING-DAY COLUMNS ─────────────────────────────── */
                <div className="min-h-0 flex-1 overflow-auto" aria-busy={isLoading}>
                  <div className="grid h-full min-w-[860px] grid-cols-6 divide-x divide-kit-slate-4">
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
                    cards.length === 0
                      ? MONITOR_COPY.emptyList
                      : "No matching delivery scopes."
                  }
                  groupBanner={false}
                  stickyIdentity
                  chooserGroupOrder={["Document", "Customer", "Delivery", "Dates", "Items"]}
                  /* A row on this workspace IS a delivery scope, so opening it
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
                  selectionSummary={(n) =>
                    n === 1 ? "1 delivery scope selected" : `${n} delivery scopes selected`
                  }
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
                      /* ONE scope only — Edit Delivery opens a single
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
                  toolbarStart={!railVisible ? showFiltersButton : undefined}
                  statusSummary={(filtered) => {
                    const line = scopeFooter(filtered.length, listRows.length);
                    return (
                      <span className="block truncate" title={line}>
                        {line}
                      </span>
                    );
                  }}
                />
              </div>
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
