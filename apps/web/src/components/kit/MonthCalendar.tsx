/**
 * MonthCalendar — the rail's fixed month view (owner correction 2026-09-06,
 * Receiving; `docs/ui/MASTER.md` kit registry).
 *
 * The SECOND governed calendar surface, and the same engine as the first:
 * §11 pins calendars to `react-day-picker`, so this is `DayPicker` in a
 * permanent 240px-rail skin rather than `DatePicker`'s popover skin. It is a
 * FILTER, not a date field: picking a day narrows the register beside it,
 * picking the same day again clears, and the month arrows move exactly one
 * month.
 *
 *   · Sunday stays VISIBLE (the operator must see the month whole) and wears
 *     the muted non-working state — the working calendar is Monday–Saturday.
 *   · A date with expected arrivals prints its COUNT under the day number —
 *     the number is the signal, never a colour alone — and the day button's
 *     aria-label says it in words.
 *   · The caption is the month spelled out (`SEPTEMBER 2026`), because the
 *     rail has no other line saying where the operator is.
 *
 * ISO in, ISO out (`YYYY-MM-DD` days, `YYYY-MM` months) — the same local-time
 * parsing discipline as `DatePicker`, so a day never shifts across a timezone.
 *
 * ⭐ TWO MONTHS, DISPLAY-ONLY (Receiving, owner instruction 2026-09-13). The
 * same engine renders `months={2}` — the visible month and the next — and
 * `selectable={false}` turns it into an EXPECTED-ARRIVAL DISPLAY: no day is a
 * filter, the counts are the whole point, and the ‹ › arrows still move exactly
 * one month while two complete months stay on screen. Today wears a THIN
 * OUTLINE, never a fill. A month with nothing expected says so in words under
 * its grid (`emptyWord`), and a day whose expected arrival is already behind
 * today may be marked `overdue` — the count stays the number, the word joins
 * the aria sentence, and the ink is the red the token law reserves for late.
 * Nothing here invents a date: every marker is the caller's own fact.
 */
import { DayPicker } from "react-day-picker";

/** `YYYY-MM` → a Date at LOCAL midnight of the 1st. */
function monthFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y || 2026, (m || 1) - 1, 1);
}

/** A Date → `YYYY-MM-DD`, read in LOCAL time so the day never shifts. */
function dayToIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const CLASSNAMES = {
  root: "text-body text-kit-slate-12",
  months: "flex flex-col gap-1",
  month: "flex flex-col gap-1",
  month_caption: "flex h-7 items-center justify-center",
  caption_label: "text-label font-semibold uppercase tracking-wide text-kit-slate-11",
  nav: "absolute inset-x-0 flex items-center justify-between",
  button_previous: "rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3",
  button_next: "rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3",
  chevron: "fill-current",
  month_grid: "w-full border-collapse",
  weekdays: "text-label text-kit-slate-11",
  weekday: "p-0.5 font-normal uppercase",
  week: "",
  day: "p-0 text-center align-top",
  // The day BUTTON's skin lives on the custom DayButton below, composed from
  // its modifiers — a td-level `[&>button]` override loses to the button's own
  // hover class and paints white text on the grey hover tint.
  day_button: "",
  /* Today: a THIN OUTLINE, never a fill — the outline says "you are here"
     without competing with a count or a selection (2026-09-13). */
  today: "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-kit-blue-9 [&>button]:font-medium",
  outside: "text-kit-slate-9",
  disabled: "opacity-40",
  hidden: "invisible",
};

/** The day button's own skin — precedence is explicit: the SELECTED day wears
 *  the governed blue; a muted non-working Sunday stays readable; everything
 *  else hovers grey. */
function dayButtonClass(
  mods: { selected?: boolean; nonworking?: boolean },
  selectable: boolean,
): string {
  return [
    "flex h-9 w-[30px] flex-col items-center justify-start rounded-control pt-0.5 text-body",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
    mods.selected
      ? "bg-kit-blue-9 text-white hover:brightness-95"
      : mods.nonworking
        ? `text-kit-slate-9${selectable ? " hover:bg-kit-slate-3" : " cursor-default"}`
        : `text-kit-slate-12${selectable ? " hover:bg-kit-slate-3" : " cursor-default"}`,
  ].join(" ");
}

/** `YYYY-MM` + n months → `YYYY-MM`. */
function addMonths(isoMonth: string, n: number): string {
  const d = monthFromIso(isoMonth);
  d.setMonth(d.getMonth() + n);
  return dayToIso(d).slice(0, 7);
}

