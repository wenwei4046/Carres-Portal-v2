import { useState } from "react";
import { storageChargeOf } from "@carres/shared/payment-storage";
import { DELIVERY_REASONS } from "@carres/shared/delivery-reasons";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ATTACHMENTS_BUCKET } from "@/lib/storage";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { toast } from "sonner";

/**
 * The Storage section of the Invoice object (payment/MASTER.md §6 · §7 ·
 * 0436). Facts first, doors second:
 *
 *   · A case says its witnessed start, which storage day today is, the free
 *     end (approved extension named), and the §7 charge so far through the
 *     ONE shared arithmetic — honestly marked as not yet invoiced.
 *   · `Record storage start` exists for the posting door's staff when a
 *     group has no case: both witnessed facts, the note, optional evidence.
 *     The SQL door derives the start and snapshots the rule.
 *   · `Request more free days` carries the §7 decision to the door — the
 *     WRITTEN request evidence is uploaded first, because no written
 *     request means no approval.
 */

export interface StorageCaseRow {
  id: string;
  order_id: string;
  product_group: "mattress_bedframe" | "sofa";
  readiness_witnessed_on: string;
  customer_delay_witnessed_on: string;
  delay_witness_note: string;
  storage_start: string;
  rule_free_days: number;
  rule_charge_amount: number;
  rule_cycle_days: number;
  rule_extra_free_allowed: boolean;
  approved_free_until: string | null;
  approval_reason: string | null;
  /** 0438 — how many commenced §7 periods are already on paper. */
  billed_through_period?: number;
  status: "open" | "closed";
}

const GROUP_WORD: Record<StorageCaseRow["product_group"], string> = {
  mattress_bedframe: "Mattress / Bedframe",
  sofa: "Sofa",
};

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default function InvoiceStorage({ orderId, canAct, correctionInFlight = false }: {
  orderId: string;
  /** The posting door's staff (operation / principal) may open the doors. */
  canAct: boolean;
  /** A voided storage paper's replacement DRAFT exists (§2: it asks nothing
   *  until issued — the section says so instead of inventing a debt). */
  correctionInFlight?: boolean;
}) {
  const qc = useQueryClient();
  const casesQ = useQuery<{ cases: StorageCaseRow[]; unreconciledLegacy?: number }>({
    queryKey: ["finance", "storage-cases", orderId],
    queryFn: () => apiFetch(`/api/finance/payment-storage?orderId=${orderId}`),
  });
  const cases = casesQ.data?.cases ?? [];
  const [starting, setStarting] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);
  // §6 — the customer's written request to delay. It is the DEFAULT storage
  // evidence, and the fact a free-storage decision rests on.
  const [requesting, setRequesting] = useState(false);
  const requestsQ = useQuery<{ requests: LaterDateRequest[] }>({
    queryKey: ["finance", "later-delivery-requests", orderId],
    queryFn: () => apiFetch(`/api/finance/payment-storage/later-delivery-requests?orderId=${orderId}`),
  });
  const requests = requestsQ.data?.requests ?? [];

  return <SectionCard><div className="p-4" data-testid="invoice-storage">
    <h2 className="text-strong mb-2">Storage</h2>
    {casesQ.isError ? <p className="text-body" role="alert">Storage could not be loaded. Try again.</p>
      : <div className="space-y-3 text-body">
        {cases.map((c) => <CaseCard key={c.id} storageCase={c} canAct={canAct}
          extending={extending === c.id}
          onExtend={() => setExtending(c.id)}
          onDone={() => { setExtending(null);
            void qc.invalidateQueries({ queryKey: ["finance", "storage-cases", orderId] }); }} />)}
        {(casesQ.data?.unreconciledLegacy ?? 0) > 0 &&
          <p className="text-label font-normal text-base-500"
            data-testid="storage-unreconciled-legacy">
            This order also carries {rm(casesQ.data!.unreconciledLegacy!)} of storage fee from
            the old records, which no Storage Invoice covers. Collect it, or set the storage
            fee to 0 in the order, so the two do not disagree.</p>}
        {correctionInFlight && <p className="text-label font-normal text-base-500"
          data-testid="storage-correction-note">
          A Storage Invoice correction is in progress — the replacement is a draft and asks
          for nothing until it is issued. Issue it so the money is asked again.</p>}
        {cases.length === 0 && !casesQ.isLoading &&
          <p className="text-label font-normal text-base-400">
            No storage case. Storage begins only when the goods are ready AND the customer
            delays the delivery.</p>}
        {requests.length > 0 && <div data-testid="later-delivery-requests">
          <p className="font-semibold">What the customer asked for</p>
          {requests.map((r) => <p key={r.id} className="text-label font-normal">
            {fmtDate(r.requested_date)} · {REASON_WORD[r.reason_key] ?? r.reason_key}
            {r.reason_detail ? ` — ${r.reason_detail}` : ""}
            {r.free_storage_requested ? " · asked for free storage" : ""}
            {" · storage terms acknowledged"}
          </p>)}
        </div>}

        {canAct && !starting && !requesting &&
          <button className="btn-secondary"
            onClick={() => setRequesting(true)}>Record the customer's later date</button>}
        {canAct && requesting &&
          <LaterDateForm orderId={orderId} onDone={() => { setRequesting(false);
            void qc.invalidateQueries({ queryKey: ["finance", "later-delivery-requests", orderId] }); }}
            onBack={() => setRequesting(false)} />}
        {canAct && !starting && !requesting &&
          <button className="btn-secondary" onClick={() => setStarting(true)}>Record storage start</button>}
        {canAct && starting &&
          <StartForm orderId={orderId} onDone={() => { setStarting(false);
            void qc.invalidateQueries({ queryKey: ["finance", "storage-cases", orderId] }); }}
            onBack={() => setStarting(false)} />}
      </div>}
  </div></SectionCard>;
}

