import { ApiError } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { documentDisplayNumber, RECEIVING_UNIT_OUTCOME_LABEL, wrongItemClaimTypesFor, type WarehouseIncomingPo, type WarehouseConfirmationResult, type WarehouseConfirmationReportInput, type WarehouseConfirmReceiptInput, type ReceivingUnitOutcome, type ReceivingArrivalEvidence } from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import DocumentTable from "@/components/kit/DocumentTable";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import DOFileUploadField from "@/components/DOFileUploadField";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import { DocSection } from "@/pages/operation/components/workspace-doc";
import { appDateTimeInput, appDateTimeInputToIso } from "@/lib/fmt-date";
import { useWarehouseConfirmReceiptMutation } from "@/lib/warehouse-confirmation";

type Unit = { outcome: ReceivingUnitOutcome | null; issueKind: "damaged" | "wrong_item" | null };
type Counts = { receivedNow?: number; damagedQty?: number; wrongItemQty?: number; damagedPhotos?: string[]; wrongItemPhotos?: string[]; wrongItemClaimType?: string };

/** Explicit physical confirmation uses the existing engine. Unknown facts stay unknown. */
export default function WarehouseConfirmationModal({ po, site, saved, onClose }: {
  po: WarehouseIncomingPo; site?: {id: string; name: string}; saved?: {saveKey:string;result:WarehouseConfirmationResult;report:WarehouseConfirmationReportInput}; onClose: () => void;
}) {
  const stored = saved?.report;
  const [counts, setCounts] = useState<Record<string, Counts>>(() => Object.fromEntries((stored?.lines ?? []).filter(line=>line.id).map(line=>[line.id!,{
    receivedNow:line.receivedNow ?? undefined,damagedQty:line.damagedQty ?? undefined,wrongItemQty:line.wrongItemQty ?? undefined,
    damagedPhotos:(line.damagedPhotos ?? []).filter((photo):photo is string=>typeof photo === "string"),wrongItemPhotos:(line.wrongItemPhotos ?? []).filter((photo):photo is string=>typeof photo === "string"),wrongItemClaimType:line.wrongItemClaimType,
  }])));
  const [units, setUnits] = useState<Record<string, Unit>>(() => Object.fromEntries((po.expected_units ?? []).flatMap(unit=>{
    const original=stored?.lines?.find(line=>line.id===unit.po_line_id)?.units?.find(item=>item.unitCode===unit.unit_code);
    return original ? [[unit.id,{outcome:original.outcome ?? null,issueKind:original.issueKind ?? null}]] : [];
  })));
  const [day, setDay] = useState<string | null>(stored?.goodsReceivedAt ?? (stored?.goodsReceivedTime ? appDateTimeInput(stored.goodsReceivedTime).slice(0,10) : undefined) ?? null);
  const [clock,setClock]=useState(stored?.goodsReceivedTime ? appDateTimeInput(stored.goodsReceivedTime).slice(11,16) : stored?.goodsReceivedClock ?? "");
  const [doNumber, setDoNumber] = useState(stored?.doNumber ?? "");
  const [doPath, setDoPath] = useState<string | null>(stored?.doFilePath ?? null);
  const [evidence, setEvidence] = useState<ReceivingArrivalEvidence[]>(stored?.arrivalEvidence ?? []);
  const [note, setNote] = useState(stored?.note ?? "");
  const [extras, setExtras] = useState<Array<{id: string; sku: string; qty: string; note: string}>>(()=>(stored?.extraLines ?? []).map(line=>({id:crypto.randomUUID(),sku:line.sku ?? "",qty:line.qty==null?"":String(line.qty),note:line.note ?? ""})));
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<WarehouseConfirmationResult | null>(saved?.result ?? null);
  const [uncertain, setUncertain] = useState(false);
  const [rejected,setRejected]=useState<string|null>(null);
  const [leave, setLeave] = useState(false);
  const [saveKey] = useState(() => saved?.saveKey ?? crypto.randomUUID());
  const lastAttempt = useRef<WarehouseConfirmReceiptInput | null>(null);
  const saving = useRef(false);
  const submit = useWarehouseConfirmReceiptMutation();
  const posted = result?.status === "posted";
  const locked = submit.isPending || uncertain || posted;
  const expected = useMemo(() => new Map(po.lines.map(line => [line.id, (po.expected_units ?? []).filter(unit => unit.status === "incoming" && unit.po_line_id === line.id)])), [po.lines, po.expected_units]);
  const sourceChanged = (stored?.lines ?? []).some(line=>!po.lines.some(current=>current.id===line.id) || (line.units ?? []).some(unit=>!(expected.get(String(line.id)) ?? []).some(current=>current.unit_code===unit.unitCode)));
  const sourceUnavailable = sourceChanged || po.lines.some(line => !Number.isFinite(line.pending_qty) || Number(line.pending_qty) < 0 || !line.identity_mode || (line.identity_mode === "exact_unit" && !expected.get(line.id)?.length));

  const report: WarehouseConfirmationReportInput = {
    ...stored,
    poId: po.po_id, actualSiteId: site?.id ?? stored?.actualSiteId ?? null, goodsReceivedAt: day,
    goodsReceivedClock:clock || null,
    goodsReceivedTime: day && clock ? (stored?.goodsReceivedTime && `${day}T${clock}` === appDateTimeInput(stored.goodsReceivedTime).slice(0,16) ? stored.goodsReceivedTime : appDateTimeInputToIso(`${day}T${clock}`)) : null,
    doNumber: doNumber.trim(), doFilePath: doPath, arrivalEvidence: evidence, note,
    extraLines: extras.map(line => ({sku:line.sku.trim(),qty:line.qty===""?null:Number(line.qty),note:line.note})),
    lines: po.lines.map(line => {
      const physical = counts[line.id] ?? {};
      const observed = (expected.get(line.id) ?? []).map(unit => ({unitCode:unit.unit_code,outcome:units[unit.id]?.outcome ?? null,issueKind:units[unit.id]?.issueKind ?? null,note:stored?.lines?.find(item=>item.id===line.id)?.units?.find(item=>item.unitCode===unit.unit_code)?.note}));
      const known = observed.every(unit => unit.outcome && (unit.outcome !== "received_with_issue" || unit.issueKind));
      return { id: line.id,
        receivedNow: line.identity_mode === "exact_unit" ? known ? observed.filter(unit => unit.outcome === "received").length : null : physical.receivedNow ?? null,
        damagedQty: line.identity_mode === "exact_unit" ? known ? observed.filter(unit => unit.outcome === "received_with_issue" && unit.issueKind === "damaged").length : null : physical.damagedQty ?? null,
        wrongItemQty: line.identity_mode === "exact_unit" ? known ? observed.filter(unit => unit.outcome === "received_with_issue" && unit.issueKind === "wrong_item").length : null : physical.wrongItemQty ?? null,
        damagedPhotos: [...(physical.damagedPhotos ?? []),...(stored?.lines?.find(item=>item.id===line.id)?.damagedPhotos ?? []).filter(photo=>typeof photo !== "string")], wrongItemPhotos: [...(physical.wrongItemPhotos ?? []),...(stored?.lines?.find(item=>item.id===line.id)?.wrongItemPhotos ?? []).filter(photo=>typeof photo !== "string")], wrongItemClaimType: physical.wrongItemClaimType,
        ...(line.identity_mode === "exact_unit" ? {units:observed} : {}),
      };
    }),
  };
  const snapshot = JSON.stringify(report);
  useEffect(() => setConfirmed(false), [snapshot]);
  const dirty = Boolean(doNumber || day || clock || doPath || evidence.length || note || extras.length || Object.keys(counts).length || Object.keys(units).length || confirmed || uncertain);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !posted) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, posted]);
  const close = () => { if (saving.current) return; if (dirty && !posted) setLeave(true); else onClose(); };
  const patch = (id: string, value: Partial<Counts>) => setCounts(previous => ({...previous,[id]:{...previous[id],...value}}));
  async function save() {
    if (saving.current || posted || (!uncertain && (!confirmed || sourceUnavailable))) return;
    const body = uncertain && lastAttempt.current ? lastAttempt.current : {saveKey,report,...(result ? {receiptId:result.id,revision:result.revision} : {})};
    lastAttempt.current = body; saving.current = true;
    try { const saved = await submit.mutateAsync(body); setResult(saved); setUncertain(false); setRejected(null); setConfirmed(false); }
    catch(error) { if(error instanceof ApiError && [400,422].includes(error.status)){setRejected(error.message);setUncertain(false);setConfirmed(false);}else setUncertain(true); }
    finally { saving.current = false; }
  }
  return <>
    <Modal open title={`Receiving · ${documentDisplayNumber(po.po_id)}`} width="wide" onOpenChange={open => {if (!open) close();}}
      footer={posted ? <Button variant="primary" onClick={onClose}>Close</Button> : <>
        <Button disabled={submit.isPending} onClick={close}>Cancel</Button>
        <Button variant="primary" loading={submit.isPending} disabled={submit.isPending || (!uncertain && (!confirmed || sourceUnavailable))} onClick={() => void save()}>{uncertain ? "Try again" : confirmed ? "Save Receiving" : "Save — confirm receiving results"}</Button>
      </>}>
      {posted ? <div role="status" className="text-body"><p>{documentDisplayNumber(result.grn_no!)}</p><p>Receiving saved</p></div> : <>
        {rejected && <p role="alert">{rejected}</p>}
        {uncertain && <p role="alert" className="text-body text-kit-red-11 mb-3">Not confirmed · Try again</p>}
        {sourceUnavailable && <p role="alert" className="text-body text-kit-red-11 mb-3">Not available. Go back and reload.</p>}
        <fieldset disabled={locked} className="min-w-0 border-0 p-0 m-0">
          <p className="text-body">{po.supplier_name || "Not recorded"}{site ? ` · ${site.name}` : ""}</p>
          <DocSection title="Items">
            <DocumentTable label="Items" columns={[{key:"sku",label:"SKU"},{key:"pending",label:"Pending Delivery Qty",numeric:true}]} rows={po.lines.map(line=>({key:line.id,cells:{sku:line.sku,pending:line.pending_qty ?? "Not recorded"}}))}/>
            {po.lines.map(line => {
              const physical = counts[line.id] ?? {};
              const lineReport = report.lines!.find(item => item.id === line.id)!;
              return <DocSection key={line.id} title={line.sku}>
                {line.identity_mode === "quantity" ? <div className="grid gap-3 md:grid-cols-3">
                  {([['receivedNow','Received Qty'],['damagedQty','Damaged Qty'],['wrongItemQty','Wrong Item Qty']] as const).map(([key,label])=><Input key={key} id={`${line.id}-${key}`} label={label} type="number" min={0} step={1} value={physical[key] ?? ""} onChange={event=>patch(line.id,{[key]:event.target.value === "" ? undefined : Math.max(0,Math.trunc(Number(event.target.value)))})}/>)}
                </div> : (expected.get(line.id) ?? []).map(unit=><div key={unit.id} className="grid gap-3 mb-3 md:grid-cols-2">
                  <Select id={`unit-${unit.id}`} label={unit.unit_code} placeholder="Not recorded" value={units[unit.id]?.outcome ?? undefined} onValueChange={value=>setUnits(previous=>({...previous,[unit.id]:{outcome:value as ReceivingUnitOutcome,issueKind:value === "received_with_issue" ? previous[unit.id]?.issueKind ?? null : null}}))} options={(['received','received_with_issue','not_received'] as const).map(value=>({value,label:RECEIVING_UNIT_OUTCOME_LABEL[value]}))}/>
                  {units[unit.id]?.outcome === 'received_with_issue' && <Select id={`issue-${unit.id}`} label="Problem" placeholder="Not recorded" value={units[unit.id]?.issueKind ?? undefined} onValueChange={value=>setUnits(previous=>({...previous,[unit.id]:{...previous[unit.id],issueKind:value as Unit['issueKind']}}))} options={[{value:'damaged',label:'Damaged'},{value:'wrong_item',label:'Wrong item'}]}/>}
                </div>)}
                {(lineReport.damagedQty ?? 0)>0 && <ClaimPhotoUploadField poId={po.po_id} doNumber={doNumber || "receiving"} label="Evidence" paths={physical.damagedPhotos ?? []} onChange={paths=>patch(line.id,{damagedPhotos:paths})}/>}
                {(lineReport.wrongItemQty ?? 0)>0 && <>
                  <Select id={`wrong-${line.id}`} label="What kind of wrong?" value={physical.wrongItemClaimType} placeholder="Not recorded" onValueChange={value=>patch(line.id,{wrongItemClaimType:value})} options={wrongItemClaimTypesFor(line.category).map(item=>({value:item.key,label:item.label}))}/>
                  <ClaimPhotoUploadField poId={po.po_id} doNumber={doNumber || "receiving"} label="Evidence" paths={physical.wrongItemPhotos ?? []} onChange={paths=>patch(line.id,{wrongItemPhotos:paths})}/>
                </>}
              </DocSection>;
            })}
          </DocSection>
          <DocSection title="Receiving">
            <div className="grid gap-3 md:grid-cols-2"><DatePicker id="confirm-date" label="Goods Received Date" value={day} onChange={setDay}/><Input id="confirm-clock" label="Time" hint="Optional" type="time" value={clock} onChange={event=>setClock(event.target.value)}/><Input id="confirm-do" label="Supplier DO No" value={doNumber} maxLength={64} onChange={event=>setDoNumber(event.target.value)}/></div>
            <DOFileUploadField poId={po.po_id} doNumber={doNumber || "receiving"} onUploaded={setDoPath}/>
            <ArrivalEvidenceUploadField poId={po.po_id} doNumber={doNumber} entries={evidence} onChange={setEvidence}/>
            <Textarea id="confirm-note" label="Note" value={note} maxLength={500} onChange={event=>setNote(event.target.value)}/>
          </DocSection>
          <DocSection title="Extra goods">
            {extras.map(extra=><div key={extra.id} className="grid gap-3 mb-3 md:grid-cols-2"><Input id={`extra-sku-${extra.id}`} label="SKU" maxLength={120} value={extra.sku} onChange={event=>setExtras(previous=>previous.map(line=>line.id===extra.id?{...line,sku:event.target.value}:line))}/><Input id={`extra-qty-${extra.id}`} label="Extra Qty" type="number" min={1} step={1} value={extra.qty} onChange={event=>setExtras(previous=>previous.map(line=>line.id===extra.id?{...line,qty:event.target.value}:line))}/><Textarea id={`extra-note-${extra.id}`} label="Note" value={extra.note} maxLength={300} onChange={event=>setExtras(previous=>previous.map(line=>line.id===extra.id?{...line,note:event.target.value}:line))}/><Button onClick={()=>setExtras(previous=>previous.filter(line=>line.id!==extra.id))}>Remove</Button></div>)}
            <Button disabled={extras.length>=50} onClick={()=>setExtras(previous=>[...previous,{id:crypto.randomUUID(),sku:"",qty:"",note:""}])}>Add line</Button>
          </DocSection>
          <DocSection title="Receiving Summary"><Checkbox id="confirm-physical" label="I checked the goods and confirm these receiving results." checked={confirmed} onCheckedChange={setConfirmed} disabled={locked}/></DocSection>
        </fieldset>
        {result?.status === "draft" && <div role="status" className="text-body text-kit-red-11 mt-3"><p>Receiving report saved. No GRN created.</p>{result.blockers.map(blocker=><p key={blocker.code}>{blocker.message}</p>)}</div>}
      </>}
    </Modal>
    <Modal open={leave} title="Leave without saving?" description="What you typed is not saved yet." onOpenChange={setLeave} footer={<><Button onClick={onClose}>Leave</Button><Button variant="primary" onClick={()=>setLeave(false)}>Stay</Button></>}>{null}</Modal>
  </>;
}
