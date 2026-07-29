import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  CASE_REPORTERS,
  caseFollowUpPlan,
  caseIssueLabel,
  caseMayClose,
  caseNeedsManager,
  caseProductCategoryLabel,
  caseUsableLabel,
  caseWantLabel,
  type CaseLookupResponse,
  type ServiceCase,
  type ServiceCaseConfig,
} from "@carres/shared";
import { Search, X } from "lucide-react";
import CaseOrderLink from "./CaseOrderLink";
import CaseEvidenceGallery from "./CaseEvidenceGallery";
import CaseFollowUps from "./CaseFollowUps";
import CaseDeadline from "./CaseDeadline";

/**
 * Create / edit a Service Case (病历).
 *
 * Lookup: type a Ref No (AutoCount, e.g. CR0418) OR an Order ID (SO-1147) and
 * hit Find — the order's customer is auto-filled. 0 or >1 matches → the fields
 * stay editable for manual entry (per Loo: Ref No may be ambiguous / retired).
 *
 * Case Type + Status come from the config tables (never hardcoded).
 */
export default function ServiceCaseModal({
  mode,
  id,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  id?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();

  const configQ = useQuery<ServiceCaseConfig>({
    queryKey: ["ops", "service-cases", "config"],
    queryFn: () => apiFetch("/api/ops/service-cases/config"),
    staleTime: 5 * 60_000,
  });

  const existingQ = useQuery<ServiceCase>({
    queryKey: ["ops", "service-cases", id],
    queryFn: () => apiFetch(`/api/ops/service-cases/${id}`),
    enabled: mode === "edit" && !!id,
  });

  // ── form state ──────────────────────────────────────────────────────────────
  const [orderId, setOrderId]     = useState<string | null>(null);
  const [refNo, setRefNo]         = useState("");
  const [customerName, setCustomerName]       = useState("");
  const [customerPhone, setCustomerPhone]     = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [caseTypeId, setCaseTypeId]   = useState<string>("");
  const [statusId, setStatusId]       = useState<string>("");
  const [whatHappened, setWhatHappened]       = useState("");
  const [carresAction, setCarresAction]       = useState("");
  const [whatAffected, setWhatAffected]       = useState("");
  const [incurredCharges, setIncurredCharges] = useState("");
  const [openedAt, setOpenedAt] = useState(today());

  // lookup state
  const [lookupTerm, setLookupTerm] = useState("");
  const [lookupMsg, setLookupMsg]   = useState<string | null>(null);
  const [matchedSo, setMatchedSo]   = useState<string | null>(null);

  // hydrate edit form
  useEffect(() => {
    const d = existingQ.data;
    if (!d) return;
    setOrderId(d.orderId);
    setRefNo(d.refNo ?? "");
    setCustomerName(d.customerName ?? "");
    setCustomerPhone(d.customerPhone ?? "");
    setCustomerAddress(d.customerAddress ?? "");
    setCaseTypeId(d.caseTypeId ?? "");
    setStatusId(d.statusId ?? "");
    setWhatHappened(d.whatHappened ?? "");
    setCarresAction(d.carresAction ?? "");
    setWhatAffected(d.whatAffected ?? "");
    setIncurredCharges(d.incurredCharges ?? "");
    setOpenedAt(d.openedAt ?? today());
  }, [existingQ.data]);

  // default status to first config status on create
  useEffect(() => {
    if (mode === "create" && !statusId && configQ.data?.statuses.length) {
      setStatusId(configQ.data.statuses[0].id);
    }
  }, [mode, statusId, configQ.data]);

  const lookupMut = useMutation({
    mutationFn: (term: string) => {
      const t = term.trim();
      const isSo = /^s[o0]?-?\d+$/i.test(t) || /^\d{3,}$/.test(t);
      const qp = isSo ? `so=${encodeURIComponent(t)}` : `ref=${encodeURIComponent(t)}`;
      return apiFetch(`/api/ops/service-cases/lookup?${qp}`) as Promise<CaseLookupResponse>;
    },
    onSuccess: (res) => {
      if (res.order) {
        setOrderId(res.order.id);
        setMatchedSo(res.order.so);
        setCustomerName(res.order.customerName || "");
        setCustomerPhone(res.order.customerPhone ?? "");
        setCustomerAddress(res.order.customerAddress ?? "");
        if (res.order.refNos.length && !refNo) setRefNo(res.order.refNos[0]);
        setLookupMsg(`✓ Matched ${res.order.so} — customer auto-filled.`);
      } else if (res.matches > 1) {
        setLookupMsg(`⚠ ${res.matches} orders matched — ambiguous. Fill customer manually.`);
      } else {
        setLookupMsg("⚠ No order matched. Fill customer manually.");
      }
    },
    onError: () => setLookupMsg("⚠ Lookup failed. Fill customer manually."),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        orderId:         orderId ?? undefined,
        refNo:           refNo.trim() || undefined,
        customerName:    customerName.trim(),
        customerPhone:   customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        caseTypeId:      caseTypeId || null,
        statusId:        statusId || null,
        whatHappened:    whatHappened.trim() || undefined,
        carresAction:    carresAction.trim() || undefined,
        whatAffected:    whatAffected.trim() || undefined,
        incurredCharges: incurredCharges.trim() || undefined,
        openedAt,
      };
      return mode === "create"
        ? apiFetch("/api/ops/service-cases", { method: "POST", body: JSON.stringify(body) })
        : apiFetch(`/api/ops/service-cases/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "service-cases"] });
      onSaved();
    },
  });

  const canSave = customerName.trim().length > 0 && !saveMut.isPending;

  /**
   * S3 — may this case be closed? The same shared answer the server's gate
   * gives, so the greyed-out option and the refusal cannot disagree. A case
   * that is ALREADY closed keeps its closing statuses selectable: the rule is
   * about entering the state, not about staying in it.
   */
  const canClose =
    (existingQ.data?.statusIsClosed ?? false) ||
    caseMayClose(
      caseFollowUpPlan({
        customerWants: existingQ.data?.customerWants ?? [],
        customerName:  existingQ.data?.customerName,
        supplierName:  existingQ.data?.supplierName ?? null,
      }),
      existingQ.data?.progress ?? [],
    );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-200 px-6 py-4">
          <h2 className="text-strong text-base-900">
            {mode === "create" ? "New Case" : "Edit Case"}
          </h2>
          <button type="button" onClick={onClose} className="text-base-400 hover:text-base-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Lookup */}
          {mode === "create" && (
            <div className="rounded border border-base-200 bg-base-50 p-3">
              <label className="text-meta text-base-500 uppercase tracking-wider">
                Look up by Ref No or Order ID
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={lookupTerm}
                  onChange={(e) => setLookupTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") lookupMut.mutate(lookupTerm); }}
                  placeholder="CR0418  or  SO-1147"
                  className="flex-1 rounded border border-base-300 px-2.5 py-1.5 text-body"
                />
                <button
                  type="button"
                  onClick={() => lookupMut.mutate(lookupTerm)}
                  disabled={!lookupTerm.trim() || lookupMut.isPending}
                  className="btn-primary flex items-center gap-1 text-body py-1.5 disabled:opacity-40"
                >
                  <Search size={14} /> Find
                </button>
              </div>
              {lookupMsg && <p className="mt-1.5 text-meta text-base-600">{lookupMsg}</p>}
            </div>
          )}

          {/* Order / Ref binding */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Ref No${mode === "create" ? " (alias)" : ""}`}>
              <input value={refNo} onChange={(e) => setRefNo(e.target.value)}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body font-mono" />
            </Field>
            <Field label="Linked Order">
              <div className="px-2.5 py-1.5 text-body text-base-600">
                {/* J2 — the case→order link. This field used to render the bare
                    word "linked" whenever the case was opened for editing:
                    `matchedSo` is only ever set by the create-mode lookup, so an
                    existing case could name its order only in the session that
                    created it. It is a real link now, in both modes. */}
                {matchedSo ? (
                  <CaseOrderLink orderId={orderId} so={soFromMatch(matchedSo)} />
                ) : (
                  <CaseOrderLink orderId={orderId} so={existingQ.data?.so} />
                )}
              </div>
            </Field>
          </div>

          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer Name *">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
            <Field label="Phone">
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
          </div>
          <Field label="Address">
            <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
              className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
          </Field>

          {/* Classification */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Case Type">
              <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)}
                className="w-full rounded border border-base-300 px-2 py-1.5 text-body bg-white">
                <option value="">— select —</option>
                {configQ.data?.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              {/* S3 — a closing status is not offered while the chain is still
                  open. The server refuses it either way (`case_steps_open`);
                  this is the courtesy that stops a new hire meeting a refusal
                  they could have seen coming. Already-closed cases keep every
                  option: the gate is the transition, not a lock on the row. */}
              <select value={statusId} onChange={(e) => setStatusId(e.target.value)}
                className="w-full rounded border border-base-300 px-2 py-1.5 text-body bg-white">
                <option value="">— select —</option>
                {configQ.data?.statuses.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.isClosed && !canClose}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Opened">
              <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)}
                className="w-full rounded border border-base-300 px-2 py-1.5 text-body" />
            </Field>
          </div>

          {/* S1 — the guided intake's answers, read-only.
              They are shown, not edited: the five questions are asked once, at
              intake, and re-answering them later would silently change the
              urgency the case has been worked at. (Editing an answer is S3+
              territory, where the follow-up tasks exist to be re-driven.)
              Absent on every case filed before the wizard — the block simply
              does not render. */}
          {existingQ.data?.issueType && (
            <div className="rounded border border-base-200 bg-base-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-meta uppercase tracking-wider text-base-500">Reported issue</p>
                {existingQ.data.priority && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`pill ${existingQ.data.priority === "high" ? "pill-overdue" : "pill-neutral"}`}>
                      {existingQ.data.priority === "high"
                        ? "Urgent"
                        : existingQ.data.priority === "normal"
                          ? "Normal"
                          : "Low"}
                    </span>
                    {caseNeedsManager(existingQ.data.priority) && (
                      <span className="text-meta text-base-600">tell manager</span>
                    )}
                  </span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-body">
                <IntakeRow label="Found by" value={reporterLabel(existingQ.data.reportedBy)} />
                <IntakeRow
                  label="Product"
                  value={[
                    existingQ.data.productCategory
                      ? caseProductCategoryLabel(existingQ.data.productCategory)
                      : null,
                    existingQ.data.productSku,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <IntakeRow label="What is wrong" value={caseIssueLabel(existingQ.data.issueType)} />
                <IntakeRow label="Still usable" value={caseUsableLabel(existingQ.data.usable)} />
                <IntakeRow
                  label="Customer wants"
                  value={(existingQ.data.customerWants ?? []).map(caseWantLabel).join(", ")}
                />
              </dl>
            </div>
          )}

          {/* S4 — the deadline: 14 working days from the day it was reported,
              derived from the same clock the list column reads. It sits ABOVE
              the chain on purpose: it is the one thing on this screen with a
              date the customer is waiting on. Edit mode only — a case that
              does not exist yet has not been reported. */}
          {mode === "edit" && id && existingQ.data && (
            <CaseDeadline
              caseId={id}
              openedAt={existingQ.data.openedAt ?? null}
              closed={existingQ.data.statusIsClosed}
              customerName={existingQ.data.customerName}
              events={existingQ.data.slaEvents ?? []}
            />
          )}

          {/* S3 — the follow-up chain. Derived from what the customer asked
              for, so it needs no state of its own and cannot drift from the
              case; only the OUTCOMES are stored. Edit mode only — a case that
              does not exist yet has nothing to follow up. */}
          {mode === "edit" && id && existingQ.data && (
            <CaseFollowUps
              caseId={id}
              answers={{
                customerWants: existingQ.data.customerWants ?? [],
                customerName:  existingQ.data.customerName,
                supplierName:  existingQ.data.supplierName ?? null,
              }}
              progress={existingQ.data.progress ?? []}
            />
          )}

          {/* S2 — the evidence the case was filed with, each file naming who
              uploaded it and when. Edit mode only: on create the wizard owns
              the checklist, and this modal no longer creates cases anyway. */}
          {mode === "edit" && id && (
            <CaseEvidenceGallery
              caseId={id}
              issueType={existingQ.data?.issueType ?? null}
              reportedBy={existingQ.data?.reportedBy ?? null}
            />
          )}

          {/* Medical record */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="What happened">
              <textarea value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} rows={3}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
            <Field label="Carres action">
              <textarea value={carresAction} onChange={(e) => setCarresAction(e.target.value)} rows={3}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
            <Field label="What was affected">
              <textarea value={whatAffected} onChange={(e) => setWhatAffected(e.target.value)} rows={2}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
            <Field label="Incurred charges">
              <textarea value={incurredCharges} onChange={(e) => setIncurredCharges(e.target.value)} rows={2}
                className="w-full rounded border border-base-300 px-2.5 py-1.5 text-body" />
            </Field>
          </div>

          {saveMut.isError && (
            <p className="text-meta text-error-700 break-words">
              Save failed: {(saveMut.error as Error)?.message ?? "unknown error"}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-base-200 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-secondary text-body py-1.5">
            Cancel
          </button>
          <button type="button" onClick={() => saveMut.mutate()} disabled={!canSave}
            className="btn-hero text-body py-1.5 disabled:opacity-40">
            {saveMut.isPending ? "Saving…" : mode === "create" ? "Create Case" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-meta text-base-500 uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function IntakeRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-meta w-24 shrink-0 pt-0.5 text-base-500">{label}</dt>
      <dd className="text-body text-base-800">{value || "—"}</dd>
    </div>
  );
}

function reporterLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return CASE_REPORTERS.find((r) => r.key === key)?.label ?? key;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The create-mode lookup hands back the SO as a string ("SO-1147"); the link
 *  wants the number. Anything unparseable falls back to no number, which still
 *  renders a working link (the deep link travels by order id). */
function soFromMatch(matched: string): number | undefined {
  const n = parseInt(matched.replace(/^S[O0]-?/i, ""), 10);
  return Number.isNaN(n) ? undefined : n;
}
