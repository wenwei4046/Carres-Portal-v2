import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Hand, Check, Trash2, RotateCcw, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  OpsTask,
  OpsTeamMember,
  CreateOpsTaskInput,
  UpdateOpsTaskInput,
} from "@carres/shared";

/**
 * TasksPanel — right-rail task board (Jess COO ask): COO/manager assigns work
 * to the operation team; a staff CLAIMS it (records who) + marks DONE. A 60-min
 * SLA flags overdue (open past SLA) in red — the rail Tasks icon shows the
 * overdue count as a red badge.
 */
export const TASKS_KEY = ["ops", "tasks"] as const;

const STATUS_PILL: Record<string, string> = {
  open: "pill-warning",
  claimed: "pill-sent",
  done: "pill-confirmed",
  cancelled: "pill-neutral",
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TasksPanel() {
  const qc = useQueryClient();
  const myId = useAuth((s) => s.session)?.user?.id ?? null;

  const { data, isLoading } = useQuery<{ tasks: OpsTask[] }>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000, // keep the overdue flag fresh
  });
  const membersQ = useQuery<{ members: OpsTeamMember[] }>({
    queryKey: ["ops", "tasks", "members"],
    queryFn: () => apiFetch("/api/ops/tasks/members"),
  });
  const tasks = data?.tasks ?? [];
  const members = membersQ.data?.members ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: TASKS_KEY });
  const createMut = useMutation({
    mutationFn: (body: CreateOpsTaskInput) =>
      apiFetch("/api/ops/tasks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const actMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateOpsTaskInput) =>
      apiFetch(`/api/ops/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ops/tasks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const [title, setTitle] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [urgent, setUrgent] = useState(false);

  function submit() {
    if (!title.trim()) return;
    createMut.mutate(
      {
        title: title.trim(),
        assignedTo: assignTo || null,
        priority: urgent ? "urgent" : "normal",
      },
      {
        onSuccess: () => {
          setTitle("");
          setAssignTo("");
          setUrgent(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Composer — assign a task to the team */}
      <div className="rounded border border-base-200 bg-base-50 p-2 mb-3 space-y-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Assign a task…"
          className="w-full text-[12px] px-2 py-1.5 border border-base-200 rounded bg-white focus:outline-none focus:border-base-500"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            className="flex-1 text-[11px] px-1.5 py-1 border border-base-200 rounded bg-white"
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setUrgent((u) => !u)}
            className={`text-[10px] font-semibold uppercase px-2 py-1 rounded border ${urgent ? "border-danger text-danger bg-error-soft" : "border-base-200 text-base-500"}`}
          >
            Urgent
          </button>
          <button
            type="button"
            disabled={!title.trim() || createMut.isPending}
            onClick={submit}
            className="bg-base-900 text-white rounded p-1.5 disabled:opacity-40 hover:bg-base-800"
            aria-label="Create task"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto space-y-2">
        {isLoading ? (
          <div className="text-[12px] text-base-400 text-center py-6">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="text-[12px] text-base-400 text-center py-6">No tasks yet.</div>
        ) : (
          tasks.map((t) => {
            const mine = t.claimedBy === myId;
            return (
              <div
                key={t.id}
                className={`rounded border p-2.5 ${t.overdue ? "border-danger bg-error-soft" : "border-base-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-base-900 break-words">
                      {t.priority === "urgent" && <span className="text-danger mr-1">●</span>}
                      {t.title}
                    </div>
                    {t.detail && <div className="text-[11px] text-base-500 mt-0.5">{t.detail}</div>}
                  </div>
                  <span className={`pill ${t.overdue ? "pill-overdue" : STATUS_PILL[t.status]} shrink-0`}>
                    {t.overdue ? "overdue" : t.status}
                  </span>
                </div>

                {/* meta: who + when */}
                <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-base-500 flex-wrap">
                  {t.overdue && (
                    <span className="inline-flex items-center gap-0.5 text-danger font-semibold">
                      <Clock size={11} /> &gt;{t.slaMinutes}m no action
                    </span>
                  )}
                  {t.assignedToName && t.status === "open" && <span>→ {t.assignedToName}</span>}
                  {t.claimedByName && (
                    <span>
                      {mine ? "you" : t.claimedByName} took it{t.claimedAt ? ` · ${ago(t.claimedAt)}` : ""}
                    </span>
                  )}
                  {t.relatedSo && <span className="font-mono">SO-{t.relatedSo}</span>}
                  {t.status === "open" && <span>{ago(t.createdAt)}</span>}
                </div>

                {/* actions */}
                <div className="flex items-center gap-1.5 mt-2">
                  {t.status === "open" && (
                    <button
                      type="button"
                      onClick={() => actMut.mutate({ id: t.id, action: "claim" })}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold bg-base-900 text-white px-2.5 py-1 rounded hover:bg-base-800"
                    >
                      <Hand size={12} /> Take it
                    </button>
                  )}
                  {t.status === "claimed" && (
                    <button
                      type="button"
                      onClick={() => actMut.mutate({ id: t.id, action: "done" })}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold bg-success text-white px-2.5 py-1 rounded hover:opacity-90"
                    >
                      <Check size={12} /> Done
                    </button>
                  )}
                  {(t.status === "done" || t.status === "cancelled") && (
                    <button
                      type="button"
                      onClick={() => actMut.mutate({ id: t.id, action: "reopen" })}
                      className="inline-flex items-center gap-1 text-[11px] text-base-500 px-2 py-1 rounded hover:bg-base-100"
                    >
                      <RotateCcw size={12} /> Reopen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(t.id)}
                    className="ml-auto p-1 rounded text-base-400 hover:text-danger hover:bg-base-100"
                    aria-label="Delete task"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
