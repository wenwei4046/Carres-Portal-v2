/**
 * THE TASKS PANEL LIST (owner 12 Oct 2026, 03 §8; owner's round 3 brief of
 * 13 Oct 2026, point 2): the day strip of the working week, `To do` ·
 * `Waiting` · `Done`, then one card per task under the party it is about.
 *
 * A card is its module icon, its title and ›, then one row per fact: the
 * label on the left, the value on the right. The whole card opens the task.
 * Amber is on the one row whose date or window has gone by, and nowhere else.
 * No tag and no button sits on a card.
 *
 * This file only draws. What is listed, counted and worded is `task-cards.ts`.
 */
import { useState } from "react";
import type { OperationWorkModule } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import Tabs from "@/components/kit/Tabs";
import { TASK_CARD_WORDS as W, TASK_TABS, emptyWord, type TaskCard, type TaskGroup, type TaskStrip, type TaskTab } from "./task-cards";

/** The module's icon, as the side menu draws it. */
export const TASK_MODULE_SYMBOL: Record<OperationWorkModule, string> = {
  orders: "receipt_long",
  purchasing: "shopping_cart",
  receiving: "warehouse",
  payment: "payments",
  delivery: "local_shipping",
  issue_tracker: "assignment_late",
};

function Card({ card, selected, onOpen }: { card: TaskCard; selected: boolean; onOpen: (card: TaskCard) => void }) {
  const body = (
    <>
      <span className="flex items-start gap-2">
        <MIcon name={TASK_MODULE_SYMBOL[card.module]} size={18} className="mt-px shrink-0 text-c-secondary" />
        <span className="min-w-0 flex-1 break-words text-body font-medium text-c-ink" data-testid="task-card-title">{card.title}</span>
        {card.work ? <MIcon name="chevron_right" size={18} className="shrink-0 text-c-muted" /> : null}
      </span>
      {card.rows.map((row) => (
        <span key={row.label} className="flex items-baseline justify-between gap-3 pl-[26px] text-meta" data-warn={row.warn || undefined}>
          <span className={`shrink-0 ${row.warn ? "text-c-warn-fg" : "text-c-secondary"}`}>{row.label}</span>
          <span className={`min-w-0 break-words text-right font-medium ${row.warn ? "text-c-warn-fg" : "text-c-ink"}`}>{row.value}</span>
        </span>
      ))}
    </>
  );
  const shape = "flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left";
  if (!card.work) return <div className={`${shape} bg-c-ground`} data-testid={`task-card-${card.id}`}>{body}</div>;
  return (
    <button type="button" onClick={() => onOpen(card)} aria-pressed={selected} data-testid={`task-card-${card.id}`} data-task-card
      className={`${shape} outline-none focus-visible:[outline:var(--c-focus)] ${selected ? "bg-c-select-bg" : "bg-c-ground hover:bg-c-hover"}`}>
      {body}
    </button>
  );
}

function Group({ group, lastTaskId, onOpen }: { group: TaskGroup; lastTaskId: string | null; onOpen: (card: TaskCard) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-c-card-border bg-white" data-testid={`task-group-${group.key}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left outline-none focus-visible:[outline:var(--c-focus)]">
        <span className="min-w-0 break-words text-body font-semibold text-c-ink">{group.name}</span>
        <span className="text-meta text-c-secondary tabular-nums" data-testid="task-group-count">{group.cards.length}</span>
        <span className="flex-1" />
        <MIcon name={open ? "expand_less" : "expand_more"} size={18} className="shrink-0 text-c-muted" />
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5 px-1.5 pb-1.5">
          {group.cards.map((card) => <Card key={card.id} card={card} selected={card.id === lastTaskId} onOpen={onOpen} />)}
        </div>
      ) : null}
    </section>
  );
}

export default function TaskList({ strip, chosen, today, onChoose, onWeek, tab, onTab, tabs, lastTaskId, onOpen }: {
  strip: TaskStrip;
  /** The chosen day, `YYYY-MM-DD`. */
  chosen: string;
  today: string;
  onChoose: (iso: string) => void;
  onWeek: (iso: string) => void;
  tab: TaskTab;
  onTab: (tab: TaskTab) => void;
  tabs: Record<TaskTab, { count: number; groups: TaskGroup[] }>;
  /** The task last opened: its card stays marked on return. */
  lastTaskId: string | null;
  onOpen: (card: TaskCard) => void;
}) {
  const shown = tabs[tab];
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="task-list">
      <div className="flex shrink-0 items-stretch gap-0.5 px-1.5 pb-1 pt-1.5" data-testid="task-strip">
        <button type="button" aria-label={W.previousWeek} title={W.previousWeek} onClick={() => onWeek(strip.previousWeek)}
          className="grid w-7 shrink-0 place-items-center rounded-lg text-c-muted hover:bg-c-hover">
          <MIcon name="chevron_left" size={18} />
        </button>
        <div role="tablist" aria-label={W.days} className="flex min-w-0 flex-1 items-stretch">
          {strip.days.map((d) => {
            const on = d.iso === chosen;
            return (
              <button key={d.iso} type="button" role="tab" aria-selected={on} title={d.holiday ?? undefined}
                aria-label={`${d.weekday} ${d.dayNumber}${d.count ? ` · ${d.count}` : ""}${d.holiday ? ` · ${d.holiday}` : ""}`}
                onClick={() => onChoose(d.iso)} data-testid={`task-day-${d.iso}`}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:[outline:var(--c-focus)] ${on ? "font-medium" : "font-normal hover:bg-c-hover"}`}>
                <span className={`text-label ${on ? "text-c-select-fg" : "text-c-secondary"}`}>{d.weekday}</span>
                <span className={`grid h-7 w-7 place-items-center rounded-full text-body tabular-nums ${
                  on ? "bg-c-select-fg text-white" : d.today ? "bg-c-select-bg text-c-select-fg" : "text-c-ink"}`} data-testid={d.today ? "today-circle" : undefined}>
                  {d.dayNumber}
                </span>
                <span className={`h-4 text-label tabular-nums ${d.late ? "text-c-warn-fg" : on ? "text-c-select-fg" : "text-c-secondary"}`} data-testid="task-day-count">
                  {d.count > 0 ? d.count : ""}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" aria-label={W.nextWeek} title={W.nextWeek} onClick={() => onWeek(strip.nextWeek)}
          className="grid w-7 shrink-0 place-items-center rounded-lg text-c-muted hover:bg-c-hover">
          <MIcon name="chevron_right" size={18} />
        </button>
      </div>
      <div className="shrink-0 px-1.5 pb-2" data-testid="task-tabs">
        <Tabs variant="segmented" fill label={W.show} value={tab} onValueChange={(value) => onTab(value as TaskTab)}
          tabs={TASK_TABS.map((key) => ({ value: key, label: `${W.tab[key]} ${tabs[key].count}` }))} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 pb-2" data-testid="tasks-scroll">
        {shown.groups.length === 0 ? (
          <p className="px-2 py-8 text-center text-body text-c-secondary" data-testid="task-list-empty">{emptyWord(tab, chosen === today)}</p>
        ) : shown.groups.map((group) => <Group key={group.key} group={group} lastTaskId={lastTaskId} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
