/**
 * ⭐ THE WORK LEFT RAIL — owner-approved UI, Jess 2026-09-24.
 *
 * ```
 *   ┌ 📅 Date ─────────── ‹ Sep 2026 › ┐   ┌ ▦ Module ───────────────┐
 *   │ ⟲   Missed                     3 │   │ All modules            7 │
 *   │ [14 MON]                         │   │ Sales Orders           1 │
 *   │ [16 WED] Malaysia Day          4 │   │ Delivery               2 │
 *   │ [17 THU]  ← solid blue = today 1 │   │ …                        │
 *   │ ⊘   No working date            2 │   └──────────────────────────┘
 *   └──────────────────────────────────┘
 * ```
 *
 * Light-grey canvas, white sections, blue icon + title over an inset divider,
 * no shadow. Today is the solid-blue badge and is never written as a word on
 * screen; the chosen row is the pale-blue full row. The two states are
 * independent. A zero count is not printed. Module rows carry a name and a
 * count only.
 *
 * PRESENTATION ONLY (Workspace MASTER §5.5 names `WorkDayNav` as the page's
 * date piece): every date, holiday and count arrives worked out from
 * `work-model.ts`; nothing here computes a date, a bucket or a count.
 */
import type { ReactNode } from "react";
import type { OperationWorkModule } from "@carres/shared";
import Icon, { type IconName } from "@/components/kit/Icon";
import type { WorkRailDates } from "./work-model";

const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kit-blue-9";

function actions(count: number): string {
  return count > 0 ? ` · ${count} ${count === 1 ? "action" : "actions"}` : "";
}

/* Every row prints its number, `0` included (owner review 2026-09-25,
   items 19/22): a missing number read as "not counted". */
function Count({ value }: { value: number }) {
  return (
    <span data-rail-count className="shrink-0 text-meta tabular-nums text-kit-slate-11">
      {value}
    </span>
  );
}

function Section({ title, icon, right, children }: { title: string; icon: IconName; right?: ReactNode; children: ReactNode }) {
  const id = `work-rail-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="shrink-0 rounded-work border border-work-line bg-white">
      <div className="mx-3 flex h-12 items-center gap-2 border-b border-kit-slate-5">
        <h2 id={id} className="flex items-center gap-2 text-strong text-kit-slate-12">
          <Icon name={icon} />
          {title}
        </h2>
        {right ? <div className="ml-auto flex items-center gap-1">{right}</div> : null}
      </div>
      <div className="flex flex-col gap-0.5 p-1.5">{children}</div>
    </section>
  );
}

function Option({
  selected,
  label,
  onClick,
  lead,
  children,
  count,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  lead?: ReactNode;
  children?: ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={`flex min-h-10 w-full items-center gap-2 rounded-control px-2 py-[3px] text-left text-body text-kit-slate-12 ${FOCUS_RING} ${selected ? "bg-kit-blue-3 font-semibold" : "hover:bg-kit-slate-3"}`}
    >
      {lead}
      <span className="min-w-0 flex-1 break-words">{children}</span>
      <Count value={count} />
    </button>
  );
}

function IconBox({ name }: { name: IconName }) {
  return (
    <span aria-hidden className="grid h-[34px] w-[34px] shrink-0 place-items-center text-kit-slate-11">
      <Icon name={name} />
    </span>
  );
}

/** The 34 × 34 calendar badge: the day number over the weekday, one box. */
function DayBadge({ dayNumber, weekday, today }: { dayNumber: string; weekday: string; today: boolean }) {
  return (
    <span
      aria-hidden
      data-rail-badge
      data-today={today ? "true" : undefined}
      className={`grid h-[34px] w-[34px] shrink-0 grid-rows-[20px_14px] overflow-hidden rounded-control border text-center ${today ? "border-kit-blue-9 bg-kit-blue-9 text-white" : "border-kit-slate-6 bg-white text-kit-slate-12"}`}
    >
      <span className="pt-0.5 text-body font-semibold leading-[18px]">{dayNumber}</span>
      <span className={`border-t text-label leading-[13px] ${today ? "border-kit-blue-6 text-white" : "border-kit-slate-6 text-kit-slate-11"}`}>
        {weekday}
      </span>
    </span>
  );
}

/** One chip of the compact strip (below 768px): 40px tall, the count beside
 *  the word, the chosen one blue — never a full-width row. */
function Chip({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-control ${FOCUS_RING} ${selected ? "border-kit-blue-9 bg-kit-blue-3 font-semibold text-kit-slate-12" : "border-kit-slate-4 bg-white text-kit-slate-12 hover:bg-kit-slate-3"}`}
    >
      {children}
    </button>
  );
}

