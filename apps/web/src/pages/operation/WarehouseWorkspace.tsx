// design-standard: not-a-list-page — a dated Warehouse Schedule board
// (read-only projection of one direction's work), not a Register list.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ModuleHeader from "./components/ModuleHeader";
import WarehouseScheduleCard from "./WarehouseScheduleCard";
import { useWarehouseSchedule } from "./useWarehouseSchedule";
import type {
  WarehouseScheduleCard as ScheduleCard,
  WarehouseScheduleDirection,
} from "@carres/shared";
import {
  SCHEDULE_PAGE_WORD,
  cardsOnDate,
  dateHeadingPartsOf,
  emptyDayWordOf,
  undatedCards,
} from "./warehouse-schedule-view";
import { appTodayIso } from "@/lib/fmt-date";
/* §4.4 — the z ladder is reachable only through the kit, never by typing a
   number into a page. A sticky date heading is layer 1: chrome floating over
   its own rows, which is exactly what `Z_TABLE_HEADER` names. */
import { Z_TABLE_HEADER } from "@/components/kit/overlay-layer";

/**
 * WAREHOUSE — ARRIVAL SCHEDULE · PICKUP SCHEDULE (owner ruling 2026-09-14).
 *
 * Two INDEPENDENT pages, one component. The former combined Monitor is
 * superseded: it put both directions on one board, and an operator receiving
 * goods and an operator loading a lorry are two different people doing two
 * different jobs on two different sides of the building. `direction` is the
 * only thing that differs, so it is a prop rather than a fork — and because it
 * is a prop, there are NO internal direction tabs and no upper/lower split.
 *
 * The board is six equal date columns at ≥1280px and ONE selected date below
 * that width, with the same records and the same doors either way — a narrow
 * screen loses columns, never work.
 *
 * THE DATE SEQUENCE IS NOT OURS. `operatingDates` arrives from the governed
 * projection, which resolves the Site's own configured calendar. This page
 * applies no weekend rule, no holiday rule and no Sunday rule of its own: a
 * warehouse that receives on a Sunday is a real warehouse, and a hardcoded
 * off-day here would silently hide its work.
 */

/** Below this width six readable date columns cannot fit. */
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

/**
 * The date and Site the operator last stood on, remembered across the two
 * Schedule pages.
 *
 * Kept in module memory rather than in the URL because the sidebar rows are
 * plain addresses: without this, moving from Arrival Schedule to Pickup
 * Schedule would throw the operator back to today and to every Site, and they
 * would have to re-find the day they were working on. Deliberately NOT
 * persisted to storage — remembering a date within a session is a convenience;
 * restoring yesterday's date tomorrow morning would be a lie about today.
 */
const lastContext: { from?: string; date?: string; site?: string } = {};

/** Test seam only — a module-scoped memory would otherwise leak between tests. */
export function __resetScheduleContext() {
  delete lastContext.from;
  delete lastContext.date;
  delete lastContext.site;
}

