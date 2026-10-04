import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { documentDisplayNumber, type WarehouseIncomingArrival, type WarehouseConfirmationReportInput, type WarehouseConfirmationResult } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import DOFileUploadField from "@/components/DOFileUploadField";
import { appDateTimeInput, appDateTimeInputToIso } from "@/lib/fmt-date";
import { useWarehouseConfirmReceiptMutation } from "@/lib/queries";

type Saved = { saveKey: string; result: WarehouseConfirmationResult; report: WarehouseConfirmationReportInput };
const RESULTS = [
  { value: "received", label: "Received" },
  { value: "damaged", label: "Received with issue · Damaged" },
  { value: "wrong_item", label: "Received with issue · Wrong item" },
  { value: "not_received", label: "Not received" },
] as const;

/** Another source door to the same final confirmation, never another stock writer. */
export default function WarehouseArrivalModal({ source, saved, onClose }: {
  source: WarehouseIncomingArrival; saved?: Saved; onClose: () => void;
}) {
  const original = saved?.report;
  const instant = original?.goodsReceivedTime ? appDateTimeInput(original.goodsReceivedTime) : "";
  const [day, setDay] = useState<string | null>(original?.goodsReceivedAt ?? (instant.slice(0, 10) || null));
  const [time, setTime] = useState(instant.slice(11, 16));
  const [person, setPerson] = useState(original?.handoverPerson ?? "");
  const [number, setNumber] = useState(original?.doNumber ?? "");
  const [proof, setProof] = useState(original?.doFilePath ?? null);
  const proofRead = useQuery({
    queryKey: ["warehouse-portal", "arrival-proof", source.id, proof], enabled: Boolean(proof), retry: false,
    queryFn: () => apiFetch<{ url: string }>(`/api/warehouse/arrivals/${source.id}/proof?path=${encodeURIComponent(proof!)}`),
  });
  const [note, setNote] = useState(original?.note ?? "");
  const [outcomes, setOutcomes] = useState<Record<string, string>>(() => Object.fromEntries(
    (original?.arrivalUnits ?? []).map((u) => [u.stockItemId, u.outcome === "received_with_issue" ? u.issueKind ?? "" : u.outcome]),
  ));
  const [saveKey] = useState(() => saved?.saveKey ?? crypto.randomUUID());
  const [result, setResult] = useState(saved?.result ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const pending = useRef(false);
  const mutation = useWarehouseConfirmReceiptMutation();
  const sourceChanged = (original?.arrivalUnits ?? []).some((u) => !source.units.some((v) => v.id === u.stockItemId));
  const report: WarehouseConfirmationReportInput = {
    ...original, arrivalSourceId: source.id, actualSiteId: source.to_site_id,
    goodsReceivedAt: day, goodsReceivedTime: day && time ? appDateTimeInputToIso(`${day}T${time}`) : null,
    handoverPerson: person.trim(), doNumber: number.trim(), doFilePath: proof, note,
    arrivalUnits: source.units.flatMap((unit) => {
      const chosen = outcomes[unit.id];
      if (!chosen) return [];
      return [{ stockItemId: unit.id,
        outcome: chosen === "damaged" || chosen === "wrong_item" ? "received_with_issue" as const : chosen as "received" | "not_received",
        ...(chosen === "damaged" || chosen === "wrong_item" ? { issueKind: chosen } : {}),
        note: original?.arrivalUnits?.find((u) => u.stockItemId === unit.id)?.note,
      }];
    }),
  };
  const snapshot = JSON.stringify(report);
  useEffect(() => { setConfirmed(false); }, [snapshot]);
  const allRecorded = source.units.length > 0 && source.units.every((u) => Boolean(outcomes[u.id]));
  const ready = allRecorded && !sourceChanged && confirmed && !mutation.isPending;
  async function save() {
    if (!ready || pending.current) return;
    pending.current = true;
    try {
      const answer = await mutation.mutateAsync({ saveKey, report,
        ...(result ? { receiptId: result.id, revision: result.revision } : {}) });
      setResult(answer);
      setSavedSnapshot(snapshot);
      if (answer.status === "posted" && answer.grn_no) {
        toast.success(`Receiving saved · ${documentDisplayNumber(answer.grn_no)}`);
        onClose();
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the count"); }
    finally { pending.current = false; }
  }
  return <Modal open title={`Receiving · ${documentDisplayNumber(source.source_no)}`} width="wide"
    onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}
    footer={<><Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
      <Button variant="primary" onClick={save} disabled={!ready} loading={mutation.isPending}>
        {confirmed ? "Save Receiving" : "Save — confirm receiving results"}
      </Button></>}>
    <fieldset disabled={mutation.isPending} className="min-w-0 border-0 p-0 m-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <DatePicker id="arrival-received-day" label="Goods Received Date" value={day} onChange={setDay} disabled={mutation.isPending} />
        <Input id="arrival-received-time" label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint={time ? undefined : "Time not recorded"} />
        <Input id="arrival-person" label="Handover person" value={person} onChange={(e) => setPerson(e.target.value)} />
        <Input id="arrival-document" label="Document No" value={number} onChange={(e) => setNumber(e.target.value)} />
      </div>
      <DOFileUploadField poId="" arrivalSourceId={source.id} warehouseArrival doNumber={number} onUploaded={setProof} />
      {proof ? proofRead.isLoading ? <p role="status">Loading…</p>
        : proofRead.data?.url ? <a href={proofRead.data.url} target="_blank" rel="noopener noreferrer" className="text-body text-kit-blue-11">View handover proof</a>
        : <div role="alert" className="text-body text-kit-red-9">Evidence could not be loaded <Button onClick={() => void proofRead.refetch()}>Try again</Button></div>
        : <p className="text-meta text-kit-slate-11">Not on file</p>}
      {source.units.map((unit) => <Select key={unit.id} id={`arrival-unit-${unit.id}`}
        label={`${unit.unit_code} · ${unit.sku}`} placeholder="Not recorded" options={RESULTS}
        value={outcomes[unit.id] ?? ""} disabled={mutation.isPending}
        onValueChange={(value) => setOutcomes((previous) => ({ ...previous, [unit.id]: value }))} />)}
      <Textarea id="arrival-note" label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      {sourceChanged && <p role="alert" className="text-body text-kit-red-9">Not available. Go back and reload.</p>}
      {(!confirmed || savedSnapshot !== snapshot) && <p className="text-body text-kit-slate-11">{confirmed ? "Receiving results confirmed. Not saved yet." : "Prefilled results are not confirmed. Check the goods before saving."}</p>}
      <Checkbox id="arrival-confirm-results" label="I checked the goods and confirm these receiving results."
        checked={confirmed} onCheckedChange={setConfirmed} disabled={!allRecorded || sourceChanged || mutation.isPending} />
      {result?.status === "draft" && <div role="status" className="text-body text-kit-red-9">
        <p>Receiving report saved. No GRN created.</p>
        {result.blockers.map((b) => <p key={b.code}>{b.message}</p>)}
      </div>}
    </fieldset>
  </Modal>;
}
