import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CASE_DELAY_REASONS,
  CASE_DELAY_REASON_LABEL,
  CASE_SLA_WORKING_DAYS,
  caseDelayNeedsNote,
  caseDelayReasonLabel,
  caseSlaAction,
  caseSlaClock,
  caseSlaCountLabel,
  caseSlaExtensionMax,
  caseSlaRecordProblem,
  caseSlaWorkingDay,
  myHolidaySet,
  type CaseDelayReason,
  type CaseSlaEvent,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";

/**
 * S4 — the deadline. **No case silently passes day 14.**
 *
 * Every case is finished within 14 WORKING days of the day it was reported.
 * Four working days before that, the card asks for one thing: ring the customer
 * and say why it is taking longer, with a reason picked from the locked list.
 *
 * The deadline is DERIVED here, from the same shared clock the list column and
 * the server's own gate read — there is no number stored anywhere to go stale.
 * What the screen writes is the opposite half: that somebody rang, on a date,
 * with a reason (and, once per case, that the deadline was moved).
 *
 * Nothing here is a tick-box. The call closes because a fact exists, exactly as
 * S3's steps do (ACTION-FLOW-STANDARD Law 2).
 */
export default function CaseDeadline({
  caseId,
  openedAt,
  closed,
  customerName,
  events,
}: {
  caseId: string;
  openedAt: string | null;
  closed: boolean;
  customerName: string | null;
  events: CaseSlaEvent[];
}) {
  const [form, setForm] = useState<"customer_told" | "extension" | null>(null);
  const holidayOpts = useMemo(() => ({ holidays: myHolidaySet() }), []);

  const clock = caseSlaClock(
    { openedAt, todayIso: todayLocal(), events, closed, customerName },
    holidayOpts,
  );
  const action = caseSlaAction(clock, customerName);
  const count = caseSlaCountLabel(clock);

  const extension = events.find((e) => e.kind === "extension") ?? null;
  const calls = events.filter((e) => e.kind === "customer_told");

  if (!clock.dueIso) {
    return (
      <div className="rounded border border-base-200 bg-base-50 p-3">
        <p className="text-meta uppercase tracking-wider text-base-500">Deadline</p>
        <p className="mt-1 text-body text-base-700">
          This case has no report date, so it has no deadline. Set the Opened date above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-base-200 bg-base-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-meta uppercase tracking-wider text-base-500">Deadline</p>
          <p className="mt-0.5 text-body font-medium text-base-900 tabular-nums">
            {fmtDate(clock.dueIso)}
          </p>
        </div>
        {count && (
          <span
            className={`text-meta tabular-nums ${
              clock.state === "late" ? "text-error-700" : "text-base-600"
            }`}
          >
            {count}
          </span>
        )}
      </div>

      {/* The rule, where the work is — not learnt by being refused. */}
      <p className="text-meta mt-1 text-base-500">
        {closed
          ? `This case is closed. Every case is finished within ${CASE_SLA_WORKING_DAYS} working days of the day it was reported.`
          : `Every case is finished within ${CASE_SLA_WORKING_DAYS} working days of the day it was reported.`}
      </p>

      {/* What has already been said, and to whom. A fact per line. */}
      {(extension || calls.length > 0) && (
        <ul className="mt-2 space-y-1">
          {extension && (
            <li className="rounded border border-base-200 bg-white px-2.5 py-1.5">
              <span className="block text-body text-base-800">
                Deadline moved once — {fmtDate(clock.baseDueIso ?? "")} to{" "}
                {fmtDate(extension.until ?? "")}
              </span>
              <span className="text-meta block text-base-500">
                {fmtDate(extension.on)} · {caseDelayReasonLabel(extension.reason)}
                {extension.note ? ` · ${extension.note}` : ""} · recorded by{" "}
                {extension.byRole || "unknown"}
              </span>
            </li>
          )}
          {calls.map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded border border-base-200 bg-white px-2.5 py-1.5">
              <span className="block text-body text-base-800">
                {(customerName ?? "").trim() || "The customer"} was told why it is taking longer
              </span>
              <span className="text-meta block text-base-500">
                {fmtDate(e.on)} · {caseDelayReasonLabel(e.reason)}
                {e.note ? ` · ${e.note}` : ""} · recorded by {e.byRole || "unknown"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The ONE thing S4 ever asks a human to do. */}
      {action && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded border border-base-200 bg-white px-2.5 py-2">
          <span className="text-body font-medium text-base-900">{action}</span>
          <button
            type="button"
            onClick={() => setForm(form === "customer_told" ? null : "customer_told")}
            className="btn-secondary shrink-0 py-1 text-meta"
          >
            Record
          </button>
        </div>
      )}

      {form === "customer_told" && (
        <RecordDeadlineForm
          caseId={caseId}
          kind="customer_told"
          clock={clock}
          holidayOpts={holidayOpts}
          onDone={() => setForm(null)}
        />
      )}

      {!closed && clock.mayExtend && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-meta text-base-500">
            Parts on special order? The deadline can be moved once.
          </span>
          <button
            type="button"
            onClick={() => setForm(form === "extension" ? null : "extension")}
            className="btn-secondary shrink-0 py-1 text-meta"
          >
            Move the deadline
          </button>
        </div>
      )}

      {form === "extension" && (
        <RecordDeadlineForm
          caseId={caseId}
          kind="extension"
          clock={clock}
          holidayOpts={holidayOpts}
          onDone={() => setForm(null)}
        />
      )}
    </div>
  );
}

/**
 * One deadline event. The FORM is the checklist: what closes the call is the
 * reason landing in the ledger, not somebody asserting they rang.
 *
 * The button goes dark for exactly the sentence the server would refuse with —
 * both ask `caseSlaRecordProblem`, so the screen can never be more permissive
 * than the rule (or more strict, which teaches people to distrust it).
 */
function RecordDeadlineForm({
  caseId,
  kind,
  clock,
  holidayOpts,
  onDone,
}: {
  caseId: string;
  kind: "customer_told" | "extension";
  clock: ReturnType<typeof caseSlaClock>;
  holidayOpts: { holidays: Set<string> };
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [on, setOn] = useState(todayLocal());
  const [reason, setReason] = useState<CaseDelayReason | "">("");
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");

  const max = caseSlaExtensionMax(clock.baseDueIso, holidayOpts);
  // A Sunday or a public holiday is not a deadline anybody works to; it moves
  // forward, and the screen says so before the operator presses anything.
  const movedUntil = until ? caseSlaWorkingDay(until, holidayOpts) : "";

  const problem = caseSlaRecordProblem(
    { kind, on, reason, note, until: movedUntil || null },
    clock,
    holidayOpts,
  );

  const saveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/ops/service-cases/${caseId}/sla`, {
        method: "POST",
        body: JSON.stringify({
          kind,
          on,
          reason,
          note: note.trim() || undefined,
          until: kind === "extension" ? movedUntil : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "service-cases"] });
      onDone();
    },
  });

  return (
    <div className="mt-2 space-y-2 border-t border-base-200 pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-meta text-base-500">
          Date you told the customer
          <input
            type="date"
            value={on}
            onChange={(e) => setOn(e.target.value)}
            className="mt-1 block rounded border border-base-300 px-2 py-1 text-body"
          />
        </label>

        {kind === "extension" && (
          <label className="text-meta text-base-500">
            New deadline
            <input
              type="date"
              value={until}
              min={clock.baseDueIso ?? undefined}
              max={max ?? undefined}
              onChange={(e) => setUntil(e.target.value)}
              className="mt-1 block rounded border border-base-300 px-2 py-1 text-body"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={!!problem || saveMut.isPending}
          className="btn-primary py-1.5 text-body disabled:opacity-40"
        >
          {saveMut.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <label className="text-meta block text-base-500">
        Why is it taking longer?
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as CaseDelayReason)}
          className="mt-1 block w-full rounded border border-base-300 bg-white px-2 py-1 text-body"
        >
          {/* No default — a silent default records a reason nobody chose. */}
          <option value="">— pick one —</option>
          {CASE_DELAY_REASONS.map((r) => (
            <option key={r} value={r}>
              {CASE_DELAY_REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </label>

      <label className="text-meta block text-base-500">
        {reason && caseDelayNeedsNote(reason)
          ? "Say what the reason is"
          : "Anything to add? (optional)"}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={reason && caseDelayNeedsNote(reason) ? "Factory closed for the holiday" : ""}
          className="mt-1 w-full rounded border border-base-300 px-2 py-1 text-body"
        />
      </label>

      {kind === "extension" && movedUntil && movedUntil !== until && (
        <p className="text-meta text-base-600">
          {fmtDate(until)} is not a working day — the deadline lands on {fmtDate(movedUntil)}.
        </p>
      )}

      {problem && <p className="text-meta text-base-600">{problem}</p>}

      {saveMut.isError && (
        <p className="text-meta break-words text-error-700">
          Could not save: {(saveMut.error as Error)?.message ?? "unknown error"}
        </p>
      )}
    </div>
  );
}

/** Today in the operator's own timezone. `toISOString()` is UTC, which is
 *  yesterday in Malaysia until 8 AM — the wrong day to count a deadline from. */
function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}