function monthWord(isoMonth: string): string {
  return monthFromIso(isoMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function MonthCalendar({
  month,
  onMonthChange,
  selected = null,
  onSelect,
  markers = {},
  markerWord,
  testId,
  months = 1,
  selectable = true,
  overdue = {},
  emptyWord,
}: {
  /** The visible month, `YYYY-MM`. With `months={2}` it is the FIRST of two. */
  month: string;
  onMonthChange: (isoMonth: string) => void;
  /** The picked day (`YYYY-MM-DD`) or null. */
  selected?: string | null;
  /** Fires the picked ISO day; the SAME day fires null — pick-again clears.
   *  Omitted with `selectable={false}` — a display is not a filter. */
  onSelect?: (isoDay: string | null) => void;
  /** ISO day → how many arrivals that day expects. Zero/absent prints nothing. */
  markers?: Record<string, number>;
  /** What one marker counts, for the day's aria sentence — e.g.
   *  `expected supplier arrival`. Pluralised with a plain `s`. */
  markerWord?: string;
  testId?: string;
  /** How many complete months stand on screen — one (the rail filter) or two
   *  (the expected-arrival display). The arrows always move ONE month. */
  months?: 1 | 2;
  /** false = a DISPLAY: no day selects, no day is a filter. */
  selectable?: boolean;
  /** ISO day → true when that day's expected arrivals are already behind
   *  today. Word + ink, never ink alone. */
  overdue?: Record<string, boolean>;
  /** The sentence printed under a month that expects nothing, given its
   *  spelled-out name — e.g. `(m) => \`No supplier arrivals expected in ${m}\``.
   *  Absent = nothing printed. */
  emptyWord?: (monthWord: string) => string;
}) {
  const visibleMonths = months === 2 ? [month, addMonths(month, 1)] : [month];
  const emptyMonths = emptyWord
    ? visibleMonths.filter(
        (m) => !Object.entries(markers).some(([iso, n]) => n > 0 && iso.startsWith(m)),
      )
    : [];
  return (
    <div data-testid={testId} className="relative" data-months={months}>
      <DayPicker
        mode="single"
        month={monthFromIso(month)}
        numberOfMonths={months}
        onMonthChange={(m) => onMonthChange(dayToIso(m).slice(0, 7))}
        selected={
          selectable && selected
            ? new Date(
                Number(selected.slice(0, 4)),
                Number(selected.slice(5, 7)) - 1,
                Number(selected.slice(8, 10)),
              )
            : undefined
        }
        // DayPicker's OWN onSelect, not onDayClick: providing it makes the
        // selection CONTROLLED (react-day-picker v10 `useSingle` keeps its own
        // internal state otherwise, so a selected day set from OUTSIDE — a
        // register date door, a week arrow — would never repaint), and its
        // single-mode select already fires undefined on pick-again. A DISPLAY
        // passes a no-op so nothing is ever selected.
        onSelect={(day) => {
          if (!selectable) return;
          onSelect?.(day ? dayToIso(day) : null);
        }}
        // Sunday leads the row and stays visible — a muted non-working day,
        // never a hidden one.
        weekStartsOn={0}
        showOutsideDays={false}
        formatters={{
          formatCaption: (m: Date) =>
            m
              .toLocaleDateString("en-GB", { month: "long", year: "numeric" })
              .toUpperCase(),
          // The approved month sketch heads the columns SUN MON TUE WED THU
          // FRI SAT (Payment §17 review, 2026-09-07) — three letters, never
          // an ambiguous single character. The CSS uppercases.
          formatWeekdayName: (d: Date) =>
            d.toLocaleDateString("en-GB", { weekday: "short" }),
        }}
        modifiers={{ nonworking: { dayOfWeek: [0] } }}
        modifiersClassNames={{ nonworking: "[&>button]:text-kit-slate-9" }}
        classNames={CLASSNAMES}
        components={{
          DayButton: ({ day, modifiers, ...button }) => {
            const iso = dayToIso(day.date);
            const count = markers[iso] ?? 0;
            const late = count > 0 && Boolean(overdue[iso]);
            const word = markerWord ?? "expected supplier arrival";
            return (
              <button
                {...button}
                className={dayButtonClass(modifiers, selectable)}
                aria-label={
                  count > 0
                    ? `${iso} — ${count} ${word}${count === 1 ? "" : "s"}${late ? ", overdue" : ""}`
                    : iso
                }
                aria-pressed={selectable ? button["aria-pressed"] : undefined}
                data-testid={`month-day-${iso}`}
                data-overdue={late ? "true" : undefined}
              >
                <span className="leading-4">{day.date.getDate()}</span>
                {count > 0 ? (
                  <span
                    className={`text-label leading-3 tabular-nums${late ? " text-kit-red-11" : ""}`}
                    aria-hidden
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          },
        }}
      />
      {emptyMonths.map((m) => (
        <p
          key={m}
          className="mt-1 text-label text-kit-slate-9"
          data-testid={testId ? `${testId}-empty-${m}` : undefined}
        >
          {emptyWord!(monthWord(m))}
        </p>
      ))}
    </div>
  );
}
