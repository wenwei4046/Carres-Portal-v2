// design-standard: not-a-list-page — dated Warehouse Monitor Calendar
// (read-only projection of arrivals and pickups), not a Register list.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addWorkingDays,
  myHolidaySet,
  subtractWorkingDays,
  WAREHOUSE_OFF_DAYS,
  warehouseMonitorArrivalEvents,
  warehouseMonitorDayEvents,
  warehouseMonitorEmptyDaySentence,
  warehouseMonitorPickupEvents,
  warehouseOperatingDates,
  warehouseOutboundCards,
  warehouseRangeShift,
  type DeliveryWarehouseScheduleEvent,
  type WarehouseExpectedArrival,
  type WarehouseMonitorEvent,
} from "@carres/shared";
import {
  useDeliveryWarehouseSchedule,
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
} from "@/lib/queries";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";

/**
 * WAREHOUSE — MONITOR: the module's ONLY Calendar-summary page
 * (owner replacement Card 2026-09-06; Stock MASTER §2).
 *
 * Six governed working dates, full width — deliberately NO 240px filter
 * rail: Monitor summarises the whole site's day; filtering belongs to the
 * destination pages (Inbound · Outbound) each card opens.
 *
 * BOTH directions render on one board, arranged by actual time inside each
 * date: ARRIVAL work projected from Purchasing's expected arrivals, PICKUP
 * work projected from Delivery's schedule feed. Every card says what its
 * time MEANS (`Driver pickup 14:30`) or says exactly `Time not provided` —
 * never a bare clock.
 *
 * Monitor is read-only. It completes nothing: an ARRIVAL card opens Inbound
 * already filtered to the date, Site and source record; a PICKUP card opens
 * Outbound the same way; `DO No` opens the formal read-only Delivery Order.
 * Warehouse never reaches Edit Delivery from here.
 */

/** Below this width six readable date columns cannot fit — the same
 *  projection becomes a one-day agenda list (card §3, mobile). */
const AGENDA_BREAKPOINT = 1280;

export function useIsAgendaWidth(): boolean {
  const query = `(max-width: ${AGENDA_BREAKPOINT - 1}px)`;
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

export default function WarehouseWorkspace() {
  const [params, setParams] = useSearchParams();

  const holidays = useMemo(() => myHolidaySet(), []);
  const today = appTodayIso();
  const from = params.get("from") ?? today;
  const dates = useMemo(
    () => warehouseOperatingDates(from, 6, holidays),
    [from, holidays],
  );
  const selectedDate = params.get("date") ?? dates[0] ?? today;
  const isAgenda = useIsAgendaWidth();

  const sched = useDeliveryWarehouseSchedule();
  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();

  const pickupEvents = useMemo(() => {
    const events = (sched.data?.events ?? []) as DeliveryWarehouseScheduleEvent[];
    return warehouseMonitorPickupEvents(warehouseOutboundCards(events));
  }, [sched.data]);

  const arrivalEvents = useMemo(() => {
    const supplierName = new Map(
      (suppliersQ.data?.suppliers ?? []).map((s: { id: string; name: string }) => [
        s.id,
        s.name,
      ]),
    );
    const siteName = new Map(
      (warehouseQ.data?.warehouses ?? []).map((w: { id: string; name: string }) => [
        w.id,
        w.name,
      ]),
    );
    const arrivals: WarehouseExpectedArrival[] = (posQ.data?.pos ?? [])
      .filter((po) => po.status === "open")
      .map((po) => ({
        poId: po.id,
        supplierName: supplierName.get(po.supplier_id) ?? null,
        siteName:
          siteName.get(po.destination_id ?? po.warehouse_id) ??
          siteName.get(po.warehouse_id) ??
          null,
        siteId: siteName.has(po.destination_id ?? po.warehouse_id)
          ? po.destination_id ?? po.warehouse_id
          : siteName.has(po.warehouse_id)
            ? po.warehouse_id
            : null,
        etaDate: po.eta_date,
        pendingQty: (po.purchase_order_lines ?? []).reduce(
          (n, l) => n + Math.max(0, (l.qty ?? 0) - (l.received_qty ?? 0)),
          0,
        ),
      }));
    return warehouseMonitorArrivalEvents(arrivals);
  }, [posQ.data, suppliersQ.data, warehouseQ.data]);

  const events = useMemo(
    () => [...arrivalEvents, ...pickupEvents],
    [arrivalEvents, pickupEvents],
  );

  const isLoading = sched.isLoading || posQ.isLoading;
  const error = sched.error;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: false });
  }

  /** Card §4 — a card opens its work page ALREADY filtered: date, Site,
   *  source document, exact record. Same `/operation?tab=` address space. */
  function openEvent(e: WarehouseMonitorEvent) {
    const next = new URLSearchParams(params);
    next.set("tab", e.open.tab);
    next.set("date", e.open.date);
    if (e.open.site) next.set("site", e.open.site);
    else next.delete("site");
    if (e.open.tab === "warehouse-inbound") {
      next.set("po", e.open.po);
      next.delete("do");
    } else {
      next.set("do", e.open.do);
      next.delete("po");
    }
    setParams(next);
  }

  const rangeLabel =
    dates.length > 0
      ? `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length - 1])}`
      : "—";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="warehouse-monitor">
      <ModuleHeader
        testId="warehouse-monitor-header"
        word="Monitor"
        docTitle="Monitor · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex items-center gap-3 border-b border-kit-slate-5 bg-white px-3 py-1.5">
        <div className="flex items-center gap-1" data-testid="wm-range">
          <button
            type="button"
            aria-label="Previous dates"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-kit-slate-5 hover:bg-hovertint"
            onClick={() =>
              isAgenda
                ? setParam(
                    "date",
                    subtractWorkingDays(selectedDate, 1, {
                      offDays: WAREHOUSE_OFF_DAYS,
                      holidays,
                    }),
                  )
                : setParam("from", warehouseRangeShift(dates, -1, holidays))
            }
            data-testid="wm-prev"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-0 px-1 text-[13px] font-medium text-base-800">
            {isAgenda ? fmtDate(selectedDate) : rangeLabel}
          </span>
          <button
            type="button"
            aria-label="Next dates"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-kit-slate-5 hover:bg-hovertint"
            onClick={() =>
              isAgenda
                ? setParam(
                    "date",
                    addWorkingDays(selectedDate, 1, {
                      offDays: WAREHOUSE_OFF_DAYS,
                      holidays,
                    }),
                  )
                : setParam("from", warehouseRangeShift(dates, 1, holidays))
            }
            data-testid="wm-next"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <p className="p-4 text-[13px] text-base-500">Loading…</p>
        ) : error ? (
          <p className="p-4 text-[13px] text-base-600" data-testid="wm-error">
            The schedule could not be loaded. {error.message}
          </p>
        ) : isAgenda ? (
          <AgendaDay date={selectedDate} events={events} onOpen={openEvent} />
        ) : (
          <CalendarBoard dates={dates} events={events} onOpen={openEvent} />
        )}
      </div>
    </div>
  );
}

