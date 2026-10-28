/**
 * TASKS — the shell's Tasks panel: one list, then one task, in the SAME right
 * area (owner direction 2026-10-05; the list is the kit's since the owner's
 * round 3 brief of 13 Oct 2026, 03 §8).
 *
 * The list (`TaskList`):
 *   ‹  Mon 12   Tue (13) 4   Wed 14   Thu 15   Fri 16 1  ›     the working week
 *   [ To do 4 ] [ Waiting 0 ] [ Done 0 ]
 *   Nice Future  1                                        ⌃   one card per task,
 *     🛒 Ask Nice Future when the goods will arrive      ›    under its party
 *        PO No                              PO-260926-4016
 *        Deadline                       Fri, 9 Oct · 4 days late   (amber)
 *
 * A card opens the ONE task view in the same area with `‹ All tasks`: the
 * task's own title and facts, then `Steps` (that module's own panel) ·
 * `Route` · `History` · `Files` (`TaskFrame`). The left page never changes.
 * The list stays mounted underneath, so its day, tab and scroll are exactly
 * where they were on return. The module's own success words show in the dark
 * toast, with `Next: {party}` when another task of the same kind waits.
 * Leaving a task with unsaved input (‹ All tasks, ×, another rail door) asks
 * `Leave without saving?`.
 */
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ListTodo, X } from "lucide-react";
import type { OperationWorkModule } from "@carres/shared";
import Icon from "@/components/kit/Icon";
import MIcon from "@/components/carres/MIcon";
import { fmtDate } from "@/lib/fmt-date";
import { useOpenWorkSet, type WorkRow } from "../use-open-work";
import { usePoWindowFacts } from "./use-po-window-facts";
import { TASK_MODULE_WORD, TASKS_WORDS as T, myTasks } from "./tasks-model";
import { TaskOpenContext } from "./TaskFrame";
import TaskList from "./TaskList";
import { TASK_CARD_WORDS, taskStrip, taskTabs, type TaskCard, type TaskTab } from "./task-cards";
import { useTaskDesk } from "./use-task-desk";
import { panelFor } from "./work-panels";