export default function WarehouseWorkspace({
  direction = "arrival",
}: {
  direction?: WarehouseScheduleDirection;
}) {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();

  const from = params.get("from") ?? lastContext.from ?? today;
  const site = params.get("site") ?? lastContext.site ?? null;
  const isAgenda = useIsAgendaWidth();

  const schedule = useWarehouseSchedule({ direction, siteId: site, from });
  const dates = schedule.operatingDates;
  const selectedDate = params.get("date") ?? lastContext.date ?? dates[0] ?? from;

  /* Remember where the operator is standing, so the sibling page opens there
     instead of on today. Written in an effect, never during render. */
  useEffect(() => {
    lastContext.from = from;
    lastContext.date = selectedDate;
    if (site) lastContext.site = site;
  }, [from, selectedDate, site]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: false });
  }

  /** Previous/next moves the WINDOW on a board and ONE DATE on an agenda —
   *  both walk the governed operating dates, never a raw calendar day. */
  function step(delta: -1 | 1) {
    if (isAgenda) {
      const at = dates.indexOf(selectedDate);
      const next = at >= 0 ? dates[at + delta] : undefined;
      if (next) {
        setParam("date", next);
        return;
      }
      /* Off the end of the known window: move the window and let the
         projection say which date really operates next. */
      const anchor = delta === 1 ? dates[dates.length - 1] : dates[0];
      if (anchor) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("from", shiftIso(anchor, delta));
        nextParams.delete("date");
        setParams(nextParams);
      }
      return;
    }
    /* A BOARD MOVES A PAGE, NOT A DAY — and the two directions are not
       symmetric, because the projection only builds a window FORWARD from
       `from`.

       Forward is easy: start the day after the last date shown and the
       governed resolver returns the next six operating dates.

       Backward has to jump a whole window in one go. Anchoring on
       `first − 1 day` looked right and was the bug: the resolver would return
       six dates starting there, FIVE of which are already on screen, so
       `Previous` crawled one day at a time and an operator paging back a week
       would press it thirty times. Stepping back by the window's own calendar
       SPAN lands a full page earlier, and because the span already contains
       whatever closures the Site has, it neither overlaps nor skips. */
    if (delta === 1) {
      const last = dates[dates.length - 1];
      if (last) setParam("from", shiftIso(last, 1));
      return;
    }
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (!first) return;
    setParam("from", addDays(first, -spanDays(first, last ?? first)));
  }

  const word = SCHEDULE_PAGE_WORD[direction];
  const feedFailed = schedule.errors.length > 0;
  const stranded = useMemo(() => undatedCards(schedule.cards), [schedule.cards]);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-testid={`warehouse-${direction}-schedule`}
    >
      <ModuleHeader
        testId={`warehouse-${direction}-schedule-header`}
        word={word}
        docTitle={`${word} · Warehouse — Carres`}
        destinationHeader
      />

      <div className="flex items-center gap-3 border-b border-kit-slate-5 bg-white px-3 py-1.5">
        <div className="flex items-center gap-1" data-testid="ws-range">
          <button
            type="button"
            aria-label="Previous dates"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-kit-slate-5 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
            onClick={() => step(-1)}
            data-testid="ws-prev"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-0 px-1 text-body font-medium text-kit-slate-12">
            {isAgenda ? headingSentence(selectedDate) : rangeSentence(dates)}
          </span>
          <button
            type="button"
            aria-label="Next dates"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-kit-slate-5 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
            onClick={() => step(1)}
            data-testid="ws-next"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* A FAILED READ IS ANNOUNCED, ALWAYS — and it never replaces the cards
          that DID arrive. One direction can fail while real work stands on the
          board, so the banner sits above the board rather than instead of it.
          The empty-day sentence changes too: `Nothing arriving` is a promise
          this page has no right to make while a feed is broken. */}
      {feedFailed && (
        <div
          role="status"
          className="border-b border-kit-amber-6 bg-kit-amber-3 px-3 py-2 text-meta text-kit-amber-11"
          data-testid="ws-feed-error"
        >
          {schedule.errors.map((e) => e.message).join(" · ")}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {schedule.loading ? (
          <p className="p-4 text-body text-kit-slate-11">Loading…</p>
        ) : isAgenda ? (
          <AgendaDay
            date={selectedDate}
            cards={schedule.cards}
            direction={direction}
            feedFailed={feedFailed}
          />
        ) : (
          <ScheduleBoard
            dates={dates}
            cards={schedule.cards}
            direction={direction}
            feedFailed={feedFailed}
          />
        )}
      </div>

      {/* A card the board cannot PLACE is reported, never dropped: an
          arrangement with no date is not secretly today's work. */}
      {stranded.length > 0 && (
        <p
          className="border-t border-kit-slate-5 bg-white px-3 py-2 text-meta text-kit-slate-11"
          data-testid="ws-undated"
        >
          {stranded.length} with no date yet — not shown on any column.
        </p>
      )}
    </div>
  );
}

/**
 * THE BOARD — six equal date columns, ONE vertical scroll region.
 *
 * The date headings are `sticky` INSIDE that single scroll container rather
 * than sitting in a second container above it. That is the whole trick: two
 * containers would each need a scrollbar gutter, the two gutters would differ
 * by the width of a scrollbar, and every heading would sit a few pixels off
 * its own column. One container makes the gutter structurally equal, so no
 * width has to be hardcoded to compensate for one.
 *
 * No card gets its own scrollbar and no column gets a fixed height — a card
 * grows to hold every product line it has.
 */
