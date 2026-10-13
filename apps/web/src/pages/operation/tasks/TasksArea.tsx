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
 * A card opens THAT module's own panel in the same area with `‹ All tasks`;
 * the left page never changes. The list stays mounted underneath, so its day,
 * tab and scroll are exactly where they were on return, and the module's own
 * success words show as one result line. Leaving a task with unsaved input
 * (‹ All tasks, ×, another rail door) asks `Leave without saving?`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ListTodo, X } from "lucide-react";
import {
  poWindowWorkFromSoBatch,
  soBatchPurchaseResponseSchema,
  type OperationWorkModule,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import Icon from "@/components/kit/Icon";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import { Z_DIALOG } from "@/components/kit/overlay-layer";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk, useOperationSuppliers } from "@/lib/queries";
import { useOpenWorkSet, type WorkRow } from "../use-open-work";
import { TASK_MODULE_WORD, TASKS_WORDS as T, myTasks, type PoWindowFacts } from "./tasks-model";
import TaskList from "./TaskList";
import { TASK_CARD_WORDS, taskStrip, taskTabs, type TaskCard, type TaskTab } from "./task-cards";
import { isSimulatedWalk, useTasksHost, type WorkPanelHost } from "./tasks-host";
import { panelFor } from "./work-panels";

/** The purchase batches' facts for their row words, from the same SO Batch
 *  read the Work items were projected from. Read only while a batch is listed. */
