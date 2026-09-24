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
import { useState } from "react";
import Icon, { type IconName } from "@/components/kit/Icon";
import Popover from "@/components/kit/Popover";
import type { WorkRailDates } from "./work-model";

const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kit-blue-9";

function actions(count: number): string {
  return count > 0 ? ` · ${count} ${count === 1 ? "action" : "actions"}` : "";
}

function Count({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span data-rail-count className="shrink-0 text-meta tabular-nums text-kit-slate-11">
      {value}
    </span>
  );
}

function Section({ title, icon, right, framed = true, children }: { title: string; icon: IconName; right?: ReactNode; framed?: boolean; children: ReactNode }) {
  const id = `work-rail-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={framed ? "rounded-card border border-kit-slate-5 bg-white" : "bg-white"}>
      <div className="mx-3 flex h-12 items-center gap-2 border-b border-kit-slate-5">
        <h2 id={id} className="flex items-center gap-2 text-strong text-kit-blue-11">
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

export function WorkDateSection({
  dates,
  selected,
  onSelect,
  onWeek,
  framed = true,
}: {
  dates: WorkRailDates;
  /** `missed` · `no_date` · one `YYYY-MM-DD`, or null when none is chosen. */
  selected: string | null;
  onSelect: (key: string) => void;
  onWeek: (monday: string) => void;
  /** False inside the narrow popover, whose own surface is the frame. */
  framed?: boolean;
}) {
  const arrow = `grid h-7 w-7 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12 ${FOCUS_RING}`;
  return (
    <Section
      title="Date"
      icon="date"
      framed={framed}
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
        <Option
          key={day.iso}
          selected={selected === day.iso}
          // `Today` is a marker beside the printed date (COPY-STANDARD §Dates);
          // on screen the blue badge carries it, so only the name says it.
          label={`${day.label}${day.holiday ? ` · ${day.holiday}` : ""}${day.today ? " · Today" : ""}${actions(day.count)}`}
          onClick={() => onSelect(day.iso)}
          lead={<DayBadge dayNumber={day.dayNumber} weekday={day.weekday} today={day.today} />}
          count={day.count}
        >
          {day.holiday}
        </Option>
      ))}
      {dates.noDate > 0 || selected === "no_date" ? (
        <Option
          selected={selected === "no_date"}
          label={`No working date${actions(dates.noDate)}`}
          onClick={() => onSelect("no_date")}
          lead={<IconBox name="noDate" />}
          count={dates.noDate}
        >
          No working date
        </Option>
      ) : null}
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
    <Section title="Module" icon="modules">
      <Option selected={selected === "all"} label={`All modules${actions(total)}`} onClick={() => onSelect("all")} count={total}>
        All modules
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

/**
 * ⭐ THE NARROW DATE FILTER (owner correction, Jess 2026-09-24). Below a 960px
 * viewport the Date filter is never a permanent panel: one 40px trigger —
 * `Date: {selection} {count}` — opens the same Date section in a popover, and
 * choosing `Missed`, a date or `No working date` closes it. The week arrows
 * keep it open. Module stays in the toolbar's Select.
 */
export function WorkDateTrigger({
  dates,
  selected,
  selection,
  count,
  onSelect,
  onWeek,
}: {
  dates: WorkRailDates;
  selected: string | null;
  /** What the list shows now — `Missed`, `Wed, 16 Sep`, `No working date`. */
  selection: string;
  /** The rows in the list. */
  count: number;
  onSelect: (key: string) => void;
  onWeek: (monday: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="work-date-bar" className="border-b border-kit-slate-5 bg-white px-3 py-2">
      <Popover
        label="Date"
        open={open}
        onOpenChange={setOpen}
        trigger={(
          <button
            type="button"
            aria-label={`Date: ${selection}${actions(count)}`}
            className={`flex h-10 w-full items-center gap-2 rounded-control border border-kit-slate-6 bg-white px-3 text-left text-body text-kit-slate-12 hover:bg-kit-slate-3 ${FOCUS_RING}`}
          >
            <span className="shrink-0 text-kit-blue-11"><Icon name="date" /></span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-kit-slate-11">Date: </span>
              <span className="font-semibold">{selection}</span>
            </span>
            <Count value={count} />
            <span className="shrink-0 text-kit-slate-11"><Icon name="expand" /></span>
          </button>
        )}
      >
        <div className="-m-4 w-[300px] max-w-[calc(100vw-24px)] overflow-hidden rounded-card">
          <WorkDateSection
            dates={dates}
            selected={selected}
            framed={false}
            onWeek={onWeek}
            onSelect={(key) => {
              onSelect(key);
              setOpen(false);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

/** The rail: the two white sections on the light-grey canvas. */
export default function WorkRail({ children }: { children: ReactNode }) {
  return <div data-testid="work-rail" className="flex min-h-full flex-col gap-5 bg-kit-canvas p-3">{children}</div>;
}
