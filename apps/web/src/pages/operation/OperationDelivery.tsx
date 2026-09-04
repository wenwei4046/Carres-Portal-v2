/**
 * DELIVERY MONITOR — the internal Operations calendar.
 * `CARD-2026-09-04-delivery-01-monitor-calendar` · `docs/delivery/MASTER.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT THIS PAGE REPLACED, AND WHY
 *
 * The previous Delivery destination was one DataGrid register that mixed the
 * planning READ with two writes (`Assign logistics` · `Edit Delivery` bulk
 * actions). The approved four-page map splits those jobs:
 *
 *     Monitor          plan/read delivery days, open the right record  ← THIS
 *     Delivery Orders  find and finish formal DO records
 *     Delivery Order   read one formal DO and its evidence/history
 *     Edit Delivery    write arrangement/result/evidence
 *
 * Monitor answers the operator's morning question — *what customer deliveries
 * are planned across the next operating days, and which existing record do I
 * open to continue the work?* A register answers "find me a row"; a calendar
 * answers "what is Friday carrying", and the operator's question is the
 * second one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SHAPE
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Monitor                                              🔔 ❓ ⚙  (50px)      │
 * ├────────── 240px ────────────────┬────────────────────────────────────────┤
 * │ DELIVERY SCHEDULE               │ ‹  Thu, 3 Sep – Wed, 9 Sep  ›   Search │
 * │   Calendar                   12 ├──────┬──────┬──────┬──────┬─────┬─────┤
 * │   No confirmed date          88 │ Thu 3│ Fri 4│ Sat 5│ Mon 7│ Tue │ Wed │
 * │   Overdue                     1 │ card │ card │      │ card │     │     │
 * │ NEEDS CHECKING                  │      │      │      │      │     │     │
 * │ REGION · LOGISTICS              │      │      │      │      │     │     │
 * └─────────────────────────────────┴──────┴──────┴──────┴──────┴─────┴─────┘
 * ```
 *
 * Six OPERATING days, Sunday omitted. No hour axis — the planned window is
 * text, card height never implies duration, and the stack order inside a day
 * (window start → customer → stable id) IS the timeline.
 *
 * ── THE RAIL IS PAGE-OWNED FILTERING, NOT NAVIGATION ────────────────────────
 *
 * The governed 240px `RailGroup`/`RailItem` recipe (`docs/ui/MASTER.md`). Four
 * groups, single-pick each, and they COMBINE. Each group's counts are computed
 * over the cards the OTHER groups already narrowed (Architecture Law D), and
 * every choice rides the URL (`?start= · ?schedule= · ?checking= · ?region= ·
 * ?logistics= · ?q=`) so a refresh, a share and Back all land on the same
 * calendar.
 *
 * ── MONITOR WRITES NOTHING ──────────────────────────────────────────────────
 *
 * Every card is ONE accessible link: an issued DO opens the formal Delivery
 * Order; a scope without one says `No delivery order yet` and opens Edit
 * Delivery — Monitor never issues the document (the governed gate does), never
 * assigns, uploads, records a result or drags a reschedule. A planned window
 * ending proves nothing and paints nothing.
 *
 * ── MOBILE IS A ONE-DAY LIST ────────────────────────────────────────────────
 *
 * Below the phone breakpoint the visible range becomes one selected operating
 * day and the rail becomes a drawer. Same cards, same filters, same href
 * arithmetic — never the six-column grid squeezed into a phone.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DeliveryWorkStatusKind, OrderActionTone } from "@carres/shared";
import { fmtDate, appTodayIso } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import {
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useDeliveryArrangements,
  useOperationOrders,
  type DeliveryArrangementRow,
} from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import { RailGroup, RailItem } from "./components/workspace-rail";
import {
  MONITOR_COPY,
  MONITOR_DAYS,
  buildDeliveryMonitorCards,
  buildMonitorRails,
  defaultMonitorWindowStart,
  filterDeliveryMonitorCards,
  groupCardsByDay,
  monitorCardHref,
  nextOperatingWindowStart,
  operatingDaysFrom,
  previousOperatingWindowStart,
  type DeliveryMonitorCard,
  type DeliveryMonitorFilters,
} from "./delivery-monitor";

/**
 * The OPERATIONAL ladder's tones (owner ruling 2026-08-24), unchanged from the
 * planning workspace: waiting is the normal state of most cards, so only a
 * recorded exception spends the attention colour.
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

/**
 * ONE CARD, ONE LINK. No nested button, no competing click target: the card
 * IS the door, and where it opens is the module's one href arithmetic.
 */
