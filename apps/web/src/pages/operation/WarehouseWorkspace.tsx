// design-standard: not-a-list-page — a dated Warehouse Schedule board
// (read-only projection of one direction's work), not a Register list.
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  undatedSummaryWordOf,
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
 * THE BOARD KEEPS EVERY CONFIGURED WORKING DAY AT EVERY WIDTH (owner ruling
 * 2026-09-16). It previously collapsed to a single selected date below 1280px.
 * That was measured as a loss, not an adaptation: at 703px the operator saw
 * one column and five days of committed work simply vanished, with no control
 * on screen saying they existed. A warehouse week is the unit of the job — the
 * operator plans Thursday's lorry while standing on Tuesday — so the week is
 * never silently truncated to fit a screen.
 *
 * The narrow screen now SCROLLS to the sixth day instead of hiding it. Each
 * date column holds a 240px floor, so six days make a 1440px canvas that
 * overflows a 703px viewport horizontally and is reached by scrolling. A
 * column narrower than 240px cannot hold a supplier name beside its date
 * badge, which is why the floor is a floor and not a preference.
 *
 * THE DATE SEQUENCE IS NOT OURS. `operatingDates` arrives from the governed
 * projection, which resolves the Site's own configured calendar. This page
 * applies no weekend rule, no holiday rule and no Sunday rule of its own: a
 * warehouse that receives on a Sunday is a real warehouse, and a hardcoded
 * off-day here would silently hide its work.
 */

/**
 * THE COLUMN FLOOR — the one number the whole correction rests on.
 *
 * 240px is the width at which a date column still reads: the card header puts
 * a supplier name, a date-status pill and the open door on one line, and the
 * name keeps its `flex-[1_1_6rem]` (96px) floor before the pill and door wrap.
 * Below 240px the name is squeezed into a gutter and the operator loses the
 * identity of the work. The canvas is `columns × 240px`, so the SIX dates a
 * Site normally operates make 1440px — wider than a 703px screen, and reached
 * by scrolling rather than by deleting days.
 */
