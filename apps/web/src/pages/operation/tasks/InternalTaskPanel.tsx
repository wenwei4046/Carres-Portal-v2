/**
 * AN INTERNAL TASK, OPENED (Workspace MASTER "Employee-created internal
 * tasks", Jess 2026-10-14): the one task view with the task's own facts, what
 * its creator wrote, and one act, `Mark done`.
 *
 * `Mark done` closes THIS task and records who pressed it and when. It opens
 * no other module's form and saves nothing anywhere else: a task that says
 * "send the PO" is finished by sending the PO in Purchasing, and this button
 * only says the reminder is dealt with.
 *
 * It names no Sales Order and no document, so the frame is `plain`: `Steps`
 * and `History`, never an empty `Route` or `Files`.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { internalTaskSchema, type InternalTask } from "@carres/shared";
import Button from "@/components/kit/Button";
import StepList, { Step } from "@/components/kit/StepList";
import { ApiError, apiFetch } from "@/lib/api";
import type { WorkRow } from "../use-open-work";
import TaskFrame from "./TaskFrame";
import { INTERNAL_TASK_WORDS as W, internalTaskHistory, internalTaskIdOfRow } from "./internal-task";
import { TASK_VIEW_WORDS as V } from "./task-view";
import type { WorkPanelHost } from "./tasks-host";
import { TASK_MODULE_SYMBOL, TASK_MODULE_WORD } from "./tasks-model";

export const internalTaskKey = (taskId: string) => ["operation", "internal-task", taskId] as const;

export default function InternalTaskPanel({ item, host }: { item: WorkRow; host: WorkPanelHost }) {
  const queryClient = useQueryClient();
  const taskId = internalTaskIdOfRow(item) ?? item.source.object.id;
  const task = useQuery<InternalTask>({
    queryKey: internalTaskKey(taskId),
    queryFn: async () => internalTaskSchema.parse(await apiFetch<unknown>(`/api/operation/internal-tasks/${encodeURIComponent(taskId)}`)),
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markDone() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (!host.simulated) await apiFetch(`/api/operation/internal-tasks/${encodeURIComponent(taskId)}/done`, { method: "POST" });
      void queryClient.invalidateQueries({ queryKey: internalTaskKey(taskId) });
      host.result(W.done(item.source.object.label));
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.message ? cause.message : W.notDone);
    } finally { setBusy(false); }
  }

  return (
    <div className="p-3" data-testid="task-panel-internal">
      <TaskFrame
        plain
        head={{ title: item.source.object.label, page: TASK_MODULE_WORD[item.module], record: null, moduleIcon: TASK_MODULE_SYMBOL[item.module] }}
        history={task.data ? internalTaskHistory(task.data) : []}
        steps={
          <div className="flex flex-col gap-3" data-testid="task-internal-steps">
            {task.data?.detail ? (
              <p className="whitespace-pre-wrap break-words text-body text-c-ink" data-testid="task-internal-detail">{task.data.detail}</p>
            ) : null}
            <StepList aria-label={V.tab.steps}>
              <Step n={1} state="current" title={W.step} sub={<span>{W.finishWhen}</span>}>
                <div><Button variant="primary" size="sm" loading={busy} onClick={() => void markDone()} data-testid="task-internal-done">{W.markDone}</Button></div>
              </Step>
            </StepList>
            {error ? <span role="alert" className="text-meta text-c-err-fg" data-testid="task-internal-error">{error}</span> : null}
          </div>
        }
      />
    </div>
  );
}
