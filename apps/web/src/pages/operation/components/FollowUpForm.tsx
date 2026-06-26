import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Flag, ChevronsUp, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  ESCALATE_REASONS,
  type EscalateReason,
  type CreateOpsTaskInput,
  type OpsTeamMember,
} from "@carres/shared";
import { TASKS_KEY } from "./rail/TasksPanel";

/**
 * FollowUpForm — the Orders follow-up composer (#2). A follow-up IS an ops_task
 * linked to an order: pick a preset action (the team's English is poor, so a
 * dropdown), FORCE-assign one person, set a due date, optionally mark Urgent, and
 * optionally Escalate to the principal (Jess) with a reason + a short report.
 *
 * Opened from the Orders table action flag and the order drawer. On submit it
 * POSTs /api/ops/tasks with related_order_id = this order, so it shows up in the
 * right-rail Tasks board + this order's Action column.
 */

/** Preset follow-ups — UI-only starter list (Jess to edit freely). */
const PRESET_FOLLOWUPS = [
  "Call customer — confirm delivery date",
  "Chase logistic for ETA",
  "Customer wants to change address",
  "Customer wants to postpone",
  "Check stock availability",
  "Collect balance before delivery",
  "Customer complaint — follow up",
];

const DUE_PRESETS = [
  { key: "today6", label: "Today (before 6pm)" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "in3", label: "In 3 days" },
  { key: "pick", label: "Pick a date…" },
] as const;
type DueKey = (typeof DUE_PRESETS)[number]["key"];

const ESCALATE_LABELS: Record<EscalateReason, string> = {
  discount: "Customer wants a discount",
  refund: "Customer wants a refund",
  question: "A question only Jess can answer",
  other: "Other",
};

/** A local date at 18:00 → ISO. `addDays` shifts the day first. */
function dueAtFor(key: DueKey, pick: string): string | null {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (key === "tomorrow") d.setDate(d.getDate() + 1);
  else if (key === "in3") d.setDate(d.getDate() + 3);
  else if (key === "pick") {
    if (!pick) return null;
    const [y, m, day] = pick.split("-").map(Number);
    const p = new Date(y, m - 1, day, 18, 0, 0, 0);
    return p.toISOString();
  }
  return d.toISOString();
}

export default function FollowUpForm({
  orderId,
  so,
  refNo,
  onClose,
}: {
  orderId: string;
  so: number | null;
  refNo?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const membersQ = useQuery<{ members: OpsTeamMember[] }>({
    queryKey: ["ops", "tasks", "members"],
    queryFn: () => apiFetch("/api/ops/tasks/members"),
  });
  const members = membersQ.data?.members ?? [];

  const createMut = useMutation({
    mutationFn: (body: CreateOpsTaskInput) =>
      apiFetch("/api/ops/tasks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY });
      onClose();
    },
  });

  const [preset, setPreset] = useState<string>(PRESET_FOLLOWUPS[0]);
  const [freeTitle, setFreeTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [dueKey, setDueKey] = useState<DueKey>("today6");
  const [duePick, setDuePick] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [escalate, setEscalate] = useState(false);
  const [escReason, setEscReason] = useState<EscalateReason>("question");
  const [escNote, setEscNote] = useState("");

  const title = preset === "__other__" ? freeTitle.trim() : preset;
  const dueMissing = dueKey === "pick" && !duePick;
  const canSubmit =
    !!title && !!assignTo && !dueMissing && (!escalate || !!escNote.trim()) && !createMut.isPending;

  function submit() {
    if (!canSubmit) return;
    createMut.mutate({
      title,
      detail: detail.trim() || null,
      assignedTo: assignTo,
      priority: urgent ? "urgent" : "normal",
      dueAt: dueAtFor(dueKey, duePick),
      relatedOrderId: orderId,
      escalateReason: escalate ? escReason : null,
      escalateNote: escalate ? escNote.trim() : null,
    });
  }

  const fieldCls =
    "w-full text-[13px] px-2 py-1.5 border border-base-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary/40";
  const labelCls = "block t-micro text-base-500 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-100">
          <div className="flex items-center gap-2">
            <Flag size={16} className="text-primary" />
            <h2 className="t-h4">New follow-up</h2>
            {so && (
              <span className="t-tiny font-mono text-base-500">
                SO-{so}
                {refNo ? ` · ${refNo}` : ""}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-base-100 text-base-500">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Title — preset dropdown (+ free text on Other) */}
          <div>
            <label className={labelCls}>What to follow up</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value)} className={fieldCls}>
              {PRESET_FOLLOWUPS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__other__">Other (type below)…</option>
            </select>
            {preset === "__other__" && (
              <input
                autoFocus
                value={freeTitle}
                onChange={(e) => setFreeTitle(e.target.value)}
                placeholder="Type the follow-up…"
                className={`${fieldCls} mt-1.5`}
              />
            )}
          </div>

          {/* Assign — FORCED to one person */}
          <div>
            <label className={labelCls}>Assign to (required)</label>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className={`${fieldCls} ${!assignTo ? "text-base-400" : ""}`}
            >
              <option value="" disabled>Choose one person…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
              ))}
            </select>
          </div>

          {/* Due + Urgent */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>Finish by</label>
              <select value={dueKey} onChange={(e) => setDueKey(e.target.value as DueKey)} className={fieldCls}>
                {DUE_PRESETS.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
              {dueKey === "pick" && (
                <input
                  type="date"
                  value={duePick}
                  onChange={(e) => setDuePick(e.target.value)}
                  className={`${fieldCls} mt-1.5`}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setUrgent((u) => !u)}
              className={`shrink-0 t-micro px-2.5 py-2 rounded-md border ${
                urgent ? "border-danger text-danger bg-error-soft" : "border-base-200 text-base-500"
              }`}
            >
              Urgent
            </button>
          </div>

          {/* Optional detail */}
          <div>
            <label className={labelCls}>Note (optional)</label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              placeholder="Any extra detail for whoever takes it…"
              className={`${fieldCls} resize-none`}
            />
          </div>

          {/* Escalate to Jess — click to reveal */}
          <div className="rounded-md border border-base-200">
            <button
              type="button"
              onClick={() => setEscalate((v) => !v)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-[13px] font-medium rounded-md ${
                escalate ? "text-danger" : "text-base-600"
              }`}
            >
              <ChevronsUp size={15} />
              Escalate to Jess
              <span className="ml-auto t-tiny text-base-400">{escalate ? "on" : "needs the boss?"}</span>
            </button>
            {escalate && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-base-100 pt-2">
                <div>
                  <label className={labelCls}>Reason</label>
                  <select
                    value={escReason}
                    onChange={(e) => setEscReason(e.target.value as EscalateReason)}
                    className={fieldCls}
                  >
                    {ESCALATE_REASONS.map((r) => (
                      <option key={r} value={r}>{ESCALATE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Report to Jess (required)</label>
                  <textarea
                    value={escNote}
                    onChange={(e) => setEscNote(e.target.value)}
                    rows={2}
                    placeholder="Briefly: what happened + what you need from Jess…"
                    className={`${fieldCls} resize-none`}
                  />
                </div>
              </div>
            )}
          </div>

          {createMut.isError && (
            <div className="flex items-center gap-1.5 t-tiny text-danger">
              <AlertTriangle size={13} /> Couldn’t save — try again.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-base-100">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="button" onClick={submit} disabled={!canSubmit} className="btn-hero disabled:opacity-40">
            {createMut.isPending ? "Saving…" : "Create follow-up"}
          </button>
        </div>
      </div>
    </div>
  );
}
