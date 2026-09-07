import { useState } from "react";
import { storageChargeOf } from "@carres/shared/payment-storage";
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
  status: "open" | "closed";
}

const GROUP_WORD: Record<StorageCaseRow["product_group"], string> = {
  mattress_bedframe: "Mattress / Bedframe",
  sofa: "Sofa",
};

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default function InvoiceStorage({ orderId, canAct }: {
  orderId: string;
  /** The posting door's staff (operation / principal) may open the doors. */
  canAct: boolean;
}) {
  const qc = useQueryClient();
  const casesQ = useQuery<{ cases: StorageCaseRow[] }>({
    queryKey: ["finance", "storage-cases", orderId],
    queryFn: () => apiFetch(`/api/finance/payment-storage?orderId=${orderId}`),
  });
  const cases = casesQ.data?.cases ?? [];
  const [starting, setStarting] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);

  return <SectionCard><div className="p-4" data-testid="invoice-storage">
    <h2 className="text-strong mb-2">Storage</h2>
    {casesQ.isError ? <p className="text-body" role="alert">Storage could not be loaded. Try again.</p>
      : <div className="space-y-3 text-body">
        {cases.map((c) => <CaseCard key={c.id} storageCase={c} canAct={canAct}
          extending={extending === c.id}
          onExtend={() => setExtending(c.id)}
          onDone={() => { setExtending(null);
            void qc.invalidateQueries({ queryKey: ["finance", "storage-cases", orderId] }); }} />)}
        {cases.length === 0 && !casesQ.isLoading &&
          <p className="text-label font-normal text-base-400">
            No storage case. Storage begins only when the goods are ready AND the customer
            delays the delivery.</p>}
        {canAct && !starting &&
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
  const charge = storageChargeOf({
    storageStart: c.storage_start,
    ruleFreeDays: c.rule_free_days,
    ruleChargeAmount: Number(c.rule_charge_amount),
    ruleCycleDays: c.rule_cycle_days,
    approvedFreeUntil: c.approved_free_until,
  }, todayIso());
  return <div className="rounded-card border border-base-200 p-3" data-testid={`storage-case-${c.product_group}`}>
    <p className="font-semibold">{GROUP_WORD[c.product_group]}{c.status === "closed" ? " · Closed" : ""}</p>
    <p>Storage started {fmtDate(c.storage_start)} · today is day {charge.dayOfStorage}</p>
    <p>Free until {fmtDate(charge.freeUntilIso)}
      {c.approved_free_until && c.approved_free_until >= charge.freeUntilIso
        ? ` · approved${c.approval_reason ? ` — ${c.approval_reason}` : ""}` : ""}</p>
    <p>{charge.commencedPeriods === 0
      ? "No storage charge yet."
      : `${charge.commencedPeriods} charge period${charge.commencedPeriods === 1 ? "" : "s"} started · ${rm(charge.amountOwed)} — not on a Storage Invoice yet.`}</p>
    {canAct && c.status === "open" && c.rule_extra_free_allowed && !extending &&
      <button className="btn-secondary mt-2" onClick={onExtend}>Request more free days</button>}
    {extending && <ExtraFreeForm caseId={c.id} onDone={onDone} onBack={onDone} />}
  </div>;
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
