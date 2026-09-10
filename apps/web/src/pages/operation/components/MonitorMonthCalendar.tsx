/**
 * THE RAIL'S FULL-MONTH CALENDAR — owner correction 2026-09-06.
 * `docs/delivery/MASTER.md` §8 · a page-level recipe, like `workspace-rail`.
 *
 * The ONE calendar primitive (`react-day-picker`, UI-KIT §11 — the kit's
 * DatePicker pins it) rendered INLINE at the top of Monitor's 240px rail,
 * wearing the kit's own exported skin with only the rail's size overrides:
 *
 *   - the complete current month, month arrows moving exactly ONE month;
 *   - the selected date in the governed blue selected state; today stays
 *     distinguishable (blue TEXT, never the filled selection);
 *   - Sundays — the non-operating day — visible but muted and not clickable;
 *   - a date that holds confirmed deliveries carries a DOT under its number
 *     (a mark by SHAPE, so colour is never the only communication);
 *   - locale-aware real date arithmetic — nothing is hard-coded to a month.
 *
 * Sunday-first weekday header, per the owner's own sketch (`SUN MON TUE …`).
 * Clicking a date is the CALLER's act — this component only reports the ISO
 * day; Monitor decides that it opens the operating week containing it.
 */
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { CALENDAR_CLASSNAMES } from "@/components/kit/DatePicker";

/** `YYYY-MM-DD` → a Date at LOCAL midnight (the kit's own trick — a bare
 *  `new Date(iso)` is midnight UTC and shows the wrong day in the Americas). */
function fromIso(iso: string): Date | undefined {
  if (!iso || iso.length < 10) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

/** A Date → `YYYY-MM-DD`, read in LOCAL time so the day never shifts. */
function toIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/* The rail is 216px inside its padding: seven 28px cells fit; the kit's 32px
   popover cells do not. Size is the ONLY thing overridden — every colour and
   state stays the kit skin's. The month caption wears the rail's own group-
   heading grammar (SEPTEMBER 2026), per the owner's sketch. */
const RAIL_CALENDAR_CLASSNAMES = {
  ...CALENDAR_CLASSNAMES,
  month_caption: "flex items-center justify-center h-7",
  caption_label:
    "text-label font-semibold uppercase tracking-wide text-kit-slate-9",
  /* pr-9 keeps the next-month arrow clear of the rail's own Hide-filters
     button, which floats at the header's top-right corner. */
  nav: "absolute inset-x-0 top-0 flex items-center justify-between pr-9",
  root: `${CALENDAR_CLASSNAMES.root} relative`,
  weekday: "p-0.5 font-normal uppercase",
  day_button:
    "relative h-7 w-7 rounded-control text-meta text-kit-slate-12 hover:bg-kit-slate-3 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
} as const;

export default function MonitorMonthCalendar({
  selectedIso,
  onSelect,
  /** ISO dates that hold at least one confirmed delivery — the dot days. */
  workDayIsos,
  testId,
}: {
  selectedIso: string;
  onSelect: (iso: string) => void;
  workDayIsos: readonly string[];
  testId?: string;
}) {
  const selected = fromIso(selectedIso);
  /* The month FOLLOWS the selection (a rail click, an arrow week-jump, a
     shared URL), while the month arrows still browse freely in between. */
  const [month, setMonth] = useState<Date | undefined>(selected);
  useEffect(() => {
    setMonth(fromIso(selectedIso));
  }, [selectedIso]);

  const workDays = useMemo(
    () => workDayIsos.map(fromIso).filter((d): d is Date => Boolean(d)),
    [workDayIsos],
  );

  return (
    <div data-testid={testId}>
      <DayPicker
        mode="single"
        required
        selected={selected}
        month={month}
        onMonthChange={setMonth}
        onSelect={(day) => {
          if (day) onSelect(toIso(day));
        }}
        /* Sunday is the non-operating day: visible, muted, not a choice. */
        disabled={{ dayOfWeek: [0] }}
        weekStartsOn={0}
        classNames={RAIL_CALENDAR_CLASSNAMES}
        modifiers={{ hasWork: workDays }}
        modifiersClassNames={{
          /* The dot rides the day BUTTON so it inverts with the selection. */
          hasWork:
            "[&>button]:after:absolute [&>button]:after:bottom-0.5 " +
            "[&>button]:after:left-1/2 [&>button]:after:-translate-x-1/2 " +
            "[&>button]:after:h-1 [&>button]:after:w-1 " +
            "[&>button]:after:rounded-full [&>button]:after:bg-current " +
            "[&>button]:after:content-['']",
        }}
        labels={{
          labelPrevious: () => "Previous month",
          labelNext: () => "Next month",
        }}
      />
    </div>
  );
}