const COLUMN_MIN_PX = 240;

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

  /** Previous/next moves the WINDOW — a whole week of governed operating
   *  dates, never a raw calendar day, and never one date at a narrow width. */
  function step(delta: -1 | 1) {
    /* A BOARD MOVES A PAGE, NOT A DAY, and the two directions are not
       symmetric.

       Forward is easy: start the day after the last date shown and the
       governed resolver returns the next six operating dates.

       Backward is NOT a subtraction and this page no longer tries to make it
       one. Stepping back by the window's calendar span looked right and was
       wrong: measured on production, `Mon 21 – Sat 26` went back to
       `Tue 15 – Mon 21`, repeating a column, because the Sunday inside the
       earlier stretch made six calendar days cover only five operating ones.
       Only the layer holding the Site configuration can count operating dates
       backwards, so it does, and this page just uses the answer. */
    if (delta === 1) {
      const last = dates[dates.length - 1];
      if (last) setParam("from", shiftIso(last, 1));
      return;
    }
    setParam("from", schedule.previousFrom);
  }

  const word = SCHEDULE_PAGE_WORD[direction];
  const feedFailed = schedule.errors.length > 0;
  const stranded = useMemo(() => undatedCards(schedule.cards), [schedule.cards]);
  const earlier = schedule.cards.filter((card) => card.overdue && card.date && card.date < (dates[0] ?? selectedDate));
  const offDays = schedule.cards.filter((card) => card.date && dates.length > 0 &&
    card.date >= dates[0] && card.date <= dates[dates.length - 1] && !dates.includes(card.date));

  return (
    <div
      /* `min-w-0` here as well as on the scroller: this page root is itself a
         flex child of the shell, and a flex child's default `min-width:auto`
         is the classic way a wide descendant escapes its frame. The scroller
         contains the canvas today; this keeps that true if the shell ever
         wraps this page in another flex row. */
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
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
            aria-label="Previous week"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-kit-slate-5 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
            onClick={() => step(-1)}
            data-testid="ws-prev"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-0 px-1 text-body font-medium text-kit-slate-12">
            {rangeSentence(dates)}
          </span>
          {/* TODAY — the way back. A board that has been paged three windows
              forward gives the operator no anchor, and the day they actually
              work is the day they most need to reach. Clearing the parameters
              is the whole action: the projection recomputes the window from
              today, so this button holds no date of its own. */}
          <button
            type="button"
            className="ml-1 inline-flex h-7 items-center rounded-control border border-kit-slate-5 px-2 text-meta text-kit-slate-12 hover:bg-hovertint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("from");
              next.delete("date");
              __resetScheduleContext();
              setParams(next);
            }}
            data-testid="ws-today"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next week"
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
        ) : (
          <ScheduleBoard
            dates={dates}
            cards={schedule.cards}
            direction={direction}
            feedFailed={feedFailed}
            today={today}
          />
        )}
      </div>

      {/* A card the board cannot PLACE is reported, never dropped: an
          arrangement with no date is not secretly today's work — and a count
          the operator cannot open is a dead end. It OPENS IN PLACE rather than
          linking to a filtered register, because the register cannot ask for
          "undated" without inventing a filter word, while these exact records
          are already in this page's own result. */}
      <UnplacedWork cards={earlier} label="Earlier work still overdue" testId="ws-earlier" />
      <UnplacedWork cards={offDays} label="Scheduled on other dates in this period" testId="ws-off-days" />
      {stranded.length > 0 && (
        <details
          className="border-t border-kit-slate-5 bg-white px-3 py-2"
          data-testid="ws-undated"
        >
          <summary className="cursor-pointer text-meta text-kit-slate-11 marker:text-kit-slate-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9">
            {undatedSummaryWordOf(stranded.length)}
          </summary>
          <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto" data-testid="ws-undated-list">
            {stranded.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-meta text-kit-slate-12">
                  {c.partyName ?? "Party not recorded"}
                </span>
                {c.openHref ? (
                  <Link
                    to={c.openHref}
                    className="text-meta text-kit-blue-11 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-blue-9"
                    data-testid="ws-undated-open"
                  >
                    {c.sourceRef}
                  </Link>
                ) : (
                  <span className="text-meta text-kit-slate-11">{c.sourceRef}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Preserve the recorded date even when the operating-date board cannot place it. */
function UnplacedWork({ cards, label, testId }: { cards: ScheduleCard[]; label: string; testId: string }) {
  if (cards.length === 0) return null;
  return <details className="border-t border-kit-slate-5 bg-white px-3 py-2" data-testid={testId}>
    <summary className="cursor-pointer text-meta text-kit-slate-11">{label} · {cards.length}</summary>
    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
      {cards.map((card) => <li key={card.id} className="flex flex-wrap items-baseline gap-x-2 text-meta">
        <span className={card.overdue ? "text-kit-amber-11" : "text-kit-slate-11"}>{card.date ? headingSentence(card.date) : "Date not recorded"}</span>
        <span>{card.partyName ?? "Party not recorded"}</span>
        {card.openHref ? <Link className="text-kit-blue-11 hover:underline" to={card.openHref}>{card.sourceRef}</Link> : <span>{card.sourceRef}</span>}
      </li>)}
    </ul>
  </details>;
}

/**
 * THE BOARD — every configured date, ONE scroll region that moves BOTH ways.
 *
 * The date headings are `sticky` INSIDE that single scroll container rather
 * than sitting in a second container above it. That is the whole trick: two
 * containers would each need a scrollbar gutter, the two gutters would differ
 * by the width of a scrollbar, and every heading would sit a few pixels off
 * its own column. One container makes the gutter structurally equal, so no
 * width has to be hardcoded to compensate for one.
 *
 * It now carries the HORIZONTAL axis for the same reason. Because the heading
 * and its column are two cells of ONE grid inside ONE scroller, scrolling
 * sideways moves them together and a heading cannot drift off its own cards —
 * which is exactly what a separate sticky header strip would have done. The
 * vertical `sticky top-0` survives that unchanged.
 *
 * `min-w-0` on the scroller is load-bearing: without it this flex child adopts
 * its 1440px content as its own floor, the page shell grows to match, and the
 * WHOLE PORTAL scrolls sideways — sidebar and header dragged along with it —
 * instead of the calendar scrolling inside its frame.
 *
 * No card gets its own scrollbar and no column gets a fixed height — a card
 * grows to hold every product line it has.
 */
export function ScheduleBoard({
  dates,
  cards,
  direction,
  feedFailed,
  today,
}: {
  dates: string[];
  cards: ScheduleCard[];
  direction: WarehouseScheduleDirection;
  feedFailed: boolean;
  /** Marked when it falls inside the window; absent is simply not marked. */
  today?: string;
}) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-testid="ws-board">
      {/* `gridTemplateRows: auto 1fr` is load-bearing. Without it the two
          implicit rows SHARE the leftover height, the heading row stretches to
          half the viewport, and every column's first card starts hundreds of
          pixels below its own date.

          `minWidth` is what actually produces the scroll. `minmax(240px, 1fr)`
          alone sets a TRACK floor, but the grid box itself would still be the
          width of its container, and a sticky heading measured against a box
          narrower than its own tracks paints its background short. Stating the
          canvas width — columns × 240px, so 1440px at six days — makes the box
          and its tracks the same object, and the parent's `overflow-auto` then
          has something real to scroll. */}
      <div
        className="grid min-h-full"
        style={{
          gridTemplateColumns: `repeat(${dates.length || 1}, minmax(${COLUMN_MIN_PX}px, 1fr))`,
          gridTemplateRows: "auto 1fr",
          minWidth: `${(dates.length || 1) * COLUMN_MIN_PX}px`,
        }}
        data-testid="ws-canvas"
      >
        {dates.map((date, i) => (
          <DateHeading
            key={`h-${date}`}
            date={date}
            first={i === 0}
            isToday={date === today}
          />
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

/**
 * 64px tall · 12px/16px padding · the day NUMBER on the left at 24px/32px,
 * weekday and month stacked to its right at 11px/14px, 8px between them.
 *
 * The three-row stack this replaces (weekday over number over month) was 84px
 * of chrome standing on top of every column, and it read as three separate
 * facts. One glance should answer "which day is this" — the number carries
 * that, and the two small labels qualify it without competing for the height
 * the CARDS need. Every size here is a governed token: `text-page` is exactly
 * 24px/32px at weight 600 and `text-label` exactly 11px/14px, so nothing in
 * this heading is a hand-typed pixel.
 */
function DateHeading({
  date,
  first,
  isToday = false,
}: {
  date: string;
  first: boolean;
  isToday?: boolean;
}) {
  const { weekday, day, month } = dateHeadingPartsOf(date);
  return (
    <div
      className={`sticky top-0 ${Z_TABLE_HEADER} flex h-16 items-center gap-2 border-b bg-white px-4 py-3 ${
        first ? "" : "border-l border-l-kit-slate-5"
      } ${
        /* TODAY is marked on the heading, never on the column body — a tinted
           column would compete with the cards standing in it, and the cards
           are the work. A 2px underline and the blue ink are enough to find
           it in one glance across six columns. */
        isToday
          ? "border-b-2 border-b-kit-blue-9"
          : "border-b-kit-slate-5"
      }`}
      data-testid={`ws-head-${date}`}
      data-today={isToday ? "yes" : undefined}
    >
      <div
        className={`text-page ${isToday ? "text-kit-blue-11" : "text-kit-slate-12"}`}
        data-testid={`ws-head-day-${date}`}
      >
        {day}
      </div>
      {/* `min-w-0` so a long month abbreviation wraps inside its own stack
          rather than pushing the number out of a 240px column. */}
      <div className="min-w-0">
        <div className={`text-label ${isToday ? "text-kit-blue-11" : "text-kit-slate-11"}`}>
          {isToday ? "Today" : weekday}
        </div>
        <div className={`text-label ${isToday ? "text-kit-blue-11" : "text-kit-slate-11"}`}>
          {month}
        </div>
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


function headingSentence(iso: string): string {
  const { weekday, day, month } = dateHeadingPartsOf(iso);
  return `${weekday} ${day} ${month}`;
}

function rangeSentence(dates: string[]): string {
  if (dates.length === 0) return "—";
  return `${headingSentence(dates[0]!)} — ${headingSentence(dates[dates.length - 1]!)}`;
}
