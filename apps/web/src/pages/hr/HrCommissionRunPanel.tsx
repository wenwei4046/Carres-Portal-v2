// design-standard: not-a-list-page — the HR-P5 month-close panel above the
// commission table; the page header lives in HrApp.
import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  CircleCheck,
  CircleDot,
  Download,
  Lock,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ADJUSTMENT_REASON_LABEL,
  COMMISSION_RUN_STATUS_LABEL,
  adjustmentReasonSchema,
  blockingFailures,
  canClose,
  isMonthLocked,
  runStatusTone,
  type AdjustmentReason,
  type CommissionRunSummary,
  type ReadinessCheck,
} from "@carres/shared";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import { SectionCard } from "@/components/SectionPanel";
import {
  useAddCommissionAdjustment,
  useCloseCommissionMonth,
  useCommissionRunAction,
  useCommissionRunState,
  useCommissionRuns,
} from "@/lib/queries";

/**
 * The month close (HR-P5, migrations 0272/0273).
 *
 * The close is a PRE-FLIGHT, not a button. `commissionReadiness` in @carres/shared
 * decides what "ready" means, the API folds the same function over the same inputs,
 * and `commission_close_month` enforces the same rules again in SQL — a disabled
 * button is a courtesy, never the guarantee.
 *
 * Why that mattered on day one: with no commission rates configured, a plain Close
 * button would have frozen "RM 0" into a permanent statement for people who sold
 * RM 52,081, and then locked the month against fixing it.
 */

const PILL: Record<string, string> = {
  ready: "pill pill-confirmed",
  waiting: "pill pill-warning",
  neutral: "pill pill-neutral",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

const rm = (n: number) =>
  `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CheckRow({ c }: { c: ReadinessCheck }) {
  const tone = c.passed ? "ok" : c.blocking ? "no" : "warn";
  const cls =
    tone === "ok"
      ? "bg-success-soft text-success"
      : tone === "no"
        ? "bg-danger-soft text-danger"
        : "bg-warning-soft text-warning";
  return (
    <div className="flex items-start gap-2.5 border-t border-base-100 py-2.5 first:border-t-0">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${cls}`}>
        {tone === "ok" ? <Check size={12} /> : tone === "no" ? <X size={12} /> : <CircleDot size={12} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-tight">{c.title}</div>
        <div className="t-tiny mt-0.5 leading-relaxed text-base-400">{c.detail}</div>
      </div>
    </div>
  );
}

// ── the adjustment dialog ────────────────────────────────────────────────────