/** The same weekday in the week that starts on `monday` (both `YYYY-MM-DD`). */
export function sameWeekday(monday: string, chosen: string): string {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const offset = (at(chosen).getUTCDay() + 6) % 7;
  const day = at(monday); day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

export default function TasksArea({ onClose, fill = false, bare = false }: {
  onClose: () => void;
  fill?: boolean;
  /** Inside the shell's Tasks card, which draws the title row itself. */
  bare?: boolean;
}) {
  const work = useOpenWorkSet();
  const { items, completed, myUserId, hasData, error, refreshFailed, lastUpdatedAt, unhealthySources, generatedOn, retry } = work;
  const today = generatedOn;
  const mine = useMemo(() => myTasks(items, myUserId), [items, myUserId]);
  /* The chosen day opens on today; the strip shows the week that holds it,
     and moving the week chooses the same weekday there. */
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const chosen = chosenDay ?? today;
  const [tab, setTab] = useState<TaskTab>("todo");
  const windows = usePoWindowFacts(mine.some((r) => r.source.object.kind === "po_window"));
  const strip = useMemo(() => (today ? taskStrip(mine, today, chosen) : null), [mine, today, chosen]);
  const tabs = useMemo(() => (today ? taskTabs(mine, completed, myUserId, today, chosen,
    (row) => (row.source.object.kind === "po_window" ? windows.get(row.source.object.id) ?? null : null)) : null),
  [mine, completed, myUserId, today, chosen, windows]);
  const factsOf = useCallback((row: WorkRow) => (row.source.object.kind === "po_window" ? windows.get(row.source.object.id) ?? null : null), [windows]);
  /* The open work of the tab the task was opened from, in the list's order. */
  const order = useMemo(() => (tabs ? tabs[tab].groups.flatMap((group) => group.cards) : []), [tabs, tab]);
  const desk = useTaskDesk({ order, factsOf, onLeave: onClose });
  const { task, lastTaskId, openTask, host, opened, taskOrder, taskAt, guard } = desk;

  /* ── states ───────────────────────────────────────────────────────────── */
  const failedBanner = (error || refreshFailed || unhealthySources.length > 0) ? (
    <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-lg bg-c-err-bg px-3 py-2 text-meta text-c-err-fg" data-testid="tasks-failed">
      <Icon name="late" size={14} />
      <div className="min-w-0 flex-1">
        <p>
          {T.failed}
          {lastUpdatedAt !== null ? ` · ${T.lastUpdated(fmtDate(new Date(lastUpdatedAt).toISOString(), { timeOnly: true }))}` : ""}
        </p>
        {unhealthySources.map((s) => <p key={s.key}>{T.couldNotRefresh(TASK_MODULE_WORD[s.key as OperationWorkModule] ?? s.key)}</p>)}
      </div>
      <button type="button" onClick={retry} className="shrink-0 font-semibold text-c-ink hover:underline">{T.tryAgain}</button>
    </div>
  ) : null;

  const loadingList = (
    <div aria-busy="true" data-testid="tasks-loading">
      <span className="sr-only" role="status">Loading tasks</span>
      {["", "MON", "TUE", "WED"].map((d, i) => (
        <div key={i} className="flex min-h-[52px] items-center gap-3 border-b border-kit-slate-4 px-3">
          <span className="w-8 text-label text-kit-slate-9">{d}</span>
          <span className="h-3 w-24 animate-pulse rounded bg-kit-slate-3" />
          <span className="ml-auto h-5 w-5 animate-pulse rounded-full bg-kit-slate-3" />
        </div>
      ))}
    </div>
  );

  const listView = (
    <div className={`${task ? "hidden" : "flex"} min-h-0 flex-1 flex-col`} hidden={Boolean(task)} data-testid="tasks-list">
      <div className={`${bare ? "hidden" : "flex"} h-12 shrink-0 items-center gap-2 border-b border-kit-slate-4 px-3`}>
        <ListTodo size={18} aria-hidden className="text-kit-slate-11" />
        <h2 className="flex-1 text-strong text-kit-slate-12">{T.title}</h2>
        <button type="button" onClick={() => guard(onClose)} className="rounded p-1 text-kit-slate-11 hover:bg-kit-slate-3" aria-label="Close panel" data-testid="tasks-close">
          <X size={16} />
        </button>
      </div>
      {failedBanner}
      {!hasData ? (error ? null : loadingList) : strip && tabs ? (
        <TaskList
          strip={strip} chosen={chosen} today={today}
          onChoose={setChosenDay}
          onWeek={(monday) => setChosenDay(sameWeekday(monday, chosen))}
          tab={tab} onTab={setTab} tabs={tabs}
          lastTaskId={lastTaskId}
          onOpen={(card: TaskCard) => { if (card.work) openTask(card.work); }}
        />
      ) : null}
    </div>
  );

  const taskView = task ? (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="tasks-task"
      data-task={task.id}
      onInput={desk.markDirty}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-kit-slate-4 px-3">
        <button type="button" onClick={desk.back} className="flex items-center gap-1.5 text-meta font-medium text-c-ink hover:underline" data-testid="tasks-back">
          <ArrowLeft size={14} aria-hidden />
          {TASK_CARD_WORDS.allTasks}
        </button>
        <span className="flex-1" />
        {/* `1 of 4` and the two arrows walk the list the task was opened from,
            in its own order; unsaved input is asked about first. */}
        {taskAt > 0 && taskOrder.length > 1 ? (
          <>
            <span className="text-meta text-c-secondary tabular-nums" data-testid="tasks-position">{TASK_CARD_WORDS.position(taskAt, taskOrder.length)}</span>
            <button type="button" aria-label={TASK_CARD_WORDS.previousTask} title={TASK_CARD_WORDS.previousTask} disabled={taskAt <= 1}
              onClick={() => openTask(taskOrder[taskAt - 2]!)} data-testid="tasks-previous"
              className="grid h-7 w-7 place-items-center rounded-full text-c-secondary hover:bg-c-hover disabled:opacity-45 disabled:hover:bg-transparent">
              <MIcon name="chevron_left" size={18} />
            </button>
            <button type="button" aria-label={TASK_CARD_WORDS.nextTask} title={TASK_CARD_WORDS.nextTask} disabled={taskAt >= taskOrder.length}
              onClick={() => openTask(taskOrder[taskAt]!)} data-testid="tasks-next"
              className="grid h-7 w-7 place-items-center rounded-full text-c-secondary hover:bg-c-hover disabled:opacity-45 disabled:hover:bg-transparent">
              <MIcon name="chevron_right" size={18} />
            </button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TaskOpenContext.Provider value={opened}>{panelFor(task, host)}</TaskOpenContext.Provider>
      </div>
    </div>
  ) : null;

  return (
    <div className={`flex min-h-0 flex-col bg-white ${fill ? "h-full" : "h-full"}`} data-testid="tasks-area">
      {listView}
      {taskView}
      {desk.overlays}
    </div>
  );
}
