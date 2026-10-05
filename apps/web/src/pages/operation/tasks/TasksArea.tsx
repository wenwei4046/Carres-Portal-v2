/**
 * TASKS — the Quick Rail's `Tasks` view: one list, then one task, in the SAME
 * right area (LOCAL PROPOSAL, owner direction 2026-10-05; storyboard
 * `tasks-complete-ux.html`, layout B). Never deployed until the owner walks it.
 *
 * The list:
 *   Module [All modules ▾]                   ‹ 5–10 Oct ›   (week arrows: PROPOSAL)
 *   ✓ {result line}                                          (after a finished act)
 *   ▾ (!) Missed                                        (7)  red, first, open
 *   ▾ MON (5) Oct                                       (2)  today: blue circle, open
 *   ▸ TUE 6 Oct  ⌂▭ Receive goods from Ohana · Call AL · +1 (3)  closed: one-line preview
 *     THU 8 Oct                                 Nothing due  empty: no arrow, no number
 *   ▸ No due date                                       (1)  only while n > 0
 *
 * Each section header is one 52px tap target; its leading arrow only shows the
 * state. A row opens THAT module's own panel in the same area with `‹ Tasks`;
 * the left page never changes. The list stays mounted underneath, so its
 * scroll and open sections are exactly where they were on return, and the
 * module's own success words show as one result line. Leaving a task with
 * unsaved input (‹ Tasks, ×, another rail door) asks `Leave without saving?`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ListTodo, X } from "lucide-react";
import {
  poWindowWorkFromSoBatch,
  soBatchPurchaseResponseSchema,
  type OperationWorkModule,
  type PoWindowWork,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import Icon from "@/components/kit/Icon";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Popover from "@/components/kit/Popover";
import { Z_DIALOG } from "@/components/kit/overlay-layer";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useOperationSuppliers } from "@/lib/queries";
import { useOpenWorkSet, type WorkRow } from "../use-open-work";
import WorkListRow from "../work/WorkListRow";
import { WORK_MODULES } from "../work/work-model";
import {
  TASK_MODULE_ICON,
  TASK_MODULE_WORD,
  TASKS_WORDS as T,
  myTasks,
  previewLine,
  sectionModules,
  taskList,
  taskRowWords,
} from "./tasks-model";
import { isSimulatedWalk, useTasksHost, type WorkPanelHost } from "./tasks-host";
import { panelFor } from "./work-panels";

/** The purchase batches' facts for their row words, from the same SO Batch
 *  read the Work items were projected from. Read only while a batch is listed. */
function usePoWindowFacts(enabled: boolean): Map<string, PoWindowWork> {
  const demands = useQuery<SoBatchPurchaseResponse>({
    queryKey: ["so-batch-purchase", null],
    queryFn: async () =>
      soBatchPurchaseResponseSchema.parse(await apiFetch<unknown>("/api/operation/purchase/demands")) as SoBatchPurchaseResponse,
    staleTime: 15_000,
    enabled,
  });
  const suppliers = useOperationSuppliers();
  return useMemo(() => {
    const map = new Map<string, PoWindowWork>();
    if (!demands.data || !suppliers.data) return map;
    try {
      for (const w of poWindowWorkFromSoBatch(demands.data, suppliers.data.suppliers as never, { keepClosed: true })) map.set(w.key, w);
    } catch {
      /* Settings unavailable: rows keep the Work item's own sentence. */
    }
    return map;
  }, [demands.data, suppliers.data]);
}

function SimulatedTag() {
  return (
    <span className="ml-1 inline-flex h-4 items-center rounded-full bg-kit-amber-3 px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide text-kit-amber-11" data-testid="simulated-tag">
      Simulated
    </span>
  );
}

type Result = { text: string; taskId: string };

