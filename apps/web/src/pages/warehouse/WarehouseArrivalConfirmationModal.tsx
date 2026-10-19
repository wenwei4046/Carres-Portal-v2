import { ApiError } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { documentDisplayNumber, RECEIVING_UNIT_OUTCOME_LABEL, type WarehouseConfirmationReportInput, type WarehouseConfirmationResult, type WarehouseConfirmReceiptInput, type ReceivingUnitOutcome } from "@carres/shared";
import { useWarehouseConfirmReceiptMutation, type WarehouseArrivalSource } from "@/lib/warehouse-confirmation";
import { appDateTimeInput, appDateTimeInputToIso } from "@/lib/fmt-date";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import Checkbox from "@/components/kit/Checkbox";
import Textarea from "@/components/kit/Textarea";
import DOFileUploadField from "@/components/DOFileUploadField";
import { DocSection, Prop } from "@/pages/operation/components/workspace-doc";

type Result={outcome:ReceivingUnitOutcome|null;issueKind:"damaged"|"wrong_item"|null};
export default function WarehouseArrivalConfirmationModal({source,site,saved,onClose}:{
  source:WarehouseArrivalSource;site?:{id:string;name:string};onClose:()=>void;
  saved?:{saveKey:string;result:WarehouseConfirmationResult;report:WarehouseConfirmationReportInput};
}) {
 const original=saved?.report;
 const [units,setUnits]=useState<Record<string,Result>>(()=>Object.fromEntries(source.units.flatMap(unit=>{const prior=original?.arrivalUnits?.find(row=>row.stockItemId===unit.id);return prior?[[unit.id,{outcome:prior.outcome??null,issueKind:prior.issueKind??null}]]:[];})));
 const [day,setDay]=useState<string|null>(original?.goodsReceivedAt ?? (original?.goodsReceivedTime?appDateTimeInput(original.goodsReceivedTime).slice(0,10):null));
 const [clock,setClock]=useState(original?.goodsReceivedTime?appDateTimeInput(original.goodsReceivedTime).slice(11,16):original?.goodsReceivedClock??"");
 const [person,setPerson]=useState(original?.handoverPerson??"");
 const [document,setDocument]=useState(original?.doNumber??"");
 const [path,setPath]=useState(original?.doFilePath??null);
 const [note,setNote]=useState(original?.note??"");
 const [confirmed,setConfirmed]=useState(false);
 const [result,setResult]=useState<WarehouseConfirmationResult|null>(saved?.result??null);
 const [uncertain,setUncertain]=useState(false);
 const [rejected,setRejected]=useState<string|null>(null);
 const [leaving,setLeaving]=useState(false);
 const [saveKey]=useState(()=>saved?.saveKey??crypto.randomUUID());
 const saving=useRef(false),attempt=useRef<WarehouseConfirmReceiptInput|null>(null);
 const mutation=useWarehouseConfirmReceiptMutation();
 const posted=result?.status==="posted";
 const locked=posted || mutation.isPending || uncertain;
 const changedSource=(original?.arrivalUnits??[]).some(unit=>!source.units.some(current=>current.id===unit.stockItemId));
 const unavailable=changedSource || !source.units.length || source.units.some(unit=>!unit.unit_code) || new Set(source.units.map(unit=>unit.id)).size!==source.units.length;
 const report:WarehouseConfirmationReportInput={...original,poId:null,arrivalSourceId:source.id,actualSiteId:site?.id??original?.actualSiteId??null,
  goodsReceivedAt:day,goodsReceivedClock:clock||null,goodsReceivedTime:day&&clock?(original?.goodsReceivedTime&&`${day}T${clock}`===appDateTimeInput(original.goodsReceivedTime).slice(0,16)?original.goodsReceivedTime:appDateTimeInputToIso(`${day}T${clock}`)):null,
  handoverPerson:person,doNumber:document,doFilePath:path,note,
  arrivalUnits:source.units.map(unit=>({stockItemId:unit.id,outcome:units[unit.id]?.outcome??null,issueKind:units[unit.id]?.issueKind??null,note:original?.arrivalUnits?.find(row=>row.stockItemId===unit.id)?.note})),
 };
 const snapshot=JSON.stringify(report);
 useEffect(()=>setConfirmed(false),[snapshot]);
 const dirty=Boolean(day||clock||person||document||path||note||Object.keys(units).length||confirmed||uncertain);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty&&!posted){event.preventDefault();event.returnValue="";}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,posted]);
 const close=()=>{if(saving.current)return;if(dirty&&!posted)setLeaving(true);else onClose();};
 const save=async()=>{
  if(saving.current||posted||(!uncertain&&(!confirmed||unavailable)))return;
  const body=uncertain&&attempt.current?attempt.current:{saveKey,report,...(result?{receiptId:result.id,revision:result.revision}:{})};
  attempt.current=body;saving.current=true;
  try{setResult(await mutation.mutateAsync(body));setUncertain(false);setRejected(null);setConfirmed(false);}catch(error){if(error instanceof ApiError && [400,422].includes(error.status)){setRejected(error.message);setUncertain(false);setConfirmed(false);}else setUncertain(true);}finally{saving.current=false;}
 };
 return <>
  <Modal open title={`Receiving · ${documentDisplayNumber(source.source_no)}`} width="wide" onOpenChange={open=>{if(!open)close();}} footer={posted?<Button variant="primary" onClick={onClose}>Close</Button>:<><Button disabled={mutation.isPending} onClick={close}>Cancel</Button><Button variant="primary" loading={mutation.isPending} disabled={mutation.isPending||(!uncertain&&(!confirmed||unavailable))} onClick={()=>void save()}>{uncertain?"Try again":confirmed?"Save Receiving":"Save — confirm receiving results"}</Button></>}>
   {posted?<div role="status"><p>{documentDisplayNumber(result.grn_no!)}</p><p>Receiving saved</p></div>:<>
    {unavailable&&<p role="alert">Not available. Go back and reload.</p>}
    {rejected&&<p role="alert">{rejected}</p>}
    {uncertain&&<p role="alert">Not confirmed · Try again</p>}
    <fieldset disabled={locked} className="min-w-0 border-0 m-0 p-0">
     <DocSection title="Receiving"><Prop label="From">{source.from_site_name||"Origin not recorded"}</Prop><Prop label="To">{site?.name||"Not recorded"}</Prop>
      <div className="grid gap-3 md:grid-cols-2"><DatePicker id="arrival-date" label="Goods Received Date" value={day} onChange={setDay}/><Input id="arrival-clock" label="Time" hint="Optional" type="time" value={clock} onChange={event=>setClock(event.target.value)}/><Input id="arrival-person" label="Handover person" value={person} maxLength={200} onChange={event=>setPerson(event.target.value)}/><Input id="arrival-document" label="Handover document number" value={document} maxLength={64} onChange={event=>setDocument(event.target.value)}/></div>
      <DOFileUploadField poId="" arrivalSourceId={source.id} arrivalProofDoor="warehouse" doNumber={document} onUploaded={setPath}/>
     </DocSection>
     <DocSection title="Unit results">{source.units.map(unit=><div key={unit.id} className="grid gap-3 mb-3 md:grid-cols-2"><Select id={`arrival-unit-${unit.id}`} label={unit.unit_code} placeholder="Not recorded" value={units[unit.id]?.outcome??undefined} onValueChange={value=>setUnits(prior=>({...prior,[unit.id]:{outcome:value as ReceivingUnitOutcome,issueKind:prior[unit.id]?.issueKind??null}}))} options={(['received','received_with_issue','not_received'] as const).map(value=>({value,label:RECEIVING_UNIT_OUTCOME_LABEL[value]}))}/>{units[unit.id]?.outcome==='received_with_issue'&&<Select id={`arrival-issue-${unit.id}`} label="Problem" placeholder="Not recorded" value={units[unit.id]?.issueKind??undefined} onValueChange={value=>setUnits(prior=>({...prior,[unit.id]:{...prior[unit.id],issueKind:value as Result['issueKind']}}))} options={[{value:'damaged',label:'Damaged'},{value:'wrong_item',label:'Wrong item'}]}/>}</div>)}</DocSection>
     <DocSection title="Note"><Textarea id="arrival-note" label="Note" value={note} maxLength={500} onChange={event=>setNote(event.target.value)}/></DocSection>
     <Checkbox id="arrival-confirm" label="I checked the goods and confirm these receiving results." checked={confirmed} onCheckedChange={setConfirmed} disabled={locked}/>
    </fieldset>
    {result?.status==="draft"&&<div role="status" className="text-body text-kit-red-11 mt-3"><p>Receiving report saved. No GRN created.</p>{result.blockers.map(blocker=><p key={blocker.code}>{blocker.message}</p>)}</div>}
   </>}
  </Modal>
  <Modal open={leaving} title="Leave without saving?" description="What you typed is not saved yet." onOpenChange={setLeaving} footer={<><Button onClick={onClose}>Leave</Button><Button variant="primary" onClick={()=>setLeaving(false)}>Stay</Button></>}>{null}</Modal>
 </>;
}
