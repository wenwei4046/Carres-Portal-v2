import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import type { OpsTask } from "@carres/shared";

export const TASKS_KEY = ["ops", "tasks"] as const;

type WorkGroup = "Overdue" | "Today" | "Upcoming";

function groupFor(task: OpsTask, today: string): WorkGroup {
  if (task.overdue) return "Overdue";
  if (task.dueAt?.slice(0, 10) === today) return "Today";
  return "Upcoming";
}

/** Read-only projection of actionable work. Completion remains with the owning module. */
export default function TasksPanel() {
  const myId = useAuth((s) => s.session)?.user?.id ?? null;
  const { data, isLoading } = useQuery<{ tasks: OpsTask[] }>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const work = (data?.tasks ?? [])
    .filter(
      (task) =>
        (task.assignedTo === myId || task.claimedBy === myId) &&
        (task.status === "open" || task.status === "claimed"),
    )
    .sort((a, b) => (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt));
  const groups: WorkGroup[] = ["Overdue", "Today", "Upcoming"];

  if (isLoading) return <div className="text-meta text-base-400 py-4">Loading…</div>;
  if (work.length === 0) {
    return <div className="text-meta text-base-400 text-center py-8">No work due.</div>;
  }

  return (
    <div className="space-y-4" data-testid="my-work-panel">
      {groups.map((group) => {
        const tasks = work.filter((task) => groupFor(task, today) === group);
        if (tasks.length === 0) return null;
        return (
          <section key={group}>
            <h3 className={`text-label uppercase tracking-[0.05em] mb-1.5 ${group === "Overdue" ? "text-danger" : "text-base-500"}`}>
              {group}
            </h3>
            <div className="rounded-lg border border-base-200 bg-white divide-y divide-base-100">
              {tasks.map((task) => {
                const content = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-medium text-base-900 leading-snug">{task.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-label text-base-500">
                        {task.relatedSo != null && <span className="font-mono text-base-700">SO-{task.relatedSo}</span>}
                        {task.dueAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} /> {fmtDate(task.dueAt, { time: true })}
                          </span>
                        )}
                        {task.assignedToName && <span>· {task.assignedToName}</span>}
                      </div>
                    </div>
                    {task.relatedOrderId && <ChevronRight size={14} className="text-base-300 shrink-0" />}
                  </>
                );
                return task.relatedOrderId ? (
                  <Link key={task.id} to={`/operation/orders/so/${task.relatedOrderId}`} className="flex items-center gap-2 p-2.5 hover:bg-base-50">
                    {content}
                  </Link>
                ) : (
                  <div key={task.id} className="flex items-center gap-2 p-2.5">{content}</div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
