// design-standard: not-a-list-page — dated Warehouse workspace (Dashboard
// Calendar + Outbound exact-Unit work), Stock MASTER §7, not a Register list.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  addWorkingDays,
  myHolidaySet,
  subtractWorkingDays,
  WAREHOUSE_OFF_DAYS,
  warehouseEmptyDaySentence,
  warehouseOperatingDates,
  warehouseOutboundCards,
  warehouseRangeShift,
  type DeliveryWarehouseScheduleEvent,
  type WarehouseOutboundCard,
} from "@carres/shared";
import { useDeliveryWarehouseSchedule } from "@/lib/queries";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";
import WarehouseOutboundWork from "./WarehouseOutboundWork";

/**
 * WAREHOUSE — Dashboard Calendar → Outbound exact-Unit work
 * (CARD-2026-09-04-warehouse-03; Stock MASTER §2 「WAREHOUSE DASHBOARD
 *  CALENDAR — OWNER-APPROVED / LOCKED 2026-09-04」 and §12.6).
 *
 * ONE component owns both `?tab=` addresses so the Dashboard stays mounted
 * (visibility only) while Outbound is open — browser Back restores the
 * Calendar range, filters and scroll position instead of a fresh board.
 *
 * The Dashboard is a READ-ONLY projection of Delivery's schedule feed: no
 * KPI wall, no primary action, no Refresh button, no Warehouse write control.
 * Clicking a card opens Outbound scoped to that date and DO; `DO No` is a
 * separate door to the formal read-only Delivery Order. Never Edit Delivery.
 */

/** Below this width six readable date columns cannot fit beside the rail —
 *  the same projection becomes a one-day agenda (Stock MASTER §7). */
const AGENDA_BREAKPOINT = 1280;

