/**
 * ⭐ THE WORK MIDDLE CARD — owner-approved Work kit, Jess 2026-09-24
 * (`docs/workspace/MASTER.md` §5.5; density ruling 2026-09-25).
 *
 * ```
 *   ┌────────┬──────────────────────────────────────────┐
 *   │  TUE   │ [truck] DELIVERY · NETS                  │
 *   │   15   │ Not delivered                            │  ← problem, 15px, one line
 *   │ MISSED │ Arrange a new delivery date              │  ← action, 12px, one line
 *   │        ├──────────────────────────────────────────┤
 *   │        │ SO-1318                          [open]  │  ← the ONLY navigating control
 *   └────────┴──────────────────────────────────────────┘
 * ```
 *
 * Every card is exactly 104px (owner density ruling 2026-09-25): a 60px date
 * rail beside the content, a 28px footer; problem and action truncate, the
 * card never grows. Selecting the card stays on Work (the right panel shows it); only the
 * footer's open-record button leaves for the owning module. No coloured
 * corner, no shadow, no action arrow.
 *
 * PRESENTATION ONLY: the date status comes from the feed's timing bucket and
 * `generatedOn`; nothing here counts days.
 */
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { CircleAlert, ClipboardList, Lock, PackageCheck, Route, ShoppingBag, Wallet, type LucideIcon } from "lucide-react";
import type { OperationWorkModule } from "@carres/shared";
import Icon from "@/components/kit/Icon";
import type { WorkRow } from "../use-open-work";

/** The sidebar's own module faces (portal-nav.ts) — never a second family. */
const MODULE_ICON: Record<OperationWorkModule, LucideIcon> = {
  orders: ClipboardList,
  purchasing: ShoppingBag,
  receiving: PackageCheck,
  delivery: Route,
  payment: Wallet,
  issue_tracker: CircleAlert,
};

export type WorkDateStatus = "missed" | "today" | "upcoming" | "no_date";

const STATUS_WORD: Record<WorkDateStatus, string> = {
  missed: "Missed",
  today: "Today",
  /* COPY-STANDARD Work timing bans `Upcoming`: a future day is its own
     weekday + date, and needs no word beside it. The badge keeps its height
     (an empty slot) so the approved card geometry does not move. */
  upcoming: "",
  no_date: "No date",
};

const STATUS_CLASS: Record<WorkDateStatus, string> = {
  missed: "border-work-missed-line bg-work-missed-fill text-work-missed-ink",
  today: "border-kit-blue-6 bg-kit-blue-3 text-kit-blue-11",
  upcoming: "border-kit-slate-5 bg-kit-slate-3 text-work-muted",
  no_date: "border-kit-slate-6 bg-white text-work-muted",
};