export function ScheduleBoard({
  dates,
  cards,
  direction,
  feedFailed,
}: {
  dates: string[];
  cards: ScheduleCard[];
  direction: WarehouseScheduleDirection;
  feedFailed: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="ws-board">
      {/* `gridTemplateRows: auto 1fr` is load-bearing. Without it the two
          implicit rows SHARE the leftover height, the heading row stretches to
          half the viewport, and every column's first card starts hundreds of
          pixels below its own date. */}
      <div
        className="grid min-h-full"
        style={{
          gridTemplateColumns: `repeat(${dates.length || 1}, minmax(0, 1fr))`,
          gridTemplateRows: "auto 1fr",
        }}
      >
        {dates.map((date, i) => (
          <DateHeading key={`h-${date}`} date={date} first={i === 0} />
        ))}
        {dates.map((date, i) => (
          <div
            key={`c-${date}`}
            className={`flex flex-col gap-2 p-2 ${i === 0 ? "" : "border-l border-kit-slate-5"}`}
            data-testid={`ws-col-${date}`}
          >
            <DayCards
              date={date}
              cards={cards}
              direction={direction}
              feedFailed={feedFailed}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 24px/32px number between two 11px/14px labels; 12px/16px cell padding. */
function DateHeading({ date, first }: { date: string; first: boolean }) {
  const { weekday, day, month } = dateHeadingPartsOf(date);
  return (
    <div
      className={`sticky top-0 ${Z_TABLE_HEADER} border-b border-kit-slate-5 bg-white px-4 py-3 ${
        first ? "" : "border-l border-l-kit-slate-5"
      }`}
      data-testid={`ws-head-${date}`}
    >
      <div className="text-label text-kit-slate-11">{weekday}</div>
      <div className="text-page text-kit-slate-12">{day}</div>
      <div className="text-label text-kit-slate-11">{month}</div>
    </div>
  );
}

/** Narrow width — one selected date, the SAME cards and the same doors. */
function AgendaDay({
  date,
  cards,
  direction,
  feedFailed,
}: {
  date: string;
  cards: ScheduleCard[];
  direction: WarehouseScheduleDirection;
  feedFailed: boolean;
}) {
  const { weekday, day, month } = dateHeadingPartsOf(date);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="ws-agenda">
      <div
        className={`sticky top-0 ${Z_TABLE_HEADER} border-b border-kit-slate-5 bg-white px-4 py-3`}
        data-testid={`ws-head-${date}`}
      >
        <div className="text-label text-kit-slate-11">{weekday}</div>
        <div className="text-page text-kit-slate-12">{day}</div>
        <div className="text-label text-kit-slate-11">{month}</div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <DayCards date={date} cards={cards} direction={direction} feedFailed={feedFailed} />
      </div>
    </div>
  );
}

function DayCards({
  date,
  cards,
  direction,
  feedFailed,
}: {
  date: string;
  cards: ScheduleCard[];
  direction: WarehouseScheduleDirection;
  feedFailed: boolean;
}) {
  const day = cardsOnDate(cards, date);
  if (day.length === 0) {
    return (
      <p className="px-1 py-2 text-meta text-kit-slate-11" data-testid={`ws-empty-${date}`}>
        {emptyDayWordOf(direction, feedFailed)}
      </p>
    );
  }
  return (
    <>
      {day.map((card) => (
        <WarehouseScheduleCard key={card.id} card={card} />
      ))}
    </>
  );
}

/* ── small date helpers ─────────────────────────────────────────────────── */

/**
 * One calendar day either side of a known operating date. The PROJECTION
 * decides which dates actually operate; this only moves the window's anchor,
 * which is why it may safely land on a closed day — the next read returns the
 * governed window that starts at or after it.
 */
function shiftIso(iso: string, delta: -1 | 1): string {
  return addDays(iso, delta);
}

/** Calendar-day arithmetic on an ISO date, in LOCAL time — `new Date(iso)`
 *  would read a bare `YYYY-MM-DD` as UTC and land a day early in +08. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(y!, m! - 1, d! + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

/** How many CALENDAR days the shown window covers — six operating dates across
 *  a closed Sunday span seven. Minimum 1, so a one-date window still moves. */
function spanDays(first: string, last: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  const days = Math.round((toUtc(last) - toUtc(first)) / 86_400_000) + 1;
  return Math.max(1, days);
}

function headingSentence(iso: string): string {
  const { weekday, day, month } = dateHeadingPartsOf(iso);
  return `${weekday} ${day} ${month}`;
}

function rangeSentence(dates: string[]): string {
  if (dates.length === 0) return "—";
  return `${headingSentence(dates[0]!)} — ${headingSentence(dates[dates.length - 1]!)}`;
}
