import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  caseFollowUpPlan,
  caseMayClose,
  caseTimeline,
  type CaseFollowUpInput,
  type CaseProgressEntry,
  type CaseStep,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * S3 — the case drives the follow-ups.
 *
 * The whole chain on one card: what has happened (with the date and who
 * recorded it) and what is still owed, in the order it runs. Nobody types the
 * list and nobody can delete a line from it — the steps are derived from what
 * the customer asked for, so the screen cannot disagree with the case.
 *
 * Nothing here is a tick-box. Each step closes because a FACT the system stores
 * now exists: the date the supplier gave, the day the item came back, the day
 * the customer said it was solved (ACTION-FLOW-STANDARD Law 2 — the
 * no-decorative-checkbox law).
 */
export default function CaseFollowUps({
  caseId,
  answers,
  progress,
}: {
  caseId: string;
  answers: CaseFollowUpInput;
  progress: CaseProgressEntry[];
}) {
  const qc = useQueryClient();
  const [openStep, setOpenStep] = useState<string | null>(null);

  const plan = caseFollowUpPlan(answers);
  const rows = caseTimeline(answers, progress);
  const doneCount = rows.filter((r) => r.entry).length;
  const canClose = caseMayClose(plan, progress);

  return (
    <div className="rounded border border-base-200 bg-base-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-meta uppercase tracking-wider text-base-500">What happens next</p>
        <p className="text-meta text-base-500">
          {doneCount} of {rows.length} done
        </p>
      </div>

      <ol className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="rounded border border-base-200 bg-white px-2.5 py-2">
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  r.entry ? "border-base-900 bg-base-900 text-white" : "border-base-300 bg-white"
                }`}
              >
                {r.entry && <Check size={11} strokeWidth={3} />}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-body ${r.entry ? "text-base-600" : "text-base-900 font-medium"}`}
                >
                  {r.label}
                </span>
                {r.entry ? (
                  <span className="text-meta block text-base-500">
                    {fmtDate(r.entry.on)} · recorded by {r.entry.byRole || "unknown"}
                    {r.entry.note ? ` · ${r.entry.note}` : ""}
                  </span>
                ) : (
                  <span className="text-meta block text-base-500">{r.step?.why}</span>
                )}
              </span>

              {!r.entry && r.step && (
                <button
                  type="button"
                  onClick={() => setOpenStep(openStep === r.key ? null : r.key)}
                  className="btn-secondary shrink-0 py-1 text-meta"
                >
                  Record
                </button>
              )}
            </div>

            {!r.entry && r.step && openStep === r.key && (
              <RecordStepForm
                caseId={caseId}
                step={r.step}
                onDone={() => {
                  setOpenStep(null);
                  qc.invalidateQueries({ queryKey: ["ops", "service-cases"] });
                }}
              />
            )}
          </li>
        ))}
      </ol>

      {/* The close rule, stated where the work is — not discovered by pressing
          Save and being refused. */}
      <p className="text-meta mt-2 text-base-600">
        {canClose
          ? "Everything is done. Set the status to Resolved to close this case."
          : "This case can only be closed once every step above has a date on it."}
      </p>
    </div>
  );
}

/**
 * One step's outcome. The FORM is the checklist (COPY-STANDARD's
 * no-decorative-checkbox law): what closes the step is the date landing in the
 * ledger, not somebody asserting they did it.
 */
function RecordStepForm({
  caseId,
  step,
  onDone,
}: {
  caseId: string;
  step: CaseStep;
  onDone: () => void;
}) {
  const [on, setOn] = useState(todayLocal());
  const [note, setNote] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/ops/service-cases/${caseId}/progress`, {
        method: "POST",
        body: JSON.stringify({ step: step.key, on, note: note.trim() || undefined }),
      }),
    onSuccess: onDone,
  });

  const ready = !!on && (!step.noteRequired || note.trim().length > 0);

  return (
    <div className="mt-2 space-y-2 border-t border-base-200 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-meta text-base-500">
          {step.dateLabel}
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
            className="mt-1 block rounded border border-base-300 px-2 py-1 text-body"
          />
        </label>
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={!ready || saveMut.isPending}
          className="btn-primary py-1.5 text-body disabled:opacity-40"
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div>
        <label className="text-meta text-base-500">
          {step.noteRequired ? "What did you find?" : "Anything to add? (optional)"}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={step.noteRequired ? "Left corner seam open, 4 inches" : ""}
            className="mt-1 w-full rounded border border-base-300 px-2 py-1 text-body"
          />
        </label>
      </div>

      {saveMut.isError && (
        <p className="text-meta break-words text-error-700">
          Could not save: {(saveMut.error as Error)?.message ?? "unknown error"}
        </p>
      )}
    </div>
  );
}

/** Today in the operator's own timezone. `toISOString()` is UTC, which is
 *  yesterday in Malaysia until 8 AM — the wrong default on a date the operator
 *  is recording about today. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}
