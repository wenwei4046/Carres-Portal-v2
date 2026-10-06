import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { appTodayIso } from "@/lib/fmt-date";
import {
  CASE_REPORTERS,
  caseFollowUpPlan,
  caseIssueLabel,
  caseMayClose,
  caseNeedsManager,
  caseOpenSteps,
  caseCloseBlockerMessage,
  caseProductCategoryLabel,
  caseUsableLabel,
  caseWantLabel,
  type CaseLookupResponse,
  type ServiceCase,
  type ServiceCaseConfig,
} from "@carres/shared";
import { Search } from "lucide-react";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";
import Modal from "@/components/kit/Modal";
import StatusPill from "@/components/kit/StatusPill";
import CaseOrderLink from "./CaseOrderLink";
import CaseEvidenceGallery from "./CaseEvidenceGallery";
import CaseFollowUps from "./CaseFollowUps";
import CaseDeadline from "./CaseDeadline";

/**
 * The Service Case record — opened beside the register in the shared kit
 * `Drawer` (template adoption 2026-10-06): the Drawer owns the backdrop, the
 * focus trap, Escape and the return of focus to the row that opened it; this
 * file owns the record's content.
 *
 * Status is never chosen (owner ruling 2026-10-06). The record prints the one
 * status FACT (`In progress` · `Closed`) and offers `Close case`, which is
 * available only once every step of the chain has a date on it — the same
 * shared answer the server's gate gives, so the button and the refusal cannot
 * disagree. Create mode survives for the legacy prose path and is hosted in
 * the kit `Modal`; the guided wizard is the register's `New Case` door.
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
  const [whatHappened, setWhatHappened]       = useState("");
  const [carresAction, setCarresAction]       = useState("");
  const [whatAffected, setWhatAffected]       = useState("");
  const [incurredCharges, setIncurredCharges] = useState("");
  const [openedAt, setOpenedAt] = useState(appTodayIso());

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
    setWhatHappened(d.whatHappened ?? "");
    setCarresAction(d.carresAction ?? "");
    setWhatAffected(d.whatAffected ?? "");
    setIncurredCharges(d.incurredCharges ?? "");
    setOpenedAt(d.openedAt ?? appTodayIso());
  }, [existingQ.data]);

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
        setLookupMsg(`Matched ${res.order.so}. Customer filled in.`);
      } else if (res.matches > 1) {
        setLookupMsg(`${res.matches} sales orders matched. Type the SO number instead.`);
      } else {
        setLookupMsg("No sales order found with that number. Fill the customer in.");
      }
    },
    onError: () => setLookupMsg("Could not search right now. Try again, or fill the customer in."),
  });

  /** The first status on create: the open one the config lists first. Edit never sends a status. */
  const openStatusId = configQ.data?.statuses.find((s) => !s.isClosed)?.id ?? configQ.data?.statuses[0]?.id ?? null;
  const closedStatusId = configQ.data?.statuses.find((s) => s.isClosed)?.id ?? null;

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        orderId:         orderId ?? undefined,
        refNo:           refNo.trim() || undefined,
        customerName:    customerName.trim(),
        customerPhone:   customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        caseTypeId:      caseTypeId || null,
        ...(mode === "create" ? { statusId: openStatusId } : {}),
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

  /** `Close case` — the one status transition, through the gated PATCH. */
  const closeMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/ops/service-cases/${id}`, { method: "PATCH", body: JSON.stringify({ statusId: closedStatusId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "service-cases"] });
      onSaved();
    },
  });

  const canSave = customerName.trim().length > 0 && !saveMut.isPending;

  const plan = caseFollowUpPlan({
    customerWants: existingQ.data?.customerWants ?? [],
    customerName:  existingQ.data?.customerName,
    supplierName:  existingQ.data?.supplierName ?? null,
  });
  const progress = existingQ.data?.progress ?? [];
  const isClosed = existingQ.data?.statusIsClosed ?? false;
  const canClose = !isClosed && caseMayClose(plan, progress) && !!closedStatusId && !closeMut.isPending;
  const openSteps = caseOpenSteps(plan, progress);

  const body = (
    <div className="space-y-5">
      {mode === "edit" && id && (
        <div className="flex flex-wrap gap-4 text-body">
          <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=arrival-source&kind=customer-return&case=${id}`}>Plan Customer Return</Link>
          <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=arrival-source&kind=failed-delivery-return&case=${id}`}>Plan Failed Delivery return</Link>
          <Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=arrival-source&kind=repair-return&case=${id}`}>Plan Repair</Link>
        </div>
      )}
      {/* Lookup */}
      {mode === "create" && (
        <div className="rounded border border-base-200 bg-base-50 p-3">
          <label htmlFor="sc-modal-lookup" className="text-meta text-base-500 uppercase tracking-wider">
            Sales order number or Ref No
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="sc-modal-lookup"
              value={lookupTerm}
              onChange={(e) => setLookupTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") lookupMut.mutate(lookupTerm); }}
              placeholder="SO-1147  or  CR0418"
              className="flex-1 rounded border border-base-300 px-2.5 py-1.5 text-body"
            />
            <Button variant="neutral" onClick={() => lookupMut.mutate(lookupTerm)} disabled={!lookupTerm.trim() || lookupMut.isPending}>
              <Search size={14} /> Find
            </Button>
          </div>
          {lookupMsg && <p className="mt-1.5 text-meta text-base-600">{lookupMsg}</p>}
        </div>
      )}

      {/* Status fact + the one transition (owner ruling 2026-10-06) */}
      {mode === "edit" && existingQ.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-base-200 bg-base-50 p-3" data-testid="case-status-block">
          <div className="flex items-center gap-2">
            <span className="text-meta uppercase tracking-wider text-base-500">Status</span>
            <StatusPill tone={isClosed ? "success" : "info"}>{isClosed ? "Closed" : "In progress"}</StatusPill>
          </div>
          {!isClosed && (
            <div className="flex flex-col items-end gap-1">
              <Button variant="neutral" onClick={() => closeMut.mutate()} disabled={!canClose} loading={closeMut.isPending} data-testid="case-close">
                Close case
              </Button>
              {openSteps.length > 0 && (
                <span className="text-meta text-base-600">Close case: {caseCloseBlockerMessage(openSteps)}</span>
              )}
              {closeMut.isError && (
                <span className="text-meta text-error-700">Could not close: {(closeMut.error as Error)?.message ?? "unknown error"}</span>
              )}
            </div>
          )}
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Case Type">
          <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)}
            className="w-full rounded border border-base-300 px-2 py-1.5 text-body bg-white">
            <option value="">Case Type</option>
            {configQ.data?.types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Opened">
          <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)}
            className="w-full rounded border border-base-300 px-2 py-1.5 text-body" />
        </Field>
      </div>

      {/* S1 — the guided intake's answers, read-only. */}
      {existingQ.data?.issueType && (
        <div className="rounded border border-base-200 bg-base-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-meta uppercase tracking-wider text-base-500">Reported issue</p>
            {existingQ.data.priority && (
              <span className="inline-flex items-center gap-1.5">
                <StatusPill tone={existingQ.data.priority === "high" ? "danger" : "neutral"}>
                  {existingQ.data.priority === "high" ? "Urgent" : existingQ.data.priority === "normal" ? "Normal" : "Low"}
                </StatusPill>
                {caseNeedsManager(existingQ.data.priority) && (
                  <span className="text-meta text-base-600">Tell the manager about this one.</span>
                )}
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-body">
            <IntakeRow label="Found by" value={reporterLabel(existingQ.data.reportedBy)} />
            <IntakeRow
              label="Product"
              value={[
                existingQ.data.productCategory ? caseProductCategoryLabel(existingQ.data.productCategory) : null,
                existingQ.data.productSku,
              ].filter(Boolean).join(" · ")}
            />
            <IntakeRow label="What is wrong" value={caseIssueLabel(existingQ.data.issueType)} />
            <IntakeRow label="Still usable" value={caseUsableLabel(existingQ.data.usable)} />
            <IntakeRow label="Customer wants" value={(existingQ.data.customerWants ?? []).map(caseWantLabel).join(", ")} />
          </dl>
        </div>
      )}

      {mode === "edit" && id && existingQ.data && (
        <CaseDeadline
          caseId={id}
          openedAt={existingQ.data.openedAt ?? null}
          closed={existingQ.data.statusIsClosed}
          customerName={existingQ.data.customerName}
          events={existingQ.data.slaEvents ?? []}
        />
      )}

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
          Could not save: {(saveMut.error as Error)?.message ?? "unknown error"}
        </p>
      )}
    </div>
  );

  const footer = (
    <>
      <Button variant="neutral" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={() => saveMut.mutate()} disabled={!canSave} loading={saveMut.isPending} data-testid="case-save">
        {mode === "create" ? "Create Case" : "Save changes"}
      </Button>
    </>
  );

  const onOpenChange = (open: boolean) => { if (!open) onClose(); };

  if (mode === "create") {
    return (
      <Modal open onOpenChange={onOpenChange} title="New Case" width="wide" footer={footer}>
        {body}
      </Modal>
    );
  }

  const title = existingQ.data ? existingQ.data.caseNo : "Service Case";
  const description = existingQ.data?.customerName || undefined;
  return (
    <Drawer open onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
      {existingQ.isError ? (
        <p role="alert" className="text-body text-error-700">
          Service Case could not be loaded. <button type="button" className="underline" onClick={() => void existingQ.refetch()}>Try again</button>
        </p>
      ) : body}
    </Drawer>
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
      <dd className="text-body text-base-800">{value || ""}</dd>
    </div>
  );
}

function reporterLabel(key: string | null | undefined): string {
  if (!key) return "";
  return CASE_REPORTERS.find((r) => r.key === key)?.label ?? key;
}

/** The create-mode lookup hands back the SO as a string ("SO-1147"); the link
 *  wants the number. Anything unparseable falls back to no number, which still
 *  renders a working link (the deep link travels by order id). */
function soFromMatch(matched: string): number | undefined {
  const n = parseInt(matched.replace(/^S[O0]-?/i, ""), 10);
  return Number.isNaN(n) ? undefined : n;
}