export function workDateStatus(item: Pick<WorkRow, "timingBucket" | "dueIso">, today: string): WorkDateStatus {
  if (!item.dueIso) return "no_date";
  // A work date that has passed with the result still open is MISSED (kit
  // §Date-status badges), whether or not the feed counted its age.
  if (item.timingBucket === "overdue" || item.dueIso < today) return "missed";
  return item.dueIso === today ? "today" : "upcoming";
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Counted in UTC so the browser's time zone cannot move a date. */
function dateParts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: WEEKDAY[d.getUTCDay()],
    day: String(d.getUTCDate()),
    spoken: `${WEEKDAY_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9";

export default function WorkCard({
  item,
  moduleLabel,
  action,
  today,
  selected,
  onSelect,
  onOpenRecord,
  cover,
}: {
  /** `Covered for {normal owner}` / `Covered by {cover}` — the Global Owner
   *  Law's cover fact rides beside the document number, never in the action. */
  cover?: string | null;
  item: WorkRow;
  moduleLabel: string;
  /** The action sentence as the page spells it (Delivery's dated act). */
  action: string;
  /** The feed's `generatedOn`. */
  today: string;
  selected: boolean;
  onSelect: () => void;
  onOpenRecord: () => void;
}) {
  const status = workDateStatus(item, today);
  const parts = item.dueIso ? dateParts(item.dueIso) : null;
  const ModuleIcon = MODULE_ICON[item.module];
  const destination = `Open ${item.soRef} in ${moduleLabel}`;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${item.soRef}. ${item.problem}. ${action}. ${parts ? parts.spoken : "No working date"}${STATUS_WORD[status] ? ` · ${STATUS_WORD[status]}` : ""}`}
      data-testid={`work-row-${item.soRef}-${item.ruleKey}`}
      data-work-card
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`grid h-[104px] w-full shrink-0 cursor-pointer grid-cols-[60px_minmax(0,1fr)] overflow-hidden rounded-work border bg-white text-left transition-colors duration-[120ms] ease-out motion-reduce:transition-none focus-visible:outline-offset-[3px] ${FOCUS} ${selected ? "border-kit-blue-9 ring-1 ring-kit-blue-9" : "border-work-line hover:border-work-line-hover"}`}
    >
      <span className="flex min-w-0 flex-col items-center justify-center gap-1 border-r border-work-line px-1.5 py-2">
        {parts ? (
          <span aria-hidden className="grid h-11 w-12 grid-rows-[14px_24px] content-center gap-0.5 text-center" data-testid="work-card-date">
            <span className={`grid place-items-center text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] ${status === "today" ? "text-kit-blue-11" : "text-work-muted"}`}>
              {parts.weekday}
            </span>
            <span className="grid place-items-center text-[22px] font-semibold leading-6 text-work-ink">{parts.day}</span>
          </span>
        ) : (
          <span aria-hidden className="grid h-11 w-12 place-items-center text-work-muted">
            <Icon name="noDate" />
          </span>
        )}
        {STATUS_WORD[status] ? (
          <span className={`max-h-[17px] whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-[11px] tracking-[0.06em] ${STATUS_CLASS[status]}`}>
            {STATUS_WORD[status]}
          </span>
        ) : (
          <span aria-hidden className="h-[17px]" />
        )}
      </span>
      <span className="flex min-w-0 flex-col px-3 pt-2">
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-work-slate" data-testid="work-card-module">
          <ModuleIcon aria-hidden size={14} strokeWidth={1.8} className="shrink-0 text-kit-blue-9" />
          <span className="shrink-0">{moduleLabel}</span>
          {item.recipient ? (
            <span className="min-w-0 truncate text-[11px] font-medium leading-[14px] normal-case tracking-normal text-work-muted">· {item.recipient}</span>
          ) : null}
        </span>
        <span title={item.problem} className="mt-0.5 truncate text-[15px] font-semibold leading-5 text-work-ink" data-testid="work-card-problem">
          {item.problem}
        </span>
        <span title={action} className="truncate text-[12px] font-medium leading-4 text-work-slate" data-testid="work-card-action">
          {item.locked ? <Lock size={12} strokeWidth={2.5} className="-mt-0.5 mr-1 inline" aria-label="Held by Finance" /> : null}
          {action}
        </span>
        <span className="-mx-3 mt-auto flex h-7 shrink-0 items-center gap-2 border-t border-work-line pl-3 pr-2" data-testid="work-card-footer">
          {/* The number never shrinks; only the cover name may, and its tooltip
              keeps the whole sentence. */}
          <span title={cover ? `${item.soRef} · ${cover}` : item.soRef} className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-[11px] leading-4 text-work-muted">
            <span className={cover ? "shrink-0" : "min-w-0 truncate"}>{item.soRef}</span>
            {cover ? <span className="min-w-0 truncate text-kit-amber-11">· {cover}</span> : null}
          </span>
          <button
            type="button"
            aria-label={destination}
            title={destination}
            data-testid={`work-open-${item.soRef}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenRecord();
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className={`-my-0.5 ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-control text-work-muted hover:bg-kit-slate-3 hover:text-kit-blue-11 focus-visible:outline-offset-1 ${FOCUS}`}
          >
            <Icon name="open" size={14} />
          </button>
        </span>
      </span>
    </div>
  );
}

export type WorkListTab = "todo" | "waiting" | "completed";

const TAB_WORD: Record<WorkListTab, string> = { todo: "To do", waiting: "Waiting", completed: "Completed" };

/** The 36px segmented control over the card list. A tab changes the list;
 *  it never expands a card. A count the feed does not carry is not printed. */
export function WorkListTabs({
  value,
  counts,
  onChange,
}: {
  value: WorkListTab;
  counts: Partial<Record<WorkListTab, number>>;
  onChange: (tab: WorkListTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Work list" className="grid h-9 shrink-0 grid-cols-3 gap-0.5 rounded-[7px] bg-work-tabs p-[3px]">
      {(Object.keys(TAB_WORD) as WorkListTab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          data-testid={`work-tab-${tab}`}
          onClick={() => onChange(tab)}
          className={`rounded-[5px] text-[13px] font-semibold leading-[18px] transition-colors duration-[120ms] motion-reduce:transition-none ${FOCUS} focus-visible:outline-offset-1 ${value === tab ? "bg-white text-work-ink" : "text-work-muted hover:text-work-ink"}`}
        >
          {TAB_WORD[tab]}
          {counts[tab] !== undefined ? <span className="ml-1 font-medium tabular-nums text-work-muted">{counts[tab]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Three 104px neutral placeholders; no shimmer under reduced motion. */
export function WorkCardSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading work" data-testid="work-loading">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid h-[104px] grid-cols-[60px_minmax(0,1fr)] overflow-hidden rounded-work border border-work-line bg-white motion-safe:animate-pulse">
          <span className="border-r border-work-line" />
          <span className="flex flex-col gap-2 px-3 pt-2">
            <span className="h-3 w-24 rounded bg-kit-slate-3" />
            <span className="h-4 w-56 max-w-full rounded bg-kit-slate-3" />
            <span className="h-3 w-40 max-w-full rounded bg-kit-slate-3" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A white Work section: the ONE surface recipe on the grey canvas. */
export function WorkSection({ children, className = "", ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} className={`rounded-work border border-work-line bg-white ${className}`}>
      {children}
    </section>
  );
}
