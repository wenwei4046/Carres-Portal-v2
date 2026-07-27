import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  CASE_REPORTERS,
  CASE_PRODUCT_CATEGORIES,
  CASE_USABLE_OPTIONS,
  CASE_WANTS,
  caseEvidenceComplete,
  caseEvidenceGapMessage,
  caseEvidenceGaps,
  caseFollowUpPlan,
  caseIntakeComplete,
  caseIssuesFor,
  caseNeedsManager,
  casePriorityFor,
  caseProductCategory,
  caseProductCategoryLabel,
  composeCaseSummary,
  type CaseIssueKey,
  type CaseLookupOrder,
  type CaseLookupResponse,
  type CaseProductCategory,
  type CaseReporterKey,
  type CaseUsableKey,
  type CaseWantKey,
  type ServiceCaseConfig,
} from "@carres/shared";
import CaseEvidenceChecklist from "./CaseEvidenceChecklist";
import type { UploadedEvidence } from "@/lib/case-evidence-upload";

/**
 * New Service Case — the guided intake (S1).
 *
 * REPLACES the free-form entry of ServiceCaseModal for CREATE only. The modal
 * survives for EDIT, the list, the statuses and the printable Service Note are
 * untouched.
 *
 * Five questions, one screen each, every answer a button. The only typing left
 * is the customer's name when no sales order can be found, and an optional
 * "anything else" note at the end — Jess's copy law: staff click choices, free
 * text only as an optional last field.
 *
 * The case row it writes is the SAME row the modal writes: the five answers land
 * in their own columns (0285) AND get composed into `what_happened`, so every
 * existing reader keeps working without knowing the wizard exists.
 */

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const LAST_STEP: Step = 6;
const STEPS: Step[] = [1, 2, 3, 4, 5, 6];

const STEP_TITLE: Record<Step, string> = {
  1: "Who found it?",
  2: "Which product?",
  3: "What is wrong?",
  4: "Can the customer still use it?",
  5: "What does the customer want?",
  // S2 — the last question is not a question. What is wrong (step 3) decides
  // which photos this case cannot be filed without.
  6: "Take the photos",
};

