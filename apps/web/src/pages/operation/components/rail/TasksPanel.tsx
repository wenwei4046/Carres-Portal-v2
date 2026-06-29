import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Circle,
  CircleCheckBig,
  Trash2,
  Clock,
  Hand,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  OpsTask,
  OpsTeamMember,
  CreateOpsTaskInput,
  UpdateOpsTaskInput,
} from "@carres/shared";

/**
 * TasksPanel — Gmail-Tasks-style board (Jess "follow gmail design"). A circle
 * checkbox marks a task done (→ strikethrough, into a "Completed" section);
 * COO/manager assigns work, a staff "Take it" claims it (records who), and a
 * 60-min SLA flags overdue in red (red count badge on the rail Tasks icon).
 */
export const TASKS_KEY = ["ops", "tasks"] as const;

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function TasksPanel() {
  const qc = useQueryClient();
  const myId = useAuth((s) => s.session)?.user?.id ?? null;
  // Mine / All scope (Jess 2026-06-29): the team is NOT siloed — everyone sees +
  // acts on ALL follow-ups, so the DEFAULT is "All". "Assign" only marks the MAIN
  // responsible person; "Mine" is an optional focus filter, not a lock.
  const [scope, setScope] = useState<"mine" | "all">("all");

  const { data, isLoading } = useQuery<{ tasks: OpsTask[] }>({
    queryKey: TASKS_KEY,
    queryFn: () => apiFetch("/api/ops/tasks"),
    refetchInterval: 60_000,
  });
  const membersQ = useQuery<{ members: OpsTeamMember[] }>({
    queryKey: ["ops", "tasks", "members"],
    queryFn: () => apiFetch("/api/ops/tasks/members"),
  });
  const tasks = data?.tasks ?? [];
  const members = membersQ.data?.members ?? [];
  const isMine = (t: OpsTask) => t.assignedTo === myId || t.claimedBy === myId;
  const showMine = scope === "mine" && !!myId;
  const active = tasks.filter(
    (t) => (t.status === "open" || t.status === "claimed") && (!showMine || isMine(t)),
  );
  const completed = tasks.filter((t) => t.status === "done" || t.status === "cancelled");
  const mineOpen = tasks.filter(
    (t) => isMine(t) && (t.status === "open" || t.status === "claimed"),
  ).length;

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
  const act = (id: string, action: "claim" | "done" | "reopen") =>
    actMut.mutate({ id, action });

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [showDone, setShowDone] = useState(false);

  function submit() {
    if (!title.trim()) return;
    createMut.mutate(
      { title: title.trim(), assignedTo: assignTo || null, priority: urgent ? "urgent" : "normal" },
      { onSuccess: () => { setTitle(""); setAssignTo(""); setUrgent(false); setAdding(false); } },
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mine / All scope — each operator works their own queue by default. */}
      <div className="flex items-center gap-1 mb-2">
        {(["mine", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
              scope === s ? "bg-base-900 text-white" : "text-base-500 hover:bg-base-100"
            }`}
          >
            {s === "mine" ? `Mine${mineOpen ? ` ${mineOpen}` : ""}` : "All"}
          </button>
        ))}
      </div>
      {/* Composer — Gmail Tasks "+ Add a task" */}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-1 py-2 text-[13px] text-primary font-medium hover:bg-base-50 rounded mb-1"
        >
          <Plus size={16} /> Add a task
        </button>
      ) : (
        <div className="rounded-lg border border-base-200 shadow-sm p-2.5 mb-2 space-y-1.5">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Task title…"
            className="w-full text-[13px] focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="flex-1 text-[11px] px-1.5 py-1 border border-base-200 rounded bg-white"
            >
              <option value="">Anyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setUrgent((u) => !u)}
              className={`text-[10px] font-semibold uppercase px-2 py-1 rounded border ${urgent ? "border-danger text-danger bg-error-soft" : "border-base-200 text-base-500"}`}
            >
              Urgent
            </button>
            <button type="button" onClick={() => { setAdding(false); setTitle(""); }} className="text-[12px] text-base-500 px-1.5 py-1">Cancel</button>
            <button
              type="button"
              disabled={!title.trim() || createMut.isPending}
              onClick={submit}
              className="text-[12px] font-semibold text-primary px-2 py-1 rounded hover:bg-primary/5 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Active tasks */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-[12px] text-base-400 text-center py-6">Loading…</div>
        ) : active.length === 0 ? (
          <div className="text-[12px] text-base-400 text-center py-6">No tasks. Nice.</div>
        ) : (
          active.map((t) => (
            <TaskRow key={t.id} t={t} myId={myId} onAct={act} onDelete={() => deleteMut.mutate(t.id)} />
          ))
        )}

        {/* Completed section */}
        {completed.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowDone((s) => !s)}
              className="flex items-center gap-1 text-[12px] font-medium text-base-600 px-1 py-1.5 hover:bg-base-50 rounded w-full"
            >
              {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Completed ({completed.length})
            </button>
            {showDone &&
              completed.map((t) => (
                <TaskRow key={t.id} t={t} myId={myId} onAct={act} onDelete={() => deleteMut.mutate(t.id)} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  t,
  myId,
  onAct,
  onDelete,
}: {
  t: OpsTask;
  myId: string | null;
  onAct: (id: string, action: "claim" | "done" | "reopen") => void;
  onDelete: () => void;
}) {
  const done = t.status === "done" || t.status === "cancelled";
  return (
    <div className="group flex items-start gap-2.5 px-1 py-2 border-b border-base-100 hover:bg-base-50 rounded">
      <button
        type="button"
        onClick={() => onAct(t.id, done ? "reopen" : "done")}
        className="mt-0.5 shrink-0"
        aria-label={done ? "Mark not done" : "Mark done"}
      >
        {done ? (
          <CircleCheckBig size={17} className="text-success" />
        ) : (
          <Circle size={17} className={t.overdue ? "text-danger" : "text-base-400 hover:text-base-700"} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] leading-snug ${done ? "line-through text-base-400" : "text-base-900"}`}>
          {t.priority === "urgent" && !done && <span className="text-danger font-bold">! </span>}
          {t.title}
        </div>
        {!done && (
          <div className="text-[11px] text-base-500 flex items-center gap-2 flex-wrap mt-0.5">
            {t.overdue && (
              <span className="inline-flex items-center gap-0.5 text-danger font-semibold">
                <Clock size={11} /> overdue
              </span>
            )}
            {t.status === "open" ? (
              <button
                type="button"
                onClick={() => onAct(t.id, "claim")}
                className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline"
              >
                <Hand size={11} /> Take it
              </button>
            ) : (
              t.claimedByName && (
                <span>{t.claimedBy === myId ? "you" : t.claimedByName} took it</span>
              )
            )}
            {t.assignedToName && t.status === "open" && <span>→ {t.assignedToName}</span>}
            {t.relatedSo && <span className="font-mono">SO-{t.relatedSo}</span>}
            <span>{ago(t.createdAt)}</span>
          </div>
        )}
        {/* Completed-row report: who finished it + when (the COO's "done" signal). */}
        {done && (
          <div className="text-[11px] text-base-400 flex items-center gap-1 flex-wrap mt-0.5">
            {t.status === "cancelled" ? (
              <span className="font-medium">Cancelled</span>
            ) : (
              <>
                <span className="text-success font-medium">Done</span>
                {t.claimedByName && (
                  <span>by {t.claimedBy === myId ? "you" : t.claimedByName}</span>
                )}
                {t.doneAt && <span>· {ago(t.doneAt)}</span>}
              </>
            )}
            {t.relatedSo && <span className="font-mono">SO-{t.relatedSo}</span>}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-base-400 hover:text-danger shrink-0"
        aria-label="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