/** Desktop board — six operating dates in ONE chronological horizontal
 *  sequence (never 3 × 2), one shared vertical scroll, full width (no rail). */
function CalendarBoard({
  dates,
  events,
  onOpen,
}: {
  dates: string[];
  events: WarehouseMonitorEvent[];
  onOpen: (e: WarehouseMonitorEvent) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="wm-board">
      {/* min-w-full, not min-w-max: a long empty-day sentence must WRAP inside
          its 232px-floor column, not widen every column until six days cannot
          fit even at full page width. Below the floor the container scrolls. */}
      <div
        className="grid min-w-full gap-px bg-kit-slate-5"
        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(232px, 1fr))` }}
      >
        {dates.map((date) => (
          <div key={date} className="bg-base-50" data-testid={`wm-col-${date}`}>
            <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-2 py-1.5 text-label font-semibold uppercase tracking-wide text-base-600">
              {fmtDate(date)}
            </div>
            <DayEvents date={date} events={events} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Narrow width — one selected day as a vertical time-ordered list;
 *  previous/next moves one operating date (card §3, mobile). */
function AgendaDay({
  date,
  events,
  onOpen,
}: {
  date: string;
  events: WarehouseMonitorEvent[];
  onOpen: (e: WarehouseMonitorEvent) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="wm-agenda">
      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-base-600">
        {fmtDate(date)}
      </h2>
      <div className="max-w-xl">
        <DayEvents date={date} events={events} onOpen={onOpen} />
      </div>
    </div>
  );
}

function DayEvents({
  date,
  events,
  onOpen,
}: {
  date: string;
  events: WarehouseMonitorEvent[];
  onOpen: (e: WarehouseMonitorEvent) => void;
}) {
  const day = warehouseMonitorDayEvents(events, date);
  if (day.length === 0) {
    return (
      <p className="px-3 py-4 text-[13px] leading-5 text-base-500" data-testid={`wm-empty-${date}`}>
        {warehouseMonitorEmptyDaySentence(fmtDate(date))}
      </p>
    );
  }
  return (
    <div className="space-y-2 p-2">
      {day.map((e) => (
        <MonitorCard key={`${e.kind}-${e.sourceLabel}`} event={e} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** ONE card = one dated piece of physical work. Field order is fixed:
 *  the time sentence · the event name with its direction · the source
 *  document · the party and what moves · the Site. The card body opens the
 *  filtered work page; `DO No` is a separate read-only document door. */
function MonitorCard({
  event,
  onOpen,
}: {
  event: WarehouseMonitorEvent;
  onOpen: (e: WarehouseMonitorEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded border border-kit-slate-5 bg-white p-2.5 text-left shadow-sm outline-offset-2 hover:border-base-300 focus-visible:outline focus-visible:outline-2"
      onClick={() => onOpen(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(event);
        }
      }}
      data-testid={`wm-card-${event.sourceLabel.split(" ")[0]}`}
      aria-label={`Open ${event.group === "arrival" ? "Inbound" : "Outbound"} for ${event.sourceLabel}`}
    >
      <div className="text-[13px] font-medium text-base-800" data-testid="wm-card-time">
        {event.timeSentence}
      </div>
      <div className="mt-0.5 text-label uppercase tracking-wide text-base-500" data-testid="wm-card-kind">
        {event.group === "arrival" ? "Arrival" : "Pickup"} · {event.label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        {event.sourceHref ? (
          <Link
            to={event.sourceHref}
            className="font-mono text-[13px] font-semibold text-base-800 underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
            data-testid="wm-card-source-link"
          >
            {event.sourceLabel}
          </Link>
        ) : (
          <span className="font-mono text-[13px] font-semibold text-base-800">
            {event.sourceLabel}
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[13px] text-base-700" title={`${event.party} · ${event.detail}`}>
        {event.party} · {event.detail}
      </div>
      {event.site && (
        <div className="text-label text-base-500" data-testid="wm-card-site">
          {event.site}
        </div>
      )}
    </div>
  );
}