function CaseCard({ storageCase: c, canAct, extending, onExtend, onDone }: {
  storageCase: StorageCaseRow; canAct: boolean; extending: boolean;
  onExtend: () => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const charge = storageChargeOf({
    storageStart: c.storage_start,
    ruleFreeDays: c.rule_free_days,
    ruleChargeAmount: Number(c.rule_charge_amount),
    ruleCycleDays: c.rule_cycle_days,
    approvedFreeUntil: c.approved_free_until,
  }, todayIso());
  const billed = c.billed_through_period ?? 0;
  const unbilled = Math.max(0, charge.commencedPeriods - billed);
  // 0438 — the charge door: commenced unbilled periods become the paper.
  const mint = useMutation({
    mutationFn: () => apiFetch("/api/finance/payment-storage/charge", {
      method: "POST", body: JSON.stringify({ caseId: c.id }),
    }),
    onSuccess: () => {
      toast.success("Storage Invoice created");
      void qc.invalidateQueries({ queryKey: ["finance", "storage-cases", c.order_id] });
      void qc.invalidateQueries({ queryKey: ["finance", "invoice-register"], exact: false });
      onDone();
    },
    onError: (e: Error) => toast.error(`The Storage Invoice was not created — ${e.message}`),
  });
  return <div className="rounded-card border border-base-200 p-3" data-testid={`storage-case-${c.product_group}`}>
    <p className="font-semibold">{GROUP_WORD[c.product_group]}{c.status === "closed" ? " · Closed" : ""}</p>
    <p>Storage started {fmtDate(c.storage_start)} · today is day {charge.dayOfStorage}</p>
    <p>Free until {fmtDate(charge.freeUntilIso)}
      {c.approved_free_until && c.approved_free_until >= charge.freeUntilIso
        ? ` · approved${c.approval_reason ? ` — ${c.approval_reason}` : ""}` : ""}</p>
    <p>{charge.commencedPeriods === 0
      ? "No storage charge yet."
      : billed >= charge.commencedPeriods
        ? `${charge.commencedPeriods} charge period${charge.commencedPeriods === 1 ? "" : "s"} started · ${rm(charge.amountOwed)} — all on a Storage Invoice.`
        : `${charge.commencedPeriods} charge period${charge.commencedPeriods === 1 ? "" : "s"} started · ${rm(charge.amountOwed)} — ${unbilled} not on a Storage Invoice yet.`}</p>
    <div className="flex flex-wrap gap-2 mt-2">
      {canAct && c.status === "open" && unbilled > 0 &&
        <button className="btn-secondary" disabled={mint.isPending}
          onClick={() => mint.mutate()}>Create Storage Invoice</button>}
      {canAct && c.status === "open" && c.rule_extra_free_allowed && !extending &&
        <button className="btn-secondary" onClick={onExtend}>Request more free days</button>}
      {canAct && c.status === "open" &&
        <EndStorage caseId={c.id} onDone={onDone} />}
    </div>
    {extending && <ExtraFreeForm caseId={c.id} onDone={onDone} onBack={onDone} />}
  </div>;
}

/** 0439 — the closing door: storage ended (the goods went out, or the case
 *  is otherwise finished). The reason is said; a closed case refuses the
 *  charge and extra-free doors and never reopens. */
function EndStorage({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const close = useMutation({
    mutationFn: () => apiFetch("/api/finance/payment-storage/close", {
      method: "POST", body: JSON.stringify({ caseId, reason: reason.trim() }),
    }),
    onSuccess: () => { toast.success("Storage ended"); onDone(); },
    onError: (e: Error) => toast.error(`Storage was not ended — ${e.message}`),
  });
  if (!asking) return <button className="btn-secondary" onClick={() => setAsking(true)}>End storage</button>;
  return <span className="flex items-center gap-2" data-testid="storage-end-form">
    <input value={reason} onChange={(e) => setReason(e.target.value)}
      aria-label="Why the storage ended" placeholder="Goods delivered"
      className="rounded-md border border-base-200 px-2 py-1.5 text-body" />
    <button className="btn-primary" disabled={!reason.trim() || close.isPending}
      onClick={() => close.mutate()}>End storage</button>
    <button className="btn-secondary" onClick={() => setAsking(false)}>Back</button>
  </span>;
}

function StartForm({ orderId, onDone, onBack }: {
  orderId: string; onDone: () => void; onBack: () => void;
}) {
  const [group, setGroup] = useState<StorageCaseRow["product_group"]>("mattress_bedframe");
  const [readiness, setReadiness] = useState("");
  const [delay, setDelay] = useState("");
  const [note, setNote] = useState("");
  const start = useMutation({
    mutationFn: () => apiFetch("/api/finance/payment-storage/start", {
      method: "POST",
      body: JSON.stringify({
        orderId, productGroup: group,
        readinessOn: readiness, customerDelayOn: delay, witnessNote: note.trim(),
      }),
    }),
    onSuccess: () => { toast.success("Storage started"); onDone(); },
    onError: (e: Error) => toast.error(`Storage was not started — ${e.message}`),
  });
  return <div className="rounded-card border border-base-200 p-3 space-y-2" data-testid="storage-start-form">
    <label className="block"><span className="text-label">Goods</span>
      <select value={group} onChange={(e) => setGroup(e.target.value as StorageCaseRow["product_group"])}
        aria-label="Goods" className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body">
        <option value="mattress_bedframe">Mattress / Bedframe</option>
        <option value="sofa">Sofa</option>
      </select></label>
    <label className="block"><span className="text-label">Goods were ready on</span>
      <input type="date" value={readiness} onChange={(e) => setReadiness(e.target.value)}
        aria-label="Goods were ready on"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="block"><span className="text-label">Customer delayed on</span>
      <input type="date" value={delay} onChange={(e) => setDelay(e.target.value)}
        aria-label="Customer delayed on"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="block"><span className="text-label">What happened</span>
      <input value={note} onChange={(e) => setNote(e.target.value)}
        aria-label="What happened" placeholder="Customer asked to hold the delivery"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <p className="text-label font-normal">
      Storage starts on the LATER of the two dates. The system works it out.</p>
    <div className="flex gap-2">
      <button className="btn-primary" disabled={!readiness || !delay || !note.trim() || start.isPending}
        onClick={() => start.mutate()}>Record storage start</button>
      <button className="btn-secondary" onClick={onBack}>Back</button>
    </div>
  </div>;
}

function ExtraFreeForm({ caseId, onDone, onBack }: {
  caseId: string; onDone: () => void; onBack: () => void;
}) {
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const approve = useMutation({
    mutationFn: (evidenceUrl: string) => apiFetch("/api/finance/payment-storage/extra-free", {
      method: "POST",
      body: JSON.stringify({ caseId, freeUntil: until, reason: reason.trim(), evidenceUrl }),
    }),
    onSuccess: () => { toast.success("Free storage approved"); onDone(); },
    onError: (e: Error) => toast.error(`Free storage was not approved — ${e.message}`),
  });
  async function submit() {
    if (!file || saving || approve.isPending) return;
    setSaving(true);
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
    const path = `storage-cases/${caseId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    setSaving(false);
    if (error) { toast.error(`The written request upload failed — ${error.message}`); return; }
    approve.mutate(`${ATTACHMENTS_BUCKET}/${path}`);
  }
  return <div className="mt-2 rounded-card border border-base-200 p-3 space-y-2" data-testid="storage-extra-free-form">
    <label className="block"><span className="text-label">Free until</span>
      <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
        aria-label="Free until"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="block"><span className="text-label">Reason</span>
      <input value={reason} onChange={(e) => setReason(e.target.value)}
        aria-label="Reason" className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="block"><span className="text-label">Customer's written request</span>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label="Customer's written request" className="mt-0.5 block w-full text-meta" />
      <span className="text-label font-normal">
        {file ? file.name : "No written request means no free storage. A phone call is not enough."}</span></label>
    <div className="flex gap-2">
      <button className="btn-primary" disabled={!until || !reason.trim() || !file || saving || approve.isPending}
        onClick={() => void submit()}>Approve free storage</button>
      <button className="btn-secondary" onClick={onBack}>Back</button>
    </div>
  </div>;
}

export interface LaterDateRequest {
  id: string;
  order_id: string;
  requested_date: string;
  reason_key: string;
  reason_detail: string | null;
  terms_acknowledged: boolean;
  free_storage_requested: boolean;
  evidence_url: string;
  recorded_at: string;
}

/** §6 charges storage for CUSTOMER delay only, so only customer-side reasons
 *  belong on this form. The words come from the one governed Delivery Reason
 *  Library — a second list here would be a second responsibility rule. */
const CUSTOMER_REASONS = DELIVERY_REASONS.filter((r) => r.responsibility === "customer");
const REASON_WORD: Record<string, string> =
  Object.fromEntries(DELIVERY_REASONS.map((r) => [r.key, r.label]));

/**
 * `Request a later delivery date` — the §6 submission, recorded by Operation
 * from what the customer actually sent.
 *
 * ⛔ IT DOES NOT MOVE THE DELIVERY DATE. §6: "Original delivery date remains
 * until written confirmation", and the date belongs to Orders/Delivery. This
 * records what the customer ASKED for, with the evidence that makes it a
 * written request — and the page says so, so nobody expects the calendar to
 * change underneath them.
 */
function LaterDateForm({ orderId, onDone, onBack }: {
  orderId: string; onDone: () => void; onBack: () => void;
}) {
  const [date, setDate] = useState("");
  const [reasonKey, setReasonKey] = useState(CUSTOMER_REASONS[0].key as string);
  const [detail, setDetail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [freeRequested, setFreeRequested] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const record = useMutation({
    mutationFn: (evidenceUrl: string) => apiFetch("/api/finance/payment-storage/later-delivery-request", {
      method: "POST",
      body: JSON.stringify({
        orderId, requestedDate: date, reasonKey,
        reasonDetail: detail.trim() || null,
        termsAcknowledged: acknowledged, freeStorageRequested: freeRequested, evidenceUrl,
      }),
    }),
    onSuccess: () => { toast.success("The customer's request is recorded"); onDone(); },
    onError: (e: Error) => toast.error(`The request was not recorded — ${e.message}`),
  });
  async function submit() {
    if (!file || saving || record.isPending) return;
    setSaving(true);
    const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
    const path = `orders/${orderId}/later-date/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    setSaving(false);
    if (error) { toast.error(`The upload failed — ${error.message}`); return; }
    record.mutate(`${ATTACHMENTS_BUCKET}/${path}`);
  }
  return <div className="mt-2 rounded-card border border-base-200 p-3 space-y-2"
    data-testid="storage-later-date-form">
    <p className="font-semibold">This records what the customer asked for. It does not change the delivery date.</p>
    <label className="block"><span className="text-label">The date the customer asked for</span>
      <input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)}
        aria-label="The date the customer asked for"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="block"><span className="text-label">Reason</span>
      <select value={reasonKey} onChange={(e) => setReasonKey(e.target.value)}
        aria-label="Reason"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body">
        {CUSTOMER_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select></label>
    <label className="block"><span className="text-label">Anything to add (optional)</span>
      <input value={detail} onChange={(e) => setDetail(e.target.value)}
        aria-label="Anything to add"
        className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" /></label>
    <label className="flex items-start gap-2 text-label font-normal">
      <input type="checkbox" checked={acknowledged}
        onChange={(e) => setAcknowledged(e.target.checked)}
        aria-label="The customer acknowledged the storage terms" />
      <span>The customer acknowledged the storage terms.</span></label>
    <label className="flex items-start gap-2 text-label font-normal">
      <input type="checkbox" checked={freeRequested}
        onChange={(e) => setFreeRequested(e.target.checked)}
        aria-label="The customer asked for free storage" />
      <span>The customer asked for free storage.</span></label>
    <label className="block"><span className="text-label">What the customer sent</span>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label="What the customer sent" className="mt-0.5 block w-full text-meta" />
      <span className="text-label font-normal">
        {file ? file.name : "A telephone call cannot change the date or obtain free storage."}</span></label>
    <div className="flex gap-2">
      <button className="btn-primary"
        disabled={!date || !acknowledged || !file || saving || record.isPending}
        onClick={() => void submit()}>Record the request</button>
      <button className="btn-secondary" onClick={onBack}>Back</button>
    </div>
  </div>;
}

