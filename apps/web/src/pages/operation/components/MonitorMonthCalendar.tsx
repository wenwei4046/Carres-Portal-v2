/**
 * THE RAIL'S FULL-MONTH CALENDAR — owner correction 2026-09-06.
 * `docs/delivery/MASTER.md` §8 · a page-level recipe, like `workspace-rail`.
 *
 * The ONE calendar primitive (`react-day-picker`, UI-KIT §11 — the kit's
 * DatePicker pins it) rendered INLINE at the top of Monitor's 240px rail,
 * wearing the kit's own exported skin with only the rail's size overrides:
 *
 *   - TWO consecutive months stacked, current above next (owner ruling
 *     2026-09-10), from the kit skin's own `months: flex flex-col`; ONE pair
 *     of arrows moves BOTH by exactly one month (`pagedNavigation` stays off,
 *     and the skin's `nav` is absolutely placed over the first caption);
 *   - the selected date in the governed blue selected state; today stays
 *     distinguishable with a blue ring;
 *   - Sundays — the non-operating day — visible but muted and not clickable;
 *   - customer deliveries carry a circle and transfers a square, with a
 *     visible legend; counts follow the active schedule filters;
 *   - the current operating week has a subtle gray ground;
 *   - locale-aware real date arithmetic — nothing is hard-coded to a month.
 *
 * Sunday-first weekday header, per the owner's own sketch (`SUN MON TUE …`).
 * Clicking a date is the CALLER's act — this component only reports the ISO
 * day; Monitor decides that it opens the operating week containing it.
 */
import { useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { CALENDAR_CLASSNAMES, fromIso, toIso } from "@/components/kit/DatePicker";
import { fmtDate } from "@/lib/fmt-date";
import { MONITOR_COPY, operatingWeekOf, scheduleSplitSentence, type MonthDayCounts } from "../delivery-monitor";

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
  today: "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-kit-blue-9",
  day_button:
    "relative h-7 w-7 rounded-control text-meta text-kit-slate-12 hover:bg-kit-slate-3 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
} as const;

export default function MonitorMonthCalendar({
  selectedIso,
  onSelect,
  countsByDay,
  todayIso,
  testId,
}: {
  selectedIso: string;
  onSelect: (iso: string) => void;
  countsByDay: ReadonlyMap<string, MonthDayCounts>;
  todayIso: string;
  testId?: string;
}) {
  const selected = fromIso(selectedIso);
  /* The month FOLLOWS the selection (a rail click, an arrow week-jump, a
     shared URL), while the month arrows still browse freely in between. */
  const [month, setMonth] = useState<Date | undefined>(selected);
  useEffect(() => {
    setMonth(fromIso(selectedIso));
  }, [selectedIso]);

  const marks = useMemo(() => {
    const deliveries: Date[] = [];
    const transfers: Date[] = [];
    for (const [iso, counts] of countsByDay) {
      const date = fromIso(iso);
      if (!date) continue;
      if (counts.deliveries > 0) deliveries.push(date);
      if (counts.transfers > 0) transfers.push(date);
    }
    return { deliveries, transfers };
  }, [countsByDay]);
  const currentWeek = operatingWeekOf(todayIso).map(fromIso).filter((d): d is Date => Boolean(d));

  return (
    <div data-testid={testId}>
      <DayPicker
        mode="single"
        required
        /* Current month above next month. One arrow pair, one month per step. */
        numberOfMonths={2}
        selected={selected}
        today={fromIso(todayIso)}
        month={month}
        onMonthChange={setMonth}
        onSelect={(day) => {
          if (day) onSelect(toIso(day));
        }}
        /* Sunday is the non-operating day: visible, muted, not a choice. */
        disabled={{ dayOfWeek: [0] }}
        weekStartsOn={0}
        classNames={RAIL_CALENDAR_CLASSNAMES}
        modifiers={{ hasDelivery: marks.deliveries, hasTransfer: marks.transfers, currentWeek }}
        modifiersClassNames={{
          /* The dot rides the day BUTTON so it inverts with the selection. */
          hasDelivery:
            "[&>button]:after:absolute [&>button]:after:bottom-0.5 " +
            "[&>button]:after:left-1/3 [&>button]:after:-translate-x-1/2 " +
            "[&>button]:after:h-1 [&>button]:after:w-1 " +
            "[&>button]:after:rounded-full [&>button]:after:bg-current " +
            "[&>button]:after:content-['']",
          hasTransfer:
            "[&>button]:before:absolute [&>button]:before:bottom-0.5 " +
            "[&>button]:before:left-2/3 [&>button]:before:-translate-x-1/2 " +
            "[&>button]:before:h-1 [&>button]:before:w-1 [&>button]:before:bg-current " +
            "[&>button]:before:content-['']",
          currentWeek: "bg-kit-slate-3",
        }}
        labels={{
          labelPrevious: () => "Previous month",
          labelNext: () => "Next month",
          labelDayButton: (day, modifiers) => {
            const counts = countsByDay.get(toIso(day)) ?? { deliveries: 0, transfers: 0 };
            return `${fmtDate(toIso(day))}, ${scheduleSplitSentence(counts)}${modifiers.today ? ", today" : ""}${modifiers.selected ? ", selected" : ""}`;
          },
        }}
      />
      <div className="flex items-center justify-center gap-3 pt-1 text-label text-kit-slate-11">
        <span className="inline-flex items-center gap-1"><span aria-hidden className="h-1 w-1 rounded-full bg-current" />{MONITOR_COPY.cellDeliveries}</span>
        <span className="inline-flex items-center gap-1"><span aria-hidden className="h-1 w-1 bg-current" />{MONITOR_COPY.cellTransfers}</span>
      </div>
    </div>
  );
}