export default function ServiceCaseWizard({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // ── the five answers ───────────────────────────────────────────────────────
  const [reportedBy, setReportedBy] = useState<CaseReporterKey | null>(null);
  const [issueType, setIssueType]   = useState<CaseIssueKey | null>(null);
  const [usable, setUsable]         = useState<CaseUsableKey | null>(null);
  const [wants, setWants]           = useState<CaseWantKey[]>([]);

  // ── step 2 · the product (and the order link that comes free with it) ──────
  const [lookupTerm, setLookupTerm] = useState("");
  const [lookupMsg, setLookupMsg]   = useState<string | null>(null);
  const [order, setOrder]           = useState<CaseLookupOrder | null>(null);
  const [lineId, setLineId]         = useState<string | null>(null);
  /** Set only on the no-sales-order path, where nothing can derive the family. */
  const [manualCategory, setManualCategory] = useState<CaseProductCategory | null>(null);
  const [manualName, setManualName]         = useState("");
  const [noOrder, setNoOrder]               = useState(false);

  const [note, setNote] = useState("");

  /**
   * S2 — the case's evidence, uploaded BEFORE the case exists.
   *
   * "No evidence, no case" means the files cannot wait for a case row to hang
   * on, so the wizard mints its own id and the uploads are keyed to it; the
   * create call hands the paths over and the server checks they really came
   * from this draft. Minted ONCE per wizard (useState initialiser, not a plain
   * call) — a re-render that re-minted it would orphan everything uploaded so
   * far and the server would refuse the create.
   */
  const [draftId] = useState(() => crypto.randomUUID());
  const [evidence, setEvidence] = useState<UploadedEvidence[]>([]);

  const configQ = useQuery<ServiceCaseConfig>({
    queryKey: ["ops", "service-cases", "config"],
    queryFn: () => apiFetch("/api/ops/service-cases/config"),
    staleTime: 5 * 60_000,
  });

  const line = useMemo(
    () => order?.lines.find((l) => l.id === lineId) ?? null,
    [order, lineId],
  );

  /** The chosen line decides the family; the manual path asks for it outright. */
  const category: CaseProductCategory | null = line
    ? caseProductCategory(line.sku)
    : manualCategory;

  const priority = casePriorityFor(usable);

  const answers = {
    reportedBy,
    productCategory: category,
    productSku: line?.sku ?? null,
    productQty: line?.qty ?? null,
    issueType,
    usable,
    customerWants: wants,
  };

  const customerName = (order?.customerName || manualName).trim();

  /** S3 — what filing this case sets in motion. Derived from the same answers,
   *  so the preview cannot promise work the case will not carry. */
  const followUps = caseFollowUpPlan({ customerWants: wants, customerName });

  const lookupMut = useMutation({
    mutationFn: (term: string) => {
      const t = term.trim();
      const isSo = /^s[o0]?-?\d+$/i.test(t) || /^\d{3,}$/.test(t);
      const qp = isSo ? `so=${encodeURIComponent(t)}` : `ref=${encodeURIComponent(t)}`;
      return apiFetch(`/api/ops/service-cases/lookup?${qp}`) as Promise<CaseLookupResponse>;
    },
    onSuccess: (res) => {
      if (res.order) {
        setOrder(res.order);
        setNoOrder(false);
        setLineId(res.order.lines.length === 1 ? res.order.lines[0].id : null);
        setLookupMsg(null);
      } else if (res.matches > 1) {
        setOrder(null);
        setLookupMsg(`${res.matches} sales orders matched. Type the SO number instead.`);
      } else {
        setOrder(null);
        setLookupMsg("No sales order found with that number.");
      }
    },
    onError: () => setLookupMsg("Could not search right now. Try again, or continue without a sales order."),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const summary = composeCaseSummary(answers);
      const body = {
        orderId:      order?.id ?? undefined,
        refNo:        order?.refNos[0] ?? undefined,
        customerName,
        customerPhone:   order?.customerPhone ?? undefined,
        customerAddress: order?.customerAddress ?? undefined,
        // Status starts at the first configured status (Pending). Case Type is
        // left unset on purpose — it is a separate classification axis the five
        // questions do not ask; it stays editable in the case view.
        statusId: configQ.data?.statuses[0]?.id ?? null,
        // Prose is a RENDER of the answers, never a second source of truth.
        whatHappened: note.trim() ? `${summary} Note: ${note.trim()}` : summary,

        reportedBy:      reportedBy ?? undefined,
        orderLineId:     lineId ?? undefined,
        productSku:      line?.sku ?? undefined,
        productCategory: category ?? undefined,
        issueType:       issueType ?? undefined,
        usable:          usable ?? undefined,
        customerWants:   wants,

        // S2 — the evidence. `at` / `by` are NOT sent: the server stamps them.
        draftId,
        evidence,
      };
      return apiFetch("/api/ops/service-cases", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "service-cases"] });
      onSaved();
    },
  });

  // ── what lets each step advance ────────────────────────────────────────────
  // S2 — the same `caseEvidenceGaps` the server refuses with, so the button and
  // the refusal can never disagree about what "enough" means.
  const evidenceGaps = caseEvidenceGaps(issueType, reportedBy, evidence);

  const canAdvance: Record<Step, boolean> = {
    1: !!reportedBy,
    2: (!!line || (noOrder && !!manualCategory)) && customerName.length > 0,
    3: !!issueType,
    4: !!usable,
    5: wants.length > 0,
    6:
      caseIntakeComplete(answers) &&
      customerName.length > 0 &&
      caseEvidenceComplete(issueType, reportedBy, evidence),
  };

  function goNext() {
    if (!canAdvance[step]) return;
    if (step < LAST_STEP) setStep((step + 1) as Step);
  }

  /** Changing the product can invalidate an already-picked issue (a mattress
   *  does not offer "Colour uneven"). Clear it rather than file a key the
   *  category never offered. */
  function pickLine(id: string | null, cat?: CaseProductCategory | null) {
    setLineId(id);
    if (cat !== undefined) setManualCategory(cat);
    setIssueType(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        {/* Header + progress */}
        <div className="border-b border-base-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((step - 1) as Step)}
                  className="text-base-400 hover:text-base-700"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h2 className="t-h3 text-base-900">New Case</h2>
            </div>
            <button type="button" onClick={onClose} className="text-base-400 hover:text-base-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((s) => (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s < step ? "bg-base-900" : s === step ? "bg-primary" : "bg-base-200"
                }`}
              />
            ))}
          </div>
          <p className="t-tiny mt-2 text-base-500">
            Step {step} of {LAST_STEP}
          </p>
        </div>

        <div className="px-6 py-5">
          <h3 className="t-h4 mb-4 text-base-900">{STEP_TITLE[step]}</h3>

          {/* ── 1 · who found it ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CASE_REPORTERS.map((r) => (
                <ChoiceButton
                  key={r.key}
                  label={r.label}
                  selected={reportedBy === r.key}
                  onClick={() => { setReportedBy(r.key); setStep(2); }}
                />
              ))}
            </div>
          )}

          {/* ── 2 · which product ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded border border-base-200 bg-base-50 p-3">
                <label htmlFor="sc-lookup" className="t-tiny uppercase tracking-wider text-base-500">
                  Sales order number or Ref No
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="sc-lookup"
                    value={lookupTerm}
                    onChange={(e) => setLookupTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") lookupMut.mutate(lookupTerm); }}
                    placeholder="SO-1147  or  CR0418"
                    className="flex-1 rounded border border-base-300 px-2.5 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => lookupMut.mutate(lookupTerm)}
                    disabled={!lookupTerm.trim() || lookupMut.isPending}
                    className="btn-primary flex items-center gap-1 py-1.5 text-[13px] disabled:opacity-40"
                  >
                    <Search size={14} /> Find
                  </button>
                </div>
                {lookupMsg && <p className="mt-1.5 text-xs text-base-600">{lookupMsg}</p>}
              </div>

              {order && (
                <div>
                  <p className="t-tiny mb-2 uppercase tracking-wider text-base-500">
                    {order.so} · {order.customerName} — tap the item with the problem
                  </p>
                  {order.lines.length === 0 ? (
                    <p className="text-sm text-base-500">
                      This sales order has no items on file. Continue without a sales order below.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {order.lines.map((l) => {
                        const cat = caseProductCategory(l.sku);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => pickLine(l.id)}
                            className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left ${
                              lineId === l.id
                                ? "border-primary bg-primary/5"
                                : "border-base-200 bg-white hover:bg-hovertint"
                            }`}
                          >
                            <span className="flex-1">
                              <span className="block font-mono text-[13px] text-base-900">{l.sku}</span>
                              <span className="t-tiny text-base-500">
                                {caseProductCategoryLabel(cat)} · qty {l.qty}
                              </span>
                            </span>
                            {lineId === l.id && <Check size={16} className="text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!noOrder && (
                <button
                  type="button"
                  onClick={() => { setNoOrder(true); setOrder(null); pickLine(null, null); }}
                  className="text-[13px] text-base-600 underline underline-offset-2 hover:text-base-900"
                >
                  No sales order for this
                </button>
              )}

              {noOrder && (
                <div className="space-y-3 rounded border border-base-200 p-3">
                  <div>
                    <label className="t-tiny uppercase tracking-wider text-base-500">
                      What kind of product?
                    </label>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CASE_PRODUCT_CATEGORIES.map((c) => (
                        <ChoiceButton
                          key={c.key}
                          label={c.label}
                          selected={manualCategory === c.key}
                          onClick={() => pickLine(null, c.key)}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="sc-customer-name" className="t-tiny uppercase tracking-wider text-base-500">
                      Customer name
                    </label>
                    <input
                      id="sc-customer-name"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="mt-1.5 w-full rounded border border-base-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 3 · what is wrong ────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <p className="t-tiny mb-2 text-base-500">
                {category ? caseProductCategoryLabel(category) : "Product"}
                {line ? ` · ${line.sku}` : ""}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {caseIssuesFor(category ?? "other").map((i) => (
                  <ChoiceButton
                    key={i.key}
                    label={i.label}
                    selected={issueType === i.key}
                    onClick={() => { setIssueType(i.key); setStep(4); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── 4 · still usable → the priority ──────────────────────────── */}
          {step === 4 && (
            <div className="space-y-2">
              {CASE_USABLE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => { setUsable(o.key); setStep(5); }}
                  className={`flex w-full items-center gap-3 rounded border px-3 py-2.5 text-left ${
                    usable === o.key
                      ? "border-primary bg-primary/5"
                      : "border-base-200 bg-white hover:bg-hovertint"
                  }`}
                >
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-base-900">{o.label}</span>
                    <span className="t-tiny text-base-500">{o.hint}</span>
                  </span>
                  {usable === o.key && <Check size={16} className="text-primary" />}
                </button>
              ))}
              <p className="t-tiny pt-1 text-base-500">
                The system sets how urgent this is from your answer. You never pick it.
              </p>
            </div>
          )}

          {/* ── 5 · what the customer wants ──────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CASE_WANTS.map((w) => {
                  const on = wants.includes(w.key);
                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() =>
                        setWants(on ? wants.filter((x) => x !== w.key) : [...wants, w.key])
                      }
                      className={`rounded-full border px-3 py-1.5 text-[13px] ${
                        on
                          ? "border-primary bg-primary text-white"
                          : "border-base-300 bg-white text-base-700 hover:bg-hovertint"
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p className="t-tiny text-base-500">Pick every one that applies.</p>

              <div>
                <label htmlFor="sc-note" className="t-tiny uppercase tracking-wider text-base-500">
                  Anything else? (optional)
                </label>
                <textarea
                  id="sc-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Leave empty if the answers above say it all"
                  className="mt-1.5 w-full rounded border border-base-300 px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
          )}

          {/* ── 6 · the evidence + confirm ───────────────────────────────── */}
          {step === 6 && (
            <div className="space-y-4">
              <p className="t-tiny text-base-500">
                A case cannot be opened without these. Take them now, while you have the item.
              </p>

              <CaseEvidenceChecklist
                issueType={issueType}
                reportedBy={reportedBy}
                target={{ draftId }}
                files={evidence}
                onUploaded={(f) => setEvidence((prev) => [...prev, f])}
              />

              {/* What is about to be filed, in the words it will be filed in. */}
              <div className="rounded border border-base-200 bg-base-50 p-3">
                <p className="t-tiny mb-1 uppercase tracking-wider text-base-500">This case will say</p>
                <p className="text-sm text-base-800">{composeCaseSummary(answers)}</p>

                {/* S3 — the follow-ups this case starts. Shown BEFORE it is
                    filed so the answers on the last screen are visibly the
                    thing that decides the work, and nobody has to be told to
                    remember any of it. The factory is named on the case itself
                    (resolved from the SKU server-side), so it reads as "the
                    supplier" here and by name from then on. */}
                {followUps.length > 0 && (
                  <div className="mt-2 border-t border-base-200 pt-2">
                    <p className="t-tiny mb-1 uppercase tracking-wider text-base-500">
                      And starts these
                    </p>
                    <ol className="space-y-0.5">
                      {followUps.map((s) => (
                        <li key={s.key} className="text-[13px] text-base-700">
                          · {s.label}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {priority && (
                  <p className="mt-2">
                    <span className={`pill ${priority === "high" ? "pill-overdue" : "pill-neutral"}`}>
                      {priority === "high" ? "Urgent" : priority === "normal" ? "Normal" : "Low"}
                    </span>
                    {caseNeedsManager(priority) && (
                      <span className="t-tiny ml-2 text-base-700">Tell the manager about this one.</span>
                    )}
                  </p>
                )}
              </div>

              {/* Rule 6 — the disabled button says WHY, by name. Phrased as the
                  ACTION that closes the gap, not as a to-do word dressed up as a
                  fact ("still needed") — COPY-STANDARD dictionary, 2026-07-27. */}
              {evidenceGaps.length > 0 && (
                <p className="t-tiny text-base-700">
                  Take these first: {caseEvidenceGapMessage(evidenceGaps)}
                </p>
              )}

              {saveMut.isError && (
                <p className="break-words text-xs text-error-700">
                  Could not save: {(saveMut.error as Error)?.message ?? "unknown error"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-base-200 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary py-1.5 text-[13px]">
            Cancel
          </button>
          {step < LAST_STEP ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance[step]}
              className="btn-primary py-1.5 text-[13px] disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={!canAdvance[LAST_STEP] || saveMut.isPending}
              className="btn-hero py-1.5 text-[13px] disabled:opacity-40"
            >
              {saveMut.isPending ? "Saving…" : "Create Case"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-3 py-2.5 text-sm font-medium ${
        selected
          ? "border-primary bg-primary/5 text-base-900"
          : "border-base-200 bg-white text-base-700 hover:bg-hovertint"
      }`}
    >
      {label}
    </button>
  );
}