function AdjustmentDialog({
  year,
  month,
  people,
  onClose,
}: {
  year: number;
  month: number;
  people: { id: string; name: string; staffCode?: string | null }[];
  onClose: () => void;
}) {
  const add = useAddCommissionAdjustment();
  const [subjectId, setSubjectId] = useState(people[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<AdjustmentReason>("refund");
  const [originMonth, setOriginMonth] = useState("");
  const [note, setNote] = useState("");

  const amt = Number(amount);
  const valid = subjectId !== "" && Number.isFinite(amt) && amt !== 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-base-900/30 p-6">
      <div className="w-[492px] max-w-full overflow-hidden rounded-xl bg-card shadow-xl">
        <div className="px-6 pt-5">
          <h3 className="t-h3 mb-1 font-semibold">Add an adjustment</h3>
          <p className="t-small text-base-500">
            A correction that should be paid — or taken back — in {monthLabel(year, month)}.
          </p>
        </div>

        <div className="px-6 pt-3">
          <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2 first:border-t-0">
            <span className="t-tiny w-[104px] shrink-0 text-base-400">Person</span>
            <select
              className={`${fieldCls} h-8 flex-1 text-[13px]`}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.staffCode ? ` · ${p.staffCode}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2">
            <span className="t-tiny w-[104px] shrink-0 text-base-400">Reason</span>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-base-100 p-0.5">
              {adjustmentReasonSchema.options.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold ${
                    reason === r ? "bg-card text-base-900 shadow-sm" : "text-base-600"
                  }`}
                >
                  {ADJUSTMENT_REASON_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2">
            <span className="t-tiny w-[104px] shrink-0 text-base-400">Amount</span>
            <input
              className={`${fieldCls} h-8 max-w-[150px] font-mono text-[13px]`}
              placeholder="-183.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="t-tiny text-base-400">negative takes money back</span>
          </div>

          <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2">
            <span className="t-tiny w-[104px] shrink-0 text-base-400">Originally</span>
            <input
              type="month"
              className={`${fieldCls} h-8 max-w-[170px] text-[13px]`}
              value={originMonth}
              onChange={(e) => setOriginMonth(e.target.value)}
            />
            <span className="t-tiny text-base-400">which month it came from</span>
          </div>

          <div className="flex min-h-[36px] items-center gap-3 border-t border-base-100 py-2">
            <span className="t-tiny w-[104px] shrink-0 text-base-400">Note</span>
            <input
              className={`${fieldCls} h-8 flex-1 text-[13px]`}
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <p className="t-tiny mx-6 mt-3 rounded-lg border border-base-200 bg-base-50 px-3 py-2.5 leading-relaxed text-base-500">
          Goes on <b className="text-base-900">{monthLabel(year, month)}</b>, which is
          still open. An already-approved month is never edited — the statement someone
          has already seen does not change under them.
        </p>

        <div className="flex justify-end gap-2 px-6 pb-5 pt-4">
          <Btn variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Btn>
          <Btn
            variant="hero"
            disabled={!valid || add.isPending}
            onClick={() => {
              const [oy, om] = originMonth ? originMonth.split("-") : [];
              add.mutate(
                {
                  year,
                  month,
                  program: "staff",
                  subjectKind: "salesperson",
                  subjectId,
                  amount: amt,
                  reason,
                  ...(oy && om ? { originYear: Number(oy), originMonth: Number(om) } : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    toast.success(`Added to ${monthLabel(year, month)}`);
                    onClose();
                  },
                  onError: (e) => toast.error(e.message || "Could not add it"),
                },
              );
            }}
          >
            Add to {MONTHS[month - 1]}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── the panel ────────────────────────────────────────────────────────────────

export default function HrCommissionRunPanel({
  year,
  month,
  people,
  isPrincipal,
}: {
  year: number;
  month: number;
  /** For the adjustment picker — the month's sellers. */
  people: { id: string; name: string; staffCode?: string | null }[];
  isPrincipal: boolean;
}) {
  const { data: state, isLoading } = useCommissionRunState(year, month);
  const { data: runsData } = useCommissionRuns();
  const close = useCloseCommissionMonth();
  const approve = useCommissionRunAction("approve");
  const reopen = useCommissionRunAction("reopen");
  const discard = useCommissionRunAction("discard");

  const [showAdjust, setShowAdjust] = useState(false);
  const [showChecks, setShowChecks] = useState(true);

  const checks = useMemo(() => state?.checks ?? [], [state]);
  const ready = checks.length > 0 && canClose(checks);
  const blockers = blockingFailures(checks);
  const run = state?.run ?? null;
  const locked = isMonthLocked(run?.status ?? null);
  const runs: CommissionRunSummary[] = runsData?.runs ?? [];

  if (isLoading) {
    return (
      <SectionCard>
        <div className="t-small px-4 py-6 text-center text-base-500">Checking the month…</div>
      </SectionCard>
    );
  }

  // ── banner ──
  let tone = "border-l-base-300";
  let icon = <CircleDot size={19} />;
  let iconCls = "bg-base-100 text-base-600";
  let title = "This month is open";
  let sub = "Nothing has been closed yet.";

  if (run) {
    if (locked) {
      tone = "border-l-base-800";
      icon = <Lock size={19} />;
      iconCls = "bg-base-800 text-white";
      title = `${monthLabel(year, month)} is ${COMMISSION_RUN_STATUS_LABEL[run.status].toLowerCase()} and frozen`;
      sub =
        `${run.peopleCount} ${run.peopleCount === 1 ? "person" : "people"} · ${rm(run.totalPayable)}` +
        (run.approvedByName ? ` · approved by ${run.approvedByName}` : "") +
        ". Attribution and rate changes for this month are refused while it is locked.";
    } else {
      tone = "border-l-warning";
      icon = <CircleDot size={19} />;
      iconCls = "bg-warning-soft text-warning";
      title = "A draft is waiting for approval";
      sub = `${run.peopleCount} ${run.peopleCount === 1 ? "person" : "people"} · ${rm(run.totalPayable)} · closed by ${run.closedByName ?? "—"}. The figures are captured but the month is still editable.`;
    }
  } else if (ready) {
    tone = "border-l-success";
    icon = <CircleCheck size={19} />;
    iconCls = "bg-success-soft text-success";
    title = `${monthLabel(year, month)} is ready to close`;
    sub = "All checks pass. Closing freezes these figures and creates one statement per person.";
  } else if (blockers.length > 0) {
    tone = "border-l-danger";
    icon = <Ban size={19} />;
    iconCls = "bg-danger-soft text-danger";
    title = `${monthLabel(year, month)} can't be closed yet — ${blockers.length} of ${checks.length} checks failed`;
    sub =
      blockers[0]!.key === "rates"
        ? "Closing now would freeze RM 0 for people who sold, and lock the month against fixing it."
        : blockers[0]!.detail;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <div className={`flex items-center gap-3.5 border-l-[3px] px-4 py-3.5 ${tone}`}>
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconCls}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{title}</div>
            <div className="t-tiny mt-0.5 leading-relaxed text-base-500">{sub}</div>
          </div>

          {run && locked && (
            <a
              className="btn-secondary"
              href={`/api/hr/runs/${run.id}/csv`}
              onClick={(e) => e.stopPropagation()}
            >
              <Download size={14} />
              Export CSV
            </a>
          )}

          {run && !locked && isPrincipal && (
            <Btn
              variant="hero"
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate(
                  { runId: run.id },
                  {
                    onSuccess: () => toast.success("Approved — the month is now locked"),
                    onError: (e) => toast.error(e.message || "Could not approve"),
                  },
                )
              }
            >
              Approve
            </Btn>
          )}

          {run && !locked && (
            <button
              type="button"
              className="btn-danger"
              disabled={discard.isPending}
              onClick={() => {
                const reason = window.prompt("Discard this draft? Give a reason:");
                if (!reason) return;
                discard.mutate(
                  { runId: run.id, reason },
                  {
                    onSuccess: () => toast.success("Draft discarded"),
                    onError: (e) => toast.error(e.message || "Could not discard"),
                  },
                );
              }}
            >
              Discard draft
            </button>
          )}

          {run && locked && run.status === "approved" && isPrincipal && (
            <button
              type="button"
              className="btn-danger"
              disabled={reopen.isPending}
              onClick={() => {
                const reason = window.prompt("Reopen this month? Give a reason:");
                if (!reason) return;
                reopen.mutate(
                  { runId: run.id, reason },
                  {
                    onSuccess: () => toast.success("Reopened — the month is editable again"),
                    onError: (e) => toast.error(e.message || "Could not reopen"),
                  },
                );
              }}
            >
              <RotateCcw size={14} />
              Reopen
            </button>
          )}

          {!run && (
            <Btn
              variant="hero"
              disabled={!ready || close.isPending}
              onClick={() =>
                close.mutate(
                  { year, month, program: "staff" },
                  {
                    onSuccess: () => toast.success("Month closed — waiting for approval"),
                    onError: (e) => toast.error(e.message || "Could not close the month"),
                  },
                )
              }
            >
              <Lock size={14} />
              Close month
            </Btn>
          )}
        </div>

        {/* the pre-flight — hidden once the month is closed, it has done its job */}
        {!run && checks.length > 0 && (
          <div className="border-t border-base-200 px-4 pb-3.5 pt-1">
            <button
              type="button"
              className="t-micro flex w-full items-center gap-2 py-2.5 text-left text-base-400 hover:text-base-600"
              onClick={() => setShowChecks((v) => !v)}
            >
              Before the month can be closed
              <span className="flex-1" />
              <span className="t-tiny normal-case">{showChecks ? "Hide" : "Show"}</span>
            </button>
            {showChecks && checks.map((c) => <CheckRow key={c.key} c={c} />)}
          </div>
        )}
      </SectionCard>

      {/* Runs history + the adjustment door */}
      {(runs.length > 0 || !locked) && (
        <SectionCard>
          <div className="flex items-center gap-2.5 border-b border-base-200 px-4 py-3">
            <h3 className="t-h4 flex-1 font-semibold">Runs</h3>
            <span className="t-tiny text-base-400">every close, kept</span>
            {!locked && people.length > 0 && (
              <Btn variant="box" size="sm" onClick={() => setShowAdjust(true)}>
                <Plus size={14} />
                Add adjustment
              </Btn>
            )}
          </div>

          {runs.length === 0 ? (
            <div className="t-small px-4 py-5 text-center text-base-400">
              No month has been closed yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[130px_100px_1fr_80px_130px] gap-2.5 border-b border-base-200 bg-base-50 px-4 py-2">
                {["Month", "Status", "Who", "People", "Total"].map((h, i) => (
                  <span
                    key={h}
                    className={`t-micro text-base-400 ${i >= 3 ? "text-right" : ""}`}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[130px_100px_1fr_80px_130px] items-center gap-2.5 border-b border-base-100 px-4 py-2.5 text-[12.5px] last:border-b-0"
                >
                  <span className="font-semibold">{monthLabel(r.year, r.month)}</span>
                  <span>
                    <span className={PILL[runStatusTone(r.status)]}>
                      {COMMISSION_RUN_STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <span className="truncate text-base-400">
                    {r.closedByName ? `closed ${r.closedByName}` : ""}
                    {r.approvedByName ? ` · approved ${r.approvedByName}` : ""}
                  </span>
                  <span className="text-right tabular-nums">{r.peopleCount}</span>
                  <span className="text-right font-semibold tabular-nums">
                    {rm(r.totalPayable)}
                  </span>
                </div>
              ))}
            </>
          )}

          {(state?.pendingAdjustments ?? 0) !== 0 && (
            <div className="t-tiny border-t border-base-200 bg-base-50 px-4 py-2.5 text-base-500">
              {rm(state!.pendingAdjustments)} of adjustments are waiting on{" "}
              {monthLabel(year, month)} and will be folded in when it closes.
            </div>
          )}
        </SectionCard>
      )}

      {showAdjust && (
        <AdjustmentDialog
          year={year}
          month={month}
          people={people}
          onClose={() => setShowAdjust(false)}
        />
      )}
    </div>
  );
}