export type WarehouseScheduleView = "calendar" | "not-done" | "no-evidence";

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
  const tab = params.get("tab") ?? "warehouse-dashboard";
  const isOutbound = tab === "warehouse-outbound";

  const holidays = useMemo(() => myHolidaySet(), []);
  const today = appTodayIso();
  const from = params.get("from") ?? today;
  const dates = useMemo(
    () => warehouseOperatingDates(from, 6, holidays),
    [from, holidays],
  );
  const selectedDate = params.get("date") ?? dates[0] ?? today;
  const site = params.get("site");
  const sched = (params.get("sched") ?? "calendar") as WarehouseScheduleView;
  const search = params.get("q") ?? "";
  const selectedDo = params.get("do");
  const isAgenda = useIsAgendaWidth();
  const [railHidden, setRailHidden] = useState(isAgenda);
  /* At agenda width the 240px rail would crush the one-day list, so it opens
     on demand from the [Filters] control and closes after a pick (card §5
     narrow composition). */
  useEffect(() => {
    if (isAgenda) setRailHidden(true);
  }, [isAgenda]);
  function pickRail(key: string, value: string | null) {
    setParam(key, value);
    if (isAgenda) setRailHidden(true);
  }

  const { data, isLoading, error } = useDeliveryWarehouseSchedule();
  const events = useMemo(
    () => (data?.events ?? []) as DeliveryWarehouseScheduleEvent[],
    [data],
  );
  const allCards = useMemo(() => warehouseOutboundCards(events), [events]);

  const siteNames = useMemo(
    () =>
      [...new Set(allCards.map((c) => c.fromLocation))]
        .filter((s) => s && s !== "Not recorded")
        .sort(),
    [allCards],
  );

  const cards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCards.filter((c) => {
      if (site && c.fromLocation !== site) return false;
      if (sched === "not-done" && c.notHandedOver === 0) return false;
      if (sched === "no-evidence" && !c.evidenceNotSubmitted) return false;
      if (!q) return true;
      return (
        c.doNumber.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q) ||
        c.toCustomer.toLowerCase().includes(q) ||
        c.logisticsPartner.toLowerCase().includes(q) ||
        c.units.some((u) => u.unitId.toLowerCase().includes(q))
      );
    });
  }, [allCards, site, sched, search]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: false });
  }

  function openOutbound(card: WarehouseOutboundCard) {
    const next = new URLSearchParams(params);
    next.set("tab", "warehouse-outbound");
    next.set("date", card.eventDate);
    next.set("do", card.doNumber);
    setParams(next);
  }

  const rangeLabel =
    dates.length > 0
      ? `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length - 1])}`
      : "—";

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-testid="warehouse-workspace"
    >
      {/* Dashboard stays mounted underneath Outbound — visibility only, so
          Back restores filters and scroll (the Manual Purchase pattern). */}
      <div
        className={`flex min-h-0 flex-1 flex-col${isOutbound ? " hidden" : ""}`}
        aria-hidden={isOutbound || undefined}
        data-testid="warehouse-dashboard"
      >
        <ModuleHeader
          testId="warehouse-dashboard-header"
          word="Dashboard"
          docTitle="Dashboard · Warehouse — Carres"
          destinationHeader
        />
        <div className="flex items-center gap-3 border-b border-kit-slate-5 bg-white px-3 py-1.5">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint"
            onClick={() => setRailHidden((h) => !h)}
            data-testid="wd-toggle-filters"
          >
            {railHidden ? (
              <PanelLeftOpen size={14} />
            ) : (
              <PanelLeftClose size={14} />
            )}
            {railHidden ? "Filters" : "Hide filters"}
          </button>
          <div className="flex items-center gap-1" data-testid="wd-range">
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
              data-testid="wd-prev"
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
              data-testid="wd-next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="ml-auto">
            <input
              type="search"
              value={search}
              placeholder="Search"
              aria-label="Search outbound handovers"
              className="h-7 w-52 rounded border border-kit-slate-5 px-2 text-[13px]"
              onChange={(e) => setParam("q", e.target.value)}
              data-testid="wd-search"
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          {!railHidden && (
            <FilterRail testId="wd-rail">
              <FilterRailGroup title="OUTBOUND SCHEDULE">
                <FilterRailRow
                  label="Calendar"
                  active={sched === "calendar"}
                  onClick={() => pickRail("sched", null)}
                  testId="wd-sched-calendar"
                />
                <FilterRailRow
                  label="Not done"
                  count={allCards.filter((c) => c.notHandedOver > 0).length}
                  active={sched === "not-done"}
                  onClick={() =>
                    pickRail("sched", sched === "not-done" ? null : "not-done")
                  }
                  testId="wd-sched-not-done"
                />
                <FilterRailRow
                  label="Evidence not submitted"
                  count={allCards.filter((c) => c.evidenceNotSubmitted).length}
                  active={sched === "no-evidence"}
                  onClick={() =>
                    pickRail(
                      "sched",
                      sched === "no-evidence" ? null : "no-evidence",
                    )
                  }
                  testId="wd-sched-no-evidence"
                />
              </FilterRailGroup>
              {siteNames.length > 1 && (
                <FilterRailGroup title="SITE">
                  {siteNames.map((name) => (
                    <FilterRailRow
                      key={name}
                      label={name}
                      count={
                        allCards.filter((c) => c.fromLocation === name).length
                      }
                      active={site === name}
                      onClick={() =>
                        pickRail("site", site === name ? null : name)
                      }
                      testId={`wd-site-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    />
                  ))}
                </FilterRailGroup>
              )}
              {/* SOURCE is not rendered while `Delivery Order` is the only live
                  source: a one-option group is a dead control (card §4.2).
                  The source stays explicit on every card. */}
            </FilterRail>
          )}
          <div
            className={`min-h-0 min-w-0 flex-1 flex-col${!railHidden && isAgenda ? " hidden" : " flex"}`}
          >
            {isLoading ? (
              <p className="p-4 text-[13px] text-base-500">Loading…</p>
            ) : error ? (
              <p
                className="p-4 text-[13px] text-base-600"
                data-testid="wd-error"
              >
                The schedule could not be loaded. {error.message}
              </p>
            ) : sched !== "calendar" ? (
              <GroupedCardList
                cards={cards}
                onOpen={openOutbound}
                testId={`wd-list-${sched}`}
              />
            ) : isAgenda ? (
              <AgendaDay
                date={selectedDate}
                cards={cards.filter((c) => c.eventDate === selectedDate)}
                onOpen={openOutbound}
              />
            ) : (
              <CalendarBoard
                dates={dates}
                cards={cards}
                onOpen={openOutbound}
              />
            )}
          </div>
        </div>
      </div>

      {isOutbound &&
        (params.get("arrival") ? (
          <ArrivalSourceWorkspace outbound sourceId={params.get("arrival")!} />
        ) : (
          <WarehouseOutboundWork
            cards={allCards}
            date={selectedDate}
            selectedDo={selectedDo}
            isLoading={isLoading}
            onSelectDo={(doNumber) => setParam("do", doNumber)}
          />
        ))}
    </div>
  );
}

/** Desktop board — six operating dates in ONE chronological horizontal
 *  sequence (never 3 × 2), one shared vertical scroll, the work area owning
 *  horizontal overflow. */
function CalendarBoard({
  dates,
  cards,
  onOpen,
}: {
  dates: string[];
  cards: WarehouseOutboundCard[];
  onOpen: (card: WarehouseOutboundCard) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="wd-board">
      <div
        className="grid min-w-max gap-px bg-kit-slate-5"
        style={{
          gridTemplateColumns: `repeat(${dates.length}, minmax(232px, 1fr))`,
        }}
      >
        {dates.map((date) => (
          <div key={date} className="bg-base-50" data-testid={`wd-col-${date}`}>
            <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-2 py-1.5 text-label font-semibold uppercase tracking-wide text-base-600">
              {fmtDate(date)}
            </div>
            <DayColumn
              date={date}
              cards={cards.filter((c) => c.eventDate === date)}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  date,
  cards,
  onOpen,
}: {
  date: string;
  cards: WarehouseOutboundCard[];
  onOpen: (card: WarehouseOutboundCard) => void;
}) {
  if (cards.length === 0) {
    return (
      <p
        className="px-3 py-4 text-[13px] leading-5 text-base-500"
        data-testid={`wd-empty-${date}`}
      >
        {warehouseEmptyDaySentence(fmtDate(date))}
      </p>
    );
  }
  return (
    <div className="space-y-2 p-2">
      {cards.map((card) => (
        <OutboundCard key={card.doNumber} card={card} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** Narrow width — one selected day as an agenda list; previous/next moves one
 *  operating date. Same data, permissions and destinations as the board. */
function AgendaDay({
  date,
  cards,
  onOpen,
}: {
  date: string;
  cards: WarehouseOutboundCard[];
  onOpen: (card: WarehouseOutboundCard) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="wd-agenda">
      <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-base-600">
        {fmtDate(date)}
      </h2>
      {cards.length === 0 ? (
        <p
          className="text-[13px] leading-5 text-base-500"
          data-testid={`wd-empty-${date}`}
        >
          {warehouseEmptyDaySentence(fmtDate(date))}
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <OutboundCard key={card.doNumber} card={card} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Not done / Evidence not submitted — the same cards, grouped under their
 *  ORIGINAL dates (unfinished work is never re-dated or hidden). */
function GroupedCardList({
  cards,
  onOpen,
  testId,
}: {
  cards: WarehouseOutboundCard[];
  onOpen: (card: WarehouseOutboundCard) => void;
  testId: string;
}) {
  const dates = [...new Set(cards.map((c) => c.eventDate))].sort();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid={testId}>
      {dates.length === 0 ? (
        <p className="text-[13px] text-base-500">
          Nothing here. Every handover on this view is done.
        </p>
      ) : (
        dates.map((date) => (
          <section key={date} className="mb-4">
            <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-base-600">
              {fmtDate(date)}
            </h2>
            <div className="grid max-w-4xl gap-2">
              {cards
                .filter((c) => c.eventDate === date)
                .map((card) => (
                  <OutboundCard
                    key={card.doNumber}
                    card={card}
                    onOpen={onOpen}
                  />
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** ONE card = ONE active customer-DO scope. Field order is locked (card §6):
 *  actual handover time (only when it exists) · DO No · From → To · Partner ·
 *  Units required · Handed over · Not handed over · the current fact.
 *  The card body opens Outbound; `DO No` opens the formal read-only DO. */
export function OutboundCard({
  card,
  onOpen,
}: {
  card: WarehouseOutboundCard;
  onOpen: (card: WarehouseOutboundCard) => void;
}) {
  const remaining = card.units.filter((u) => !u.unitHandedOverAt);
  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded border border-kit-slate-5 bg-white p-2.5 text-left shadow-sm outline-offset-2 hover:border-base-300 focus-visible:outline focus-visible:outline-2"
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
      data-testid={`wd-card-${card.doNumber}`}
      aria-label={`Open Outbound for ${card.doNumber}`}
    >
      {card.actualHandoverAt && (
        <div className="text-label text-base-500" data-testid="wd-card-time">
          {fmtDate(card.actualHandoverAt, { timeOnly: true })}
        </div>
      )}
      <div className="flex items-baseline gap-2">
        <Link
          to={card.deliveryOrderHref}
          className="font-mono text-[13px] font-semibold text-base-800 underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
          data-testid="wd-card-do"
        >
          {card.doNumber}
        </Link>
        <span className="text-label text-base-500">{card.source}</span>
      </div>
      <div
        className="mt-0.5 truncate text-[13px] text-base-700"
        title={`${card.fromLocation} → ${card.toCustomer}`}
      >
        {card.fromLocation} → {card.toCustomer}
      </div>
      <div className="text-[13px] text-base-600">{card.logisticsPartner}</div>
      <div
        className="mt-1 text-[13px] text-base-700"
        data-testid="wd-card-tally"
      >
        Required {card.unitsRequired} · Handed over {card.handedOver} · Not
        handed over {card.notHandedOver}
      </div>
      {remaining.length > 0 && (
        <div
          className="mt-0.5 text-label text-base-500"
          data-testid="wd-card-fact"
        >
          {remaining.length === 1
            ? `${remaining[0].unitId} still needs handover`
            : `${remaining.length} Units still need handover`}
        </div>
      )}
    </div>
  );
}