export default function TasksArea({ onClose, fill = false }: { onClose: () => void; fill?: boolean }) {
  const work = useOpenWorkSet();
  const { items, myUserId, hasData, error, refreshFailed, lastUpdatedAt, unhealthySources, generatedOn, retry } = work;
  const today = generatedOn;
  const mine = useMemo(() => myTasks(items, myUserId), [items, myUserId]);
  const [week, setWeek] = useState<string | null>(null);
  const shownWeek = week ?? today;
  const [module, setModule] = useState<OperationWorkModule | null>(null);
  const [moduleOpen, setModuleOpen] = useState(false);
  const list = useMemo(() => (today ? taskList(mine, today, shownWeek, module) : null), [mine, today, shownWeek, module]);
  const windows = usePoWindowFacts(mine.some((r) => r.source.object.kind === "po_window"));
  const simulated = isSimulatedWalk();

  /* Missed and today start open; every other section's state is kept while
     the area stays mounted. */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (key: string, fallback: boolean) => open[key] ?? fallback;
  const toggle = (key: string, fallback: boolean) => setOpen((o) => ({ ...o, [key]: !(o[key] ?? fallback) }));

  /* ── the task ─────────────────────────────────────────────────────────── */
  const [taskId, setTaskId] = useState<string | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const snapshot = useRef<WorkRow | null>(null);
  const live = taskId ? items.find((r) => r.id === taskId) ?? null : null;
  if (live) snapshot.current = live;
  const task = taskId ? live ?? snapshot.current : null;
  const [result, setResult] = useState<Result | null>(null);
  const [review, setReview] = useState<((close: () => void) => ReactNode) | null>(null);
  const setDirty = useTasksHost((s) => s.setDirty);
  const guard = useTasksHost((s) => s.guard);

  const closeTask = useCallback(() => {
    setTaskId(null);
    setReview(null);
    setDirty(false, null);
  }, [setDirty]);

  /* The source closed the act (it left the feed): back to the list. */
  useEffect(() => {
    if (taskId && hasData && !items.some((r) => r.id === taskId)) closeTask();
  }, [taskId, hasData, items, closeTask]);

  const openTask = (row: WorkRow) => {
    guard(() => {
      setDirty(false, null);
      setTaskId(row.id);
      setLastTaskId(row.id);
      setResult(null);
    });
  };

  const host: WorkPanelHost = useMemo(() => ({
    close: () => guard(onClose),
    back: () => guard(closeTask),
    result: (text, opts) => {
      if (!taskId) return;
      setDirty(false);
      setResult({ text, taskId });
      if (!opts?.stay) closeTask();
    },
    openReview: (render) => setReview(() => render),
    simulated,
  }), [guard, onClose, closeTask, taskId, setDirty, simulated]);

  /* ── words ────────────────────────────────────────────────────────────── */
  const rowWords = (row: WorkRow) => taskRowWords(row, row.source.object.kind === "po_window" ? windows.get(row.source.object.id) ?? null : null);
  const rowFor = (row: WorkRow) => {
    const w = rowWords(row);
    return (
      <WorkListRow
        key={row.id}
        item={row}
        action={w.act}
        cover={null}
        selected={row.id === lastTaskId}
        onSelect={() => openTask(row)}
        onOpenRecord={() => openTask(row)}
        task={{ icon: <Icon name={TASK_MODULE_ICON[row.module]} size={16} />, detail: w.detail, missedDate: w.missedDate, noDate: w.noDate }}
      />
    );
  };
  const preview = (rows: readonly WorkRow[]) =>
    rows.length ? (
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-kit-slate-11" data-testid="section-preview">
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
          {sectionModules(rows).map((m) => <Icon key={m} name={TASK_MODULE_ICON[m]} size={14} />)}
        </span>
        <span className="min-w-0 truncate">{previewLine(rows.map((r) => rowWords(r).act))}</span>
      </span>
    ) : null;

  const countBadge = (n: number, tone: "red" | "blue" | "grey") => (
    <span
      className={`grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-semibold leading-4 tabular-nums ${
        tone === "red" ? "bg-danger text-white" : tone === "blue" ? "bg-kit-blue-9 text-white" : "bg-kit-slate-4 text-kit-slate-12"
      }`}
      data-testid="section-count"
    >
      {n}
    </span>
  );

  /** One section: a 52px header that is one tap target, then its rows. */
  const section = (opts: {
    key: string; label: ReactNode; aria: string; rows: WorkRow[]; tone: "missed" | "today" | "day" | "nodate";
    defaultOpen: boolean; leading?: ReactNode; holiday?: string | null;
  }) => {
    const { key, rows, tone } = opts;
    const empty = rows.length === 0;
    const expanded = !empty && isOpen(key, opts.defaultOpen);
    const bg = tone === "missed" ? "bg-kit-red-3" : tone === "today" ? "bg-kit-blue-3" : "bg-white";
    const edge = tone === "today" ? "border-l-[3px] border-l-kit-blue-9" : "";
    const header = (
      <>
        {empty ? <span className="w-5 shrink-0" aria-hidden /> : (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-control border border-kit-slate-5 bg-white text-kit-slate-11" aria-hidden>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
        {opts.leading}
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="flex items-baseline gap-1.5">{opts.label}</span>
          {!expanded ? preview(rows) : null}
        </span>
        {empty ? (
          <span className="shrink-0 text-meta text-kit-slate-10" data-testid="section-nothing-due">{T.nothingDue}</span>
        ) : countBadge(rows.length, tone === "missed" ? "red" : tone === "today" ? "blue" : "grey")}
      </>
    );
    return (
      <section key={key} data-testid={`task-section-${key}`} data-open={expanded || undefined} className={tone === "nodate" ? "border-t border-dashed border-kit-slate-6" : ""}>
        {empty ? (
          <div className={`flex min-h-[52px] items-center gap-2.5 border-b border-kit-slate-4 px-3 ${bg} ${edge}`} aria-label={`${opts.aria} · ${T.nothingDue}`} title={opts.holiday ?? undefined}>
            {header}
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${opts.aria} · ${rows.length}`}
            title={opts.holiday ?? undefined}
            onClick={() => toggle(key, opts.defaultOpen)}
            className={`flex min-h-[52px] w-full items-center gap-2.5 border-b border-kit-slate-4 px-3 text-left hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kit-blue-9 ${bg} ${edge}`}
          >
            {header}
          </button>
        )}
        {expanded ? <div data-testid={`task-rows-${key}`}>{rows.map(rowFor)}</div> : null}
      </section>
    );
  };

  /* ── states ───────────────────────────────────────────────────────────── */
  const failedBanner = (error || refreshFailed || unhealthySources.length > 0) ? (
    <div role="alert" className="mx-3 mt-3 flex items-start gap-2 rounded-control bg-kit-red-3 px-3 py-2 text-meta text-kit-red-11" data-testid="tasks-failed">
      <Icon name="late" size={14} />
      <div className="min-w-0 flex-1">
        <p>
          {T.failed}
          {lastUpdatedAt !== null ? ` · ${T.lastUpdated(fmtDate(new Date(lastUpdatedAt).toISOString(), { timeOnly: true }))}` : ""}
        </p>
        {unhealthySources.map((s) => <p key={s.key}>{T.couldNotRefresh(TASK_MODULE_WORD[s.key as OperationWorkModule] ?? s.key)}</p>)}
      </div>
      <button type="button" onClick={retry} className="shrink-0 font-semibold text-kit-blue-11 hover:underline">{T.tryAgain}</button>
    </div>
  ) : null;

  const loadingList = (
    <div aria-busy="true" data-testid="tasks-loading">
      <span className="sr-only" role="status">Loading tasks</span>
      {["", "MON", "TUE", "WED"].map((d, i) => (
        <div key={i} className="flex min-h-[52px] items-center gap-3 border-b border-kit-slate-4 px-3">
          <span className="w-8 text-label text-kit-slate-10">{d}</span>
          <span className="h-3 w-24 animate-pulse rounded bg-kit-slate-3" />
          <span className="ml-auto h-5 w-5 animate-pulse rounded-full bg-kit-slate-3" />
        </div>
      ))}
    </div>
  );

  const nothing = (
    <div className="flex flex-col items-center gap-1 px-3 py-10 text-center" data-testid="tasks-nothing">
      <ListTodo size={18} className="text-kit-slate-10" aria-hidden />
      <p className="text-body font-semibold text-kit-slate-12">{T.nothingAssigned}</p>
      <p className="text-meta text-kit-slate-11">{T.thisWeek}</p>
    </div>
  );

  /* ── the module filter: counts add up exactly to the list ────────────── */
  const moduleChoices = list
    ? WORK_MODULES.filter((m) => list.moduleCounts[m] > 0 || m === module)
    : [];
  const moduleMenu = (
    <Popover
      label="Module"
      open={moduleOpen}
      onOpenChange={setModuleOpen}
      trigger={
        <Button size="sm" data-testid="tasks-module">
          <span className="text-kit-slate-11">{T.module}</span>
          {module ? <Icon name={TASK_MODULE_ICON[module]} size={14} /> : null}
          <span>{module ? TASK_MODULE_WORD[module] : T.allModules}</span>
          <ChevronDown size={14} aria-hidden />
        </Button>
      }
    >
      <div className="flex w-[220px] flex-col" data-testid="tasks-module-menu">
        {[null, ...moduleChoices].map((m) => (
          <button
            key={m ?? "all"}
            type="button"
            className={`flex h-8 items-center gap-2 rounded-control px-2 text-left text-body ${m === module ? "bg-kit-blue-3 font-semibold text-kit-blue-11" : "hover:bg-kit-slate-3"}`}
            onClick={() => { setModule(m); setModuleOpen(false); }}
            data-testid={`tasks-module-${m ?? "all"}`}
          >
            {m ? <Icon name={TASK_MODULE_ICON[m]} size={14} /> : null}
            <span className="flex-1">{m ? TASK_MODULE_WORD[m] : T.allModules}</span>
            <span className="tabular-nums">{list ? (m ? list.moduleCounts[m] : list.total) : ""}</span>
          </button>
        ))}
      </div>
    </Popover>
  );

  const resultLine = result ? (
    <div className="mx-3 mt-3 flex items-center gap-2 rounded-control bg-kit-green-3 px-3 py-2 text-meta text-kit-green-11" role="status" data-testid="tasks-result">
      <Check size={14} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{result.text.split(" · ")[0]}</span>
        {result.text.includes(" · ") ? ` · ${result.text.split(" · ").slice(1).join(" · ")}` : ""}
        {/* A receipt that left goods owed keeps its task (owner 2026-10-05). */}
        {!taskId && items.some((r) => r.id === result.taskId && r.module === "receiving") ? " · some items still to receive" : ""}
      </span>
      {simulated ? <SimulatedTag /> : null}
    </div>
  ) : null;

  const listView = (
    <div className="flex min-h-0 flex-1 flex-col" hidden={Boolean(task)} data-testid="tasks-list">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-kit-slate-4 px-3">
        <ListTodo size={18} aria-hidden className="text-kit-slate-11" />
        <h2 className="flex-1 text-strong text-kit-slate-12">{T.title}</h2>
        <button type="button" onClick={() => guard(onClose)} className="rounded p-1 text-kit-slate-11 hover:bg-kit-slate-3" aria-label="Close panel" data-testid="tasks-close">
          <X size={16} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-kit-slate-4 px-3 py-2">
        {moduleMenu}
        <div className="ml-auto flex items-center gap-1" data-testid="tasks-week">
          <button type="button" aria-label={T.previousWeek} title={T.previousWeek} disabled={!list} onClick={() => list && setWeek(list.previousWeek)}
            className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-5 bg-white text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[64px] text-center text-meta tabular-nums text-kit-slate-12" data-testid="tasks-week-label">{list?.weekLabel ?? ""}</span>
          <button type="button" aria-label={T.nextWeek} title={T.nextWeek} disabled={!list} onClick={() => list && setWeek(list.nextWeek)}
            className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-5 bg-white text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="tasks-scroll">
        {resultLine}
        {failedBanner}
        {!hasData ? (error ? null : loadingList) : list && list.total === 0 && !module ? nothing : list ? (
          <div className={result || failedBanner ? "mt-3" : ""}>
            {list.missed.length > 0 ? section({
              key: "missed", tone: "missed", rows: list.missed, defaultOpen: true, aria: T.missed,
              leading: <Icon name="late" size={16} />,
              label: <span className="text-body font-semibold text-kit-red-11">{T.missed}</span>,
            }) : null}
            {list.days.map((day) => section({
              key: day.iso, tone: day.today ? "today" : "day", rows: day.rows, defaultOpen: day.today, holiday: day.holiday,
              aria: `${day.weekday} ${day.dayNumber} ${day.month}${day.holiday ? ` · ${day.holiday}` : ""}`,
              label: day.today ? (
                <span className="flex items-center gap-1.5 text-kit-blue-11">
                  <span className="text-label font-semibold uppercase tracking-wider">{day.weekday}</span>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-kit-blue-9 text-[12px] font-semibold text-white" data-testid="today-circle">{day.dayNumber}</span>
                  <span className="text-body font-semibold">{day.month}</span>
                </span>
              ) : (
                <span className={`flex items-baseline gap-1.5 ${day.rows.length ? "text-kit-slate-12" : "text-kit-slate-10"}`}>
                  <span className="text-label font-semibold uppercase tracking-wider">{day.weekday}</span>
                  <span className="text-body font-semibold">{day.dayNumber} {day.month}</span>
                </span>
              ),
            }))}
            {list.noDate.length > 0 ? section({
              key: "no-date", tone: "nodate", rows: list.noDate, defaultOpen: false, aria: T.noDueDate,
              leading: <Icon name="noDate" size={16} />,
              label: <span className="text-body font-semibold text-kit-slate-12">{T.noDueDate}</span>,
            }) : null}
          </div>
        ) : null}
      </div>
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
        <button type="button" onClick={() => guard(closeTask)} className="flex items-center gap-1.5 text-meta font-semibold text-kit-blue-11 hover:underline" data-testid="tasks-back">
          <ArrowLeft size={14} aria-hidden />
          {T.back}
        </button>
        {simulated ? <span className="ml-auto flex items-center gap-1 text-[11px] text-kit-slate-11">Writes here are <SimulatedTag /></span> : null}
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
        <div role="dialog" aria-modal="true" aria-label="Issue PO review" className={`fixed inset-0 ${Z_DIALOG} flex flex-col bg-white`} data-testid="tasks-review">
          {review(() => setReview(null))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