function MonitorCard({ card }: { card: DeliveryMonitorCard }) {
  return (
    <Link
      to={monitorCardHref(card)}
      data-testid={`delivery-monitor-card-${card.scopeId}`}
      className="block min-h-11 rounded-control border border-kit-slate-5 bg-white shadow-sm hover:border-kit-slate-7 hover:bg-hovertint"
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

export default function OperationDelivery() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  const today = appTodayIso();
  const isPhone = useIsPhoneWidth();

  /* ── THE URL IS THE STATE ──────────────────────────────────────────────── */
  const start = searchParams.get("start") ?? defaultMonitorWindowStart(today);
  /* The phone's one selected day. A Sunday in the URL lands on the next
     operating day rather than an empty page nobody planned. */
  const day = operatingDaysFrom(searchParams.get("day") ?? today, 1)[0]!;

  const scheduleParam = searchParams.get("schedule");
  const checkingParam = searchParams.get("checking");
  const filters: DeliveryMonitorFilters = useMemo(
    () => ({
      schedule:
        scheduleParam === "no_confirmed_date" || scheduleParam === "overdue"
          ? scheduleParam
          : "calendar",
      checking:
        checkingParam === "failed" ||
        checkingParam === "delivered_proof_required" ||
        checkingParam === "waiting_warehouse"
          ? checkingParam
          : null,
      region: searchParams.get("region"),
      logisticsPartnerId: searchParams.get("logistics"),
      search: searchParams.get("q") ?? "",
      todayIso: today,
    }),
    [scheduleParam, checkingParam, searchParams, today],
  );

  const setParam = (key: string, value: string | null, replace = false) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace });
  };
  /* Picking again unpicks — the rail's own toggle grammar. */
  const toggleParam = (key: string, value: string) =>
    setParam(key, searchParams.get(key) === value ? null : value);

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
  const visible = useMemo(
    () => filterDeliveryMonitorCards(cards, filters, visibleDays),
    [cards, filters, visibleDays],
  );
  const byDay = useMemo(() => groupCardsByDay(visible, visibleDays), [visible, visibleDays]);

  const isError = ordersQ.isError || docsQ.isError;
  const isLoading = ordersQ.isLoading || docsQ.isLoading;

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

  const rail = (
    <>
      <RailGroup title={MONITOR_COPY.railSchedule}>
        <RailItem
          label={MONITOR_COPY.calendar}
          count={rails.schedule.calendar}
          active={filters.schedule === "calendar"}
          onClick={() => setParam("schedule", null)}
          testId="delivery-monitor-schedule-calendar"
        />
        <RailItem
          label={MONITOR_COPY.noConfirmedDate}
          count={rails.schedule.noConfirmedDate}
          active={filters.schedule === "no_confirmed_date"}
          onClick={() => toggleParam("schedule", "no_confirmed_date")}
          testId="delivery-monitor-schedule-no_confirmed_date"
        />
        <RailItem
          label={MONITOR_COPY.overdue}
          count={rails.schedule.overdue}
          active={filters.schedule === "overdue"}
          onClick={() => toggleParam("schedule", "overdue")}
          testId="delivery-monitor-schedule-overdue"
        />
      </RailGroup>
      <RailGroup title={MONITOR_COPY.railChecking}>
        <RailItem
          label={MONITOR_COPY.failed}
          count={rails.checking.failed}
          active={filters.checking === "failed"}
          onClick={() => toggleParam("checking", "failed")}
          testId="delivery-monitor-checking-failed"
        />
        <RailItem
          label={MONITOR_COPY.deliveredProofRequired}
          count={rails.checking.deliveredProofRequired}
          active={filters.checking === "delivered_proof_required"}
          onClick={() => toggleParam("checking", "delivered_proof_required")}
          testId="delivery-monitor-checking-proof"
        />
        <RailItem
          label={MONITOR_COPY.waitingWarehouse}
          count={rails.checking.waitingWarehouse}
          active={filters.checking === "waiting_warehouse"}
          onClick={() => toggleParam("checking", "waiting_warehouse")}
          testId="delivery-monitor-checking-warehouse"
        />
      </RailGroup>
      <RailGroup title={MONITOR_COPY.railRegion}>
        {rails.regions.map((item) => (
          <RailItem
            key={item.key}
            label={item.label}
            count={item.count}
            active={filters.region === item.key}
            onClick={() => toggleParam("region", item.key)}
            testId={`delivery-monitor-region-${item.key}`}
          />
        ))}
      </RailGroup>
      <RailGroup title={MONITOR_COPY.railLogistics}>
        {rails.logistics.map((item) => (
          <RailItem
            key={item.key}
            label={item.label}
            count={item.count}
            active={filters.logisticsPartnerId === item.key}
            onClick={() => toggleParam("logistics", item.key)}
            testId={`delivery-monitor-logistics-${item.key}`}
          />
        ))}
      </RailGroup>
    </>
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

  /* A dateless or overdue pick has no day column to stand in — those cards
     render as ONE flat list under the same toolbar, same card, same door. */
  const flatList = (
    <div className="flex flex-col gap-1.5 p-2" data-testid="delivery-monitor-flat-list">
      {visible.length === 0 ? (
        <div className="px-2 py-3 text-body text-kit-slate-9">{MONITOR_COPY.emptyDay}</div>
      ) : (
        visible.map((card) => <MonitorCard key={card.scopeId} card={card} />)
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="operation-delivery-monitor">
      <ModuleHeader
        testId="delivery-monitor-destination-header"
        word={MONITOR_COPY.page}
        docTitle={MONITOR_COPY.docTitle}
        destinationHeader
        right={
          <button
            type="button"
            className="xl:hidden h-8 rounded-control border border-kit-slate-6 bg-white px-3 text-body font-medium text-kit-slate-11 hover:bg-hovertint"
            aria-controls="delivery-monitor-rail"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? MONITOR_COPY.hideFilters : MONITOR_COPY.showFilters}
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          id="delivery-monitor-rail"
          className={`${filtersOpen ? "flex" : "hidden"} xl:flex w-[240px] min-h-0 shrink-0 flex-col gap-4 overflow-y-auto border-r border-kit-slate-5 bg-white px-3 py-3`}
          data-testid="delivery-monitor-rail"
        >
          {rail}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* The toolbar: where the window stands, and the one search. */}
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-3">
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
              value={filters.search}
              placeholder={MONITOR_COPY.search}
              className="ml-auto h-8 w-full max-w-60 rounded-control border border-kit-slate-6 bg-white px-2.5 text-body text-kit-slate-12 placeholder:text-kit-slate-9"
              onChange={(e) => setParam("q", e.target.value, true)}
            />
          </div>

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
          ) : isPhone ? (
            /* ── THE ONE-DAY LIST — never the grid squeezed into a phone. ── */
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="delivery-monitor-daily">
              <div className="sticky top-0 z-10 border-b border-kit-slate-5 bg-white px-3 py-2 text-body font-semibold text-kit-slate-12">
                {fmtDate(day)}
              </div>
              {filters.schedule === "calendar" ? dayCards(day) : flatList}
            </div>
          ) : filters.schedule === "calendar" ? (
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
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={isLoading}>
              {flatList}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
