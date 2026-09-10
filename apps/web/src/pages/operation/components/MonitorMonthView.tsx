/**
 * THE MONTH VIEW — owner correction 2026-09-07.
 * `docs/delivery/MASTER.md` §8 · a page-level recipe, like `MonitorMonthCalendar`.
 *
 * A capacity overview, never a card wall: the ONE calendar primitive the kit
 * pins (`react-day-picker`, UI-KIT §11) rendered full-width in the right
 * workspace, each date printing its COMPACT counts in the rail row's own
 * grammar — the label, then the number:
 *
 *     14
 *     Deliveries            5
 *     Exceptions            1      (only when > 0, the warning tone)
 *     No logistics picked   2      (only when > 0)
 *
 * The numbers are the signal — never colour alone — and the day button's aria
 * sentence says the same three facts in words. Sunday stays visible in the
 * muted non-working state and takes no click. Clicking a date is the CALLER's
 * act — this component only reports the ISO day; Monitor opens its `Day`.
 * The page toolbar owns the month arrows, so navigation is hidden here.
 */
import { DayPicker } from "react-day-picker";
import { fmtDate } from "@/lib/fmt-date";
import { MONITOR_COPY, monthDaySentence, type MonthDayCounts } from "../delivery-monitor";

/** `YYYY-MM-DD` → a Date at LOCAL midnight (the kit's own trick). */
function fromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

/** A Date → `YYYY-MM-DD`, read in LOCAL time so the day never shifts. */
function toIso(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const CLASSNAMES = {
  root: "text-body text-kit-slate-12",
  months: "flex flex-col",
  month: "flex flex-col",
  /* The caption is the toolbar's job (it prints the month beside the arrows). */
  month_caption: "hidden",
  caption_label: "hidden",
  nav: "hidden",
  month_grid: "w-full table-fixed border-collapse",
  weekdays: "text-label text-kit-slate-11",
  weekday: "border-b border-kit-slate-5 py-1.5 text-center font-normal uppercase",
  week: "",
  day: "border border-kit-slate-4 p-0 align-top",
  day_button: "",
  today: "[&>button>span:first-child]:font-semibold [&>button>span:first-child]:text-kit-blue-11",
  outside: "invisible",
  disabled: "",
  hidden: "invisible",
};

function Line({ label, count, warning }: { label: string; count: number; warning?: boolean }) {
  return (
    <span
      className={`flex w-full items-start justify-between gap-1 text-label leading-4 ${
        warning ? "text-kit-amber-11" : "text-kit-slate-11"
      }`}
    >
      <span className="min-w-0 break-words text-left">{label}</span>
      <span className="shrink-0 tabular-nums">{count}</span>
    </span>
  );
}

export default function MonitorMonthView({
  monthOfIso,
  selectedIso,
  countsByDay,
  onSelect,
  testId,
}: {
  /** Any ISO day inside the month to draw. */
  monthOfIso: string;
  selectedIso: string;
  countsByDay: ReadonlyMap<string, MonthDayCounts>;
  onSelect: (iso: string) => void;
  testId?: string;
}) {
  const selected = fromIso(selectedIso);
  return (
    <div data-testid={testId} className="min-h-0 flex-1 overflow-y-auto bg-white p-2">
      <DayPicker
        mode="single"
        required
        selected={selected}
        month={fromIso(monthOfIso)}
        onSelect={(day) => {
          if (day) onSelect(toIso(day));
        }}
        hideNavigation
        showOutsideDays={false}
        /* Sunday is the non-operating day: visible, muted, not a choice. */
        disabled={{ dayOfWeek: [0] }}
        weekStartsOn={0}
        classNames={CLASSNAMES}
        formatters={{
          formatWeekdayName: (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short" }),
        }}
        modifiers={{ nonworking: { dayOfWeek: [0] } }}
        components={{
          DayButton: ({ day, modifiers, ...button }) => {
            const iso = toIso(day.date);
            const counts = countsByDay.get(iso);
            const sentence = monthDaySentence(fmtDate(iso), counts);
            const quiet = !counts || counts.deliveries === 0;
            return (
              <button
                {...button}
                className={[
                  "flex min-h-[88px] w-full flex-col items-start gap-0.5 px-1.5 py-1 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9",
                  modifiers.selected
                    ? "bg-kit-blue-3"
                    : modifiers.nonworking
                      ? "text-kit-slate-9"
                      : "hover:bg-kit-slate-3",
                ].join(" ")}
                aria-label={sentence}
                title={sentence}
                data-testid={`delivery-monitor-month-day-${iso}`}
              >
                <span className={`text-body leading-5 ${quiet ? "text-kit-slate-9" : ""}`}>
                  {day.date.getDate()}
                </span>
                {counts && counts.deliveries > 0 ? (
                  <>
                    <Line label={MONITOR_COPY.cellDeliveries} count={counts.deliveries} />
                    {counts.exceptions > 0 ? (
                      <Line label={MONITOR_COPY.cellExceptions} count={counts.exceptions} warning />
                    ) : null}
                    {counts.noLogistics > 0 ? (
                      <Line label={MONITOR_COPY.noLogistics} count={counts.noLogistics} />
                    ) : null}
                  </>
                ) : null}
              </button>
            );
          },
        }}
      />
    </div>
  );
}
