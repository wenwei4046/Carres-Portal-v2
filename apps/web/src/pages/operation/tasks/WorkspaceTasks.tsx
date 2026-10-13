/**
 * WORKSPACE — every task as one table, and one task beside its list (owner's
 * round 3 brief of 13 Oct 2026, points 3 and 4; Workspace MASTER §5).
 *
 *   Module          │ [My Task|Team Work] [To do 4][Waiting 1][Done 2]
 *   ‹ Mon … Fri ›   │ Due      Task                  Contact   Last contact  Status
 *   All modules  4  │ Today    Ask TEST Supplier A…  TEST …    Asked Fri…    4 days late
 *   Purchasing   3  │ …
 *   Sales Orders 1  │
 *
 * Nothing chosen: the full table. A row chosen: a narrow pick list and the
 * ONE task view beside it, the same view and the same desk the Tasks panel
 * uses (`useTaskDesk`, `panelFor`), so a task is worked one way everywhere.
 *
 * ONE RECORD. The page reads the one Work read and asks `workspaceTable`,
 * which is the Tasks panel's own arithmetic said as rows: the three numbers
 * here are the panel's three numbers, and the Module rail counts the chosen
 * tab. It writes nothing itself: every act is the owning module's own form.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { OperationWorkModule } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import Icon from "@/components/kit/Icon";
import Tabs from "@/components/kit/Tabs";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import TwoLineCell from "@/components/register/TwoLineCell";
import { fmtDate } from "@/lib/fmt-date";
import { useOpenWorkSet, type WorkRow } from "../use-open-work";
import { sameWeekday } from "./TasksArea";
import { TaskOpenContext } from "./TaskFrame";
import { TaskDayStrip } from "./TaskList";
import { TASK_CARD_WORDS, TASK_TABS, emptyWord, taskCard, taskStrip, type TaskTab } from "./task-cards";
import { TASK_MODULE_SYMBOL, TASK_MODULE_WORD, TASKS_WORDS as T, myTasks } from "./tasks-model";
import { usePoWindowFacts } from "./use-po-window-facts";
import { useTaskDesk } from "./use-task-desk";
import { panelFor } from "./work-panels";
import { WORKSPACE_WORDS as W, workspaceTable, type WorkspaceRow, type WorkspaceTone } from "./workspace-table";

const MODULES = Object.keys(TASK_MODULE_WORD) as OperationWorkModule[];
const TONE: Record<WorkspaceTone, string> = {
  warn: "bg-c-warn-bg text-c-warn-fg",
  neutral: "bg-c-info-bg text-c-info-fg",
  ok: "bg-c-ok-bg text-c-ok-fg",
};

function StatusPill({ row }: { row: WorkspaceRow }) {
  return <span className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2 py-0.5 text-meta font-medium ${TONE[row.tone]}`} data-tone={row.tone}>{row.status}</span>;
}

export default function WorkspaceTasks() {
  const work = useOpenWorkSet();
  const { items, completed, myUserId, hasData, error, refreshFailed, lastUpdatedAt, unhealthySources, generatedOn: today, retry } = work;
  const [params, setParams] = useSearchParams();
  const set = useCallback((changes: Record<string, string | null>) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) { if (value == null) next.delete(key); else next.set(key, value); }
      return next;
    }, { replace: true });
  }, [setParams]);

  const team = params.get("scope") === "team";
  const tab: TaskTab = TASK_TABS.includes(params.get("status") as TaskTab) ? (params.get("status") as TaskTab) : "todo";
  const moduleParam = params.get("module");
  const module = MODULES.includes(moduleParam as OperationWorkModule) ? (moduleParam as OperationWorkModule) : null;
  const dayParam = params.get("day");
  const chosen = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today;

  const scoped = useMemo(() => (team ? items : myTasks(items, myUserId)), [team, items, myUserId]);
  const windows = usePoWindowFacts(scoped.some((row) => row.source.object.kind === "po_window"));
  const factsOf = useCallback((row: WorkRow) => (row.source.object.kind === "po_window" ? windows.get(row.source.object.id) ?? null : null), [windows]);
  const table = useMemo(() => (today ? workspaceTable({ scoped, completed, doneBy: myUserId, team, today, chosen, tab, module, factsOf }) : null),
    [scoped, completed, myUserId, team, today, chosen, tab, module, factsOf]);
  const strip = useMemo(() => (today ? taskStrip(scoped, today, chosen) : null), [scoped, today, chosen]);

  /* The desk walks the rows on screen, in the table's own order. */
  const order = useMemo(() => (table ? table.rows.flatMap((row) => (row.work ? [taskCard(row.work, factsOf(row.work))] : [])) : []), [table, factsOf]);
  const desk = useTaskDesk({ order, factsOf });
  const { task, openTask } = desk;

  /* The chosen task is in the address (Workspace MASTER §5.4): a link opens
     it, Back leaves it. The desk stays the one owner of what is open. */
  const taskParam = params.get("task");
  useEffect(() => {
    if (!hasData) return;
    if (taskParam && !task) {
      const row = items.find((candidate) => candidate.id === taskParam);
      if (row) openTask(row); else set({ task: null });
    }
    // Opening from the address happens once per address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskParam, hasData]);
  useEffect(() => {
    if (!hasData) return;
    if ((task?.id ?? null) !== taskParam && (task || !items.some((candidate) => candidate.id === taskParam))) set({ task: task?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const columns = useMemo<DataGridColumn<WorkspaceRow>[]>(() => [
    {
      key: "due", label: W.col.due, width: 104, minWidth: 92, sortable: true, wrap: true,
      accessor: (row) => <TwoLineCell top={<span className={row.late ? "font-medium text-c-warn-fg" : undefined}>{row.due}</span>} sub={row.dueSub ?? undefined} testId={`workspace-due-${row.id}`} />,
      sortFn: (a, b) => a.sortKey.localeCompare(b.sortKey),
      exportValue: (row) => [row.due, row.dueSub].filter(Boolean).join(" "),
    },
    {
      key: "task", label: W.col.task, width: 320, minWidth: 180, sortable: true, wrap: true,
      accessor: (row) => (
        <span className="flex min-w-0 items-start gap-2" data-testid={`workspace-task-${row.id}`}>
          <MIcon name={TASK_MODULE_SYMBOL[row.module]} size={18} className="mt-px shrink-0 text-c-secondary" />
          <TwoLineCell strong top={row.title} sub={row.record} />
        </span>
      ),
      sortFn: (a, b) => a.title.localeCompare(b.title),
      searchValue: (row) => `${row.title} ${row.record} ${row.contact ?? ""}`,
      exportValue: (row) => `${row.title} · ${row.record}`,
    },
    {
      key: "contact", label: W.col.contact, width: 140, minWidth: 110, sortable: true, wrap: true,
      accessor: (row) => row.contact
        ? <TwoLineCell top={row.contact} sub={row.contactSub ?? undefined} testId={`workspace-contact-${row.id}`} />
        : <span className="text-body text-c-secondary" data-testid={`workspace-contact-${row.id}`}>{W.notRecorded}</span>,
      sortFn: (a, b) => (a.contact ?? "").localeCompare(b.contact ?? ""),
      filterValue: (row) => row.contact ?? W.notRecorded,
      exportValue: (row) => row.contact ?? "",
    },
    {
      key: "lastContact", label: W.col.lastContact, width: 150, minWidth: 124, wrap: true,
      accessor: (row) => <span className={`text-body ${row.lastContact ? "text-c-ink" : "text-c-secondary"}`} data-testid={`workspace-last-${row.id}`}>{row.lastContact ?? W.notRecorded}</span>,
      exportValue: (row) => row.lastContact ?? "",
    },
    ...(team ? [{
      key: "owner", label: W.col.owner, width: 130, minWidth: 104, sortable: true, wrap: true,
      accessor: (row: WorkspaceRow) => <span className={`text-body ${row.owner ? "text-c-ink" : "text-c-secondary"}`} data-testid={`workspace-owner-${row.id}`}>{row.owner ?? W.notAssigned}</span>,
      sortFn: (a: WorkspaceRow, b: WorkspaceRow) => (a.owner ?? "").localeCompare(b.owner ?? ""),
      filterValue: (row: WorkspaceRow) => row.owner ?? W.notAssigned,
      exportValue: (row: WorkspaceRow) => row.owner ?? "",
    } satisfies DataGridColumn<WorkspaceRow>] : []),
    {
      key: "status", label: W.col.status, width: 132, minWidth: 118, sortable: true, wrap: true,
      accessor: (row) => <span data-testid={`workspace-status-${row.id}`}><StatusPill row={row} /></span>,
      sortFn: (a, b) => a.status.localeCompare(b.status),
      filterValue: (row) => row.status,
      exportValue: (row) => row.status,
    },
  ], [team]);

  const failedBanner = (error || refreshFailed || unhealthySources.length > 0) ? (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-c-err-bg px-3 py-2 text-meta text-c-err-fg" data-testid="workspace-failed">
      <Icon name="late" size={14} />
      <div className="min-w-0 flex-1">
        <p>
          {T.failed}
          {lastUpdatedAt !== null ? ` · ${T.lastUpdated(fmtDate(new Date(lastUpdatedAt).toISOString(), { timeOnly: true }))}` : ""}
        </p>
        {unhealthySources.map((source) => <p key={source.key}>{T.couldNotRefresh(TASK_MODULE_WORD[source.key as OperationWorkModule] ?? source.key)}</p>)}
      </div>
      <button type="button" onClick={retry} className="shrink-0 font-semibold text-c-ink hover:underline">{T.tryAgain}</button>
    </div>
  ) : null;

  const toolbar = (
    <div className="flex h-9 shrink-0 items-center gap-3" data-testid="workspace-toolbar">
      <Tabs variant="segmented" label="Whose work" value={team ? "team" : "mine"} onValueChange={(value) => desk.guard(() => set({ scope: value === "team" ? "team" : null, task: null }))}
        tabs={[{ value: "mine", label: W.scope.mine }, { value: "team", label: W.scope.team }]} />
      <Tabs variant="segmented" label={TASK_CARD_WORDS.show} value={tab} onValueChange={(value) => desk.guard(() => set({ status: value === "todo" ? null : value, task: null }))}
        tabs={TASK_TABS.map((key) => ({ value: key, label: table ? `${TASK_CARD_WORDS.tab[key]} ${table.counts[key]}` : TASK_CARD_WORDS.tab[key] }))} />
    </div>
  );

  const rail = (
    <aside aria-label={W.moduleRail} className="flex w-[232px] shrink-0 flex-col gap-2" data-testid="workspace-rail">
      <h2 className="flex h-9 items-center px-1 text-strong text-c-ink">{W.moduleRail}</h2>
      <div className="flex flex-col rounded-lg border border-c-card-border bg-white pb-1.5">
        {strip ? (
          <TaskDayStrip strip={strip} chosen={chosen} onChoose={(iso) => desk.guard(() => set({ day: iso === today ? null : iso, task: null }))}
            onWeek={(monday) => desk.guard(() => { const iso = sameWeekday(monday, chosen); set({ day: iso === today ? null : iso, task: null }); })} />
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-c-row-line p-1.5">
          {[{ key: null as OperationWorkModule | null, word: W.allModules, icon: "apps", count: table ? table.counts[tab] : null },
            ...MODULES.map((m) => ({ key: m as OperationWorkModule | null, word: TASK_MODULE_WORD[m], icon: TASK_MODULE_SYMBOL[m], count: table ? table.modules.find((row) => row.module === m)!.count : null }))]
            .map((row) => {
              const on = module === row.key;
              return (
                <li key={row.key ?? "all"}>
                  <button type="button" aria-pressed={on} onClick={() => desk.guard(() => set({ module: row.key, task: null }))} data-testid={`workspace-module-${row.key ?? "all"}`}
                    className={`flex h-[30px] w-full items-center gap-2 rounded-lg px-2 text-left text-body outline-none focus-visible:[outline:var(--c-focus)] ${on ? "bg-c-select-bg font-medium text-c-select-fg" : "text-c-ink hover:bg-c-hover"}`}>
                    <MIcon name={row.icon} size={18} className={on ? "shrink-0" : "shrink-0 text-c-secondary"} />
                    <span className="min-w-0 flex-1 truncate">{row.word}</span>
                    {/* Loading or failed never prints 0 (Workspace §5.7). */}
                    <span className="tabular-nums" data-testid="workspace-module-count">{row.count ?? ""}</span>
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </aside>
  );

  const list = table ? (
    <DataGrid<WorkspaceRow>
      rows={table.rows}
      columns={columns}
      storageKey={team ? "workspace-tasks-team" : "workspace-tasks"}
      rowKey={(row) => row.id}
      rowTestId={(row) => `workspace-row-${row.id}`}
      rowHeight={54}
      appearance="reference"
      palette="slate"
      searchPresentation="icon"
      allowColumnGrouping={false}
      groupBanner={false}
      isLoading={!hasData && !error}
      emptyMessage={emptyWord(tab, chosen === today)}
      exportName="Workspace"
      onRowClick={(row) => { if (row.work) openTask(row.work); }}
      statusSummary={(filtered) => <span className="block" data-testid="workspace-footer">{filtered.length === table.rows.length ? W.footer(table.rows.length) : `${filtered.length} of ${W.footer(table.rows.length)}`}</span>}
    />
  ) : (
    <p role="status" className="p-4 text-body text-c-secondary" data-testid="workspace-loading">{error ? "" : "Loading tasks"}</p>
  );

  /* One task chosen: the rows as a narrow pick list, the task view beside it. */
  const picked = task && table ? (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-3" data-testid="workspace-picked">
      <ul className="m-0 flex min-h-0 list-none flex-col gap-1 overflow-y-auto rounded-lg border border-c-card-border bg-white p-1.5" aria-label={TASK_CARD_WORDS.allTasks} data-testid="workspace-pick-list">
        {table.rows.map((row) => {
          const on = row.id === task.id;
          return (
            <li key={row.id}>
              <button type="button" disabled={!row.work} aria-current={on ? "true" : undefined} onClick={() => { if (row.work) openTask(row.work); }} data-testid={`workspace-pick-${row.id}`}
                className={`flex min-h-[54px] w-full flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left outline-none focus-visible:[outline:var(--c-focus)] ${on ? "bg-c-select-bg" : "hover:bg-c-hover"}`}>
                <span className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words text-body font-medium text-c-ink">{row.title}</span>
                  <StatusPill row={row} />
                </span>
                <span className="break-words text-meta text-c-secondary">{row.record}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto" data-testid="workspace-task" data-task={task.id} onInput={desk.markDirty}>
        <div className="flex h-9 shrink-0 items-center justify-end px-3">
          <button type="button" onClick={desk.back} aria-label={W.closeTask} title={W.closeTask} data-testid="workspace-task-close"
            className="grid h-7 w-7 place-items-center rounded-full text-c-secondary outline-none hover:bg-c-hover focus-visible:[outline:var(--c-focus)]">
            <MIcon name="close" size={18} />
          </button>
        </div>
        <div className="mx-auto w-full max-w-[720px]">
          <TaskOpenContext.Provider value={desk.opened}>{panelFor(task, desk.host)}</TaskOpenContext.Provider>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 gap-3 p-3" data-testid="workspace-tasks">
      {rail}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label="Workspace">
        {toolbar}
        {failedBanner}
        {picked ?? <div className="flex min-h-0 flex-1 flex-col" data-testid="workspace-table">{list}</div>}
      </section>
      {desk.overlays}
    </div>
  );
}