function usePoWindowFacts(enabled: boolean): Map<string, PoWindowFacts> {
  const demands = useQuery<SoBatchPurchaseResponse>({
    queryKey: ["so-batch-purchase", null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
    enabled,
  });
  const suppliers = useOperationSuppliers({ enabled });
  return useMemo(() => {
    const map = new Map<string, PoWindowFacts>();
    if (!demands.data || !suppliers.data) return map;
    try {
      for (const window of poWindowWorkFromSoBatch(demands.data, suppliers.data.suppliers as never, { keepClosed: true })) {
        const demandSos = [...new Set(demands.data.rows
          .filter((r) => r.poWindow === window.key && window.demand.rowIds.includes(r.id) && r.so != null)
          .map((r) => r.so as number))];
        map.set(window.key, { window, demandSos });
      }
    } catch {
      /* Settings unavailable: rows keep the Work item's own sentence. */
    }
    return map;
  }, [demands.data, suppliers.data]);
}

type Result = { text: string; taskId: string; stay: boolean };

/** The same weekday in the week that starts on `monday` (both `YYYY-MM-DD`). */
function sameWeekday(monday: string, chosen: string): string {
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
  const simulated = isSimulatedWalk();

  /* ── the task ─────────────────────────────────────────────────────────── */
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const snapshot = useRef<WorkRow | null>(null);
  const live = taskId ? items.find((r) => r.id === taskId) ?? null : null;
  if (live) snapshot.current = live;
  const task = taskId ? live ?? snapshot.current : null;
  const setTaskOpen = useTasksHost((s) => s.setTaskOpen);
  useEffect(() => {
    setTaskOpen(Boolean(task));
    return () => setTaskOpen(false);
  }, [task, setTaskOpen]);
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState<((close: () => void) => ReactNode) | null>(null);
  const setDirty = useTasksHost((s) => s.setDirty);
  const queryClient = useQueryClient();
  const guard = useTasksHost((s) => s.guard);

  const closeTask = useCallback(() => {
    setTaskId(null);
    setReview(null);
    setDirty(false, null);
  }, [setDirty]);

  /* `Leave` through another rail door discards the open task's input. */
  const discardRequest = useTasksHost((s) => s.discardRequest);
  const seenDiscard = useRef(discardRequest);
  useEffect(() => {
    if (discardRequest === seenDiscard.current) return;
    seenDiscard.current = discardRequest;
    closeTask();
  }, [discardRequest, closeTask]);

  /* The source closed the act (it left the feed): back to the list. */
  /* A full-width review that just closed is followed by the module's own
     result a moment later; wait for it before deciding (no blind close). */
  const reviewClosedAt = useRef(0);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    /* …unless its own result asked to stay: the panel keeps showing what was
       just saved (a partial receipt) until the operator goes back. */
    const kept = result?.taskId === taskId && result.stay;
    if (!taskId || !hasData || kept || items.some((r) => r.id === taskId)) return;
    const wait = 3000 - (Date.now() - reviewClosedAt.current);
    if (wait > 0) {
      const t = setTimeout(() => setRecheck((n) => n + 1), wait);
      return () => clearTimeout(t);
    }
    closeTask();
  }, [taskId, hasData, items, closeTask, result, recheck]);

  const openTask = (row: WorkRow) => {
    guard(() => {
      setDirty(false, null);
      setTaskId(row.id);
      setLastTaskId(row.id);
      setResult(null);
    });
  };

  const host: WorkPanelHost = useMemo(() => ({
    close: () => guard(() => { closeTask(); onClose(); }),
    back: () => guard(closeTask),
    result: (text, opts) => {
      if (!taskId) return;
      setDirty(false);
      setResult({ text, taskId, stay: Boolean(opts?.stay) });
      /* Ask the ONE Work feed again now, so a closed act leaves the list
         without waiting for the next poll. */
      void queryClient.invalidateQueries({ queryKey: qk.operation.work() });
      /* A batch row is worded from the SO Batch read (to buy / to send), so
         an issued or sent PO changes that row's words too. */
      void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
      if (!opts?.stay) closeTask();
    },
    openReview: (render) => setReview(() => render),
    simulated,
  }), [guard, onClose, closeTask, taskId, setDirty, simulated, queryClient]);

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

  const resultLine = result ? (
    <div className="mx-3 mt-3 flex items-center gap-2 rounded-control bg-kit-green-3 px-3 py-2 text-meta text-kit-green-11" role="status" data-testid="tasks-result">
      <Check size={14} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{result.text.split(" · ")[0]}</span>
        {result.text.includes(" · ") ? ` · ${result.text.split(" · ").slice(1).join(" · ")}` : ""}
      </span>
    </div>
  ) : null;

  const listView = (
    <div className={`${task ? "hidden" : "flex"} min-h-0 flex-1 flex-col`} hidden={Boolean(task)} data-testid="tasks-list">
      <div className={`${bare ? "hidden" : "flex"} h-12 shrink-0 items-center gap-2 border-b border-kit-slate-4 px-3`}>
        <ListTodo size={18} aria-hidden className="text-kit-slate-11" />
        <h2 className="flex-1 text-strong text-kit-slate-12">{T.title}</h2>
        <button type="button" onClick={() => guard(onClose)} className="rounded p-1 text-kit-slate-11 hover:bg-kit-slate-3" aria-label="Close panel" data-testid="tasks-close">
          <X size={16} />
        </button>
      </div>
      {/* ONE result line: inside the task while it stays open, here only
          once the list is showing — never both. */}
      {task ? null : resultLine}
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
      onInput={() => setDirty(true, task.source.object.label)}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-kit-slate-4 px-3">
        <button type="button" onClick={() => guard(closeTask)} className="flex items-center gap-1.5 text-meta font-semibold text-c-ink hover:underline" data-testid="tasks-back">
          <ArrowLeft size={14} aria-hidden />
          {TASK_CARD_WORDS.allTasks}
        </button>
      </div>
      {result && result.taskId === task.id ? resultLine : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{panelFor(task, host)}</div>
    </div>
  ) : null;

  const pending = useTasksHost((s) => s.pending);
  const subject = useTasksHost((s) => s.subject);
  const leave = useTasksHost((s) => s.leave);
  const stay = useTasksHost((s) => s.stay);

  return (
    <div className={`flex min-h-0 flex-col bg-white ${fill ? "h-full" : "h-full"}`} data-testid="tasks-area">
      {listView}
      {taskView}
      <Modal
        open={pending !== null}
        onOpenChange={(next) => { if (!next) stay(); }}
        title="Leave without saving?"
        description={subject ? `What you typed for ${subject} is not saved yet.` : "What you typed is not saved yet."}
        footer={
          <div className="flex w-full justify-between gap-2">
            <Button onClick={leave} data-testid="guard-leave">Leave</Button>
            <Button variant="primary" onClick={stay} data-testid="guard-stay">Stay</Button>
          </div>
        }
      >
        {null}
      </Modal>
      {review && task ? createPortal(
        <div role="dialog" aria-modal="true" aria-label={`${task.line} · ${task.source.object.label}`} className={`fixed inset-0 ${Z_DIALOG} flex flex-col bg-white`} data-testid="tasks-review">
          {review(() => { reviewClosedAt.current = Date.now(); setReview(null); })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