export function WorkDateSection({
  dates,
  selected,
  onSelect,
  onWeek,
  compact = false,
}: {
  dates: WorkRailDates;
  /** `missed` · `no_date` · one `YYYY-MM-DD`, or null when none is chosen. */
  selected: string | null;
  onSelect: (key: string) => void;
  onWeek: (monday: string) => void;
  /** Below 768px: one horizontal strip of chips instead of the rows (owner
   *  review 2026-09-25 item 2). */
  compact?: boolean;
}) {
  const arrow = `grid h-7 w-7 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12 ${FOCUS_RING}`;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-work border border-work-line bg-white p-2.5" data-testid="work-date-strip">
        <Chip selected={selected === "missed"} label={`Missed${actions(dates.missed)}`} onClick={() => onSelect("missed")}>
          <Icon name="history" size={16} />Missed<Count value={dates.missed} />
        </Chip>
        {dates.days.map((day) => (
          <span key={day.iso} className={`inline-flex items-center gap-2 ${day.weekStart ? "ml-2 border-l border-kit-slate-5 pl-2" : ""}`}>
            <Chip
              selected={selected === day.iso}
              label={`${day.label}${day.holiday ? ` · ${day.holiday}` : ""}${day.today ? " · Today" : ""}${actions(day.count)}`}
              onClick={() => onSelect(day.iso)}
            >
              <span className="tabular-nums">{day.dayNumber}</span>
              <span className="text-label text-kit-slate-11">{day.weekday}</span>
              {day.today ? <span className="text-label text-kit-blue-11">Today</span> : null}
              <Count value={day.count} />
            </Chip>
          </span>
        ))}
        <Chip selected={selected === "no_date"} label={`No working date${actions(dates.noDate)}`} onClick={() => onSelect("no_date")}>
          <Icon name="noDate" size={16} />No date<Count value={dates.noDate} />
        </Chip>
        <span className="ml-auto inline-flex items-center gap-1">
          <button type="button" aria-label="Previous week" className={arrow} onClick={() => onWeek(dates.previousWeek)}><Icon name="previous" /></button>
          <span className="text-meta font-medium text-kit-slate-11">{dates.month}</span>
          <button type="button" aria-label="Next week" className={arrow} onClick={() => onWeek(dates.nextWeek)}><Icon name="forward" /></button>
        </span>
      </div>
    );
  }
  return (
    <Section
      title="Date"
      icon="date"
      right={(
        <>
          <button type="button" aria-label="Previous week" className={arrow} onClick={() => onWeek(dates.previousWeek)}>
            <Icon name="previous" />
          </button>
          <span data-testid="work-rail-month" className="text-meta font-medium text-kit-slate-11">{dates.month}</span>
          <button type="button" aria-label="Next week" className={arrow} onClick={() => onWeek(dates.nextWeek)}>
            <Icon name="forward" />
          </button>
        </>
      )}
    >
      <Option
        selected={selected === "missed"}
        label={`Missed${actions(dates.missed)}`}
        onClick={() => onSelect("missed")}
        lead={<IconBox name="history" />}
        count={dates.missed}
      >
        Missed
      </Option>
      {dates.days.map((day) => (
        <div key={day.iso} className={day.weekStart ? "mt-1 border-t border-kit-slate-5 pt-1" : undefined}>
          <Option
            selected={selected === day.iso}
            // `Today` is printed beside the day (owner review 2026-09-25 item 21).
            label={`${day.label}${day.holiday ? ` · ${day.holiday}` : ""}${day.today ? " · Today" : ""}${actions(day.count)}`}
            onClick={() => onSelect(day.iso)}
            lead={<DayBadge dayNumber={day.dayNumber} weekday={day.weekday} today={day.today} />}
            count={day.count}
          >
            {[day.today ? "Today" : null, day.holiday].filter(Boolean).join(" · ")}
          </Option>
        </div>
      ))}
      {/* Always shown, `0` included (owner review 2026-09-25 item 22). */}
      <Option
        selected={selected === "no_date"}
        label={`No working date${actions(dates.noDate)}`}
        onClick={() => onSelect("no_date")}
        lead={<IconBox name="noDate" />}
        count={dates.noDate}
      >
        No working date
      </Option>
    </Section>
  );
}

export function WorkModuleSection({
  modules,
  counts,
  total,
  selected,
  onSelect,
}: {
  modules: readonly { key: OperationWorkModule; label: string }[];
  counts: Record<OperationWorkModule, number>;
  /** The rows of the chosen Date — `All modules` always equals the list. */
  total: number;
  selected: OperationWorkModule | "all";
  onSelect: (module: OperationWorkModule | "all") => void;
}) {
  return (
    <Section title="Page" icon="modules">
      <Option selected={selected === "all"} label={`All pages${actions(total)}`} onClick={() => onSelect("all")} count={total}>
        All pages
      </Option>
      {modules.map((module) => (
        <Option
          key={module.key}
          selected={selected === module.key}
          label={`${module.label}${actions(counts[module.key])}`}
          onClick={() => onSelect(module.key)}
          count={counts[module.key]}
        >
          {module.label}
        </Option>
      ))}
    </Section>
  );
}

/** The rail: two independent white sections straight on the page canvas,
 *  16px apart — never wrapped in a card of their own (owner correction
 *  2026-09-24). */
export default function WorkRail({ children }: { children: ReactNode }) {
  return <div data-testid="work-rail" className="flex flex-col gap-4">{children}</div>;
}
