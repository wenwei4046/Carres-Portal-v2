import ReceivingReportEvidence from "@/components/receiving/ReceivingReportEvidence";
import { useEffect, useRef, useState } from "react";
import type { WarehouseConfirmReceiptInput, WarehouseConfirmationResult } from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Textarea from "@/components/kit/Textarea";
import { Prop } from "@/pages/operation/components/workspace-doc";
import { warehouseAdmissionMessage } from "@/lib/warehouse-admission-message";
import { ApiError } from "@/lib/api";
import { appDateTimeInputToIso } from "@/lib/fmt-date";
import { useWarehouseConfirmReceiptMutation } from "@/lib/warehouse-confirmation";

/** Observation only: the existing engine retains unknown-source reports as
 * drafts. No source picker, goods matching, Stock writer or completion flag. */
export default function WarehouseUnidentifiedReportModal({site,onClose}:{site:{id:string;name:string};onClose:()=>void}) {
  const [day,setDay]=useState<string|null>(null);
  const [clock,setClock]=useState("");
  const [handover,setHandover]=useState("");
  const [document,setDocument]=useState("");
  const [note,setNote]=useState("");
  const [key]=useState(()=>crypto.randomUUID());
  const [result,setResult]=useState<WarehouseConfirmationResult|null>(null);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [denied,setDenied]=useState(false);
  const [leave,setLeave]=useState(false);
  const saving=useRef(false);
  const attempt=useRef<WarehouseConfirmReceiptInput|null>(null);
  const mutation=useWarehouseConfirmReceiptMutation();
  const dirty=Boolean(day||clock||handover||document||note||uncertain);
  const locked=mutation.isPending||uncertain||denied||Boolean(result);
  const valid=Boolean(note.trim())&&(!clock||Boolean(day));
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty&&!result){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirty,result]);
  const close=()=>{if(saving.current||uncertain)return;if(dirty&&!result)setLeave(true);else onClose();};
  async function save(){
    if(saving.current||result||denied||(!uncertain&&!valid))return;
    const body:WarehouseConfirmReceiptInput=uncertain&&attempt.current?attempt.current:{saveKey:key,report:{
      poId:null,arrivalSourceId:null,actualSiteId:site.id,
      goodsReceivedAt:day,goodsReceivedClock:clock||null,
      goodsReceivedTime:day&&clock?appDateTimeInputToIso(`${day}T${clock}`):null,
      handoverPerson:handover.trim(),doNumber:document.trim()||null,
      note:note.trim(),lines:[],arrivalUnits:[],extraLines:[],arrivalEvidence:[],
    }};
    attempt.current=body;saving.current=true;setError(null);
    try{
      const saved=await mutation.mutateAsync(body);
      if(saved.status!=="draft"||saved.grn_no!==null)throw new Error("Unexpected report result");
      setResult(saved);setUncertain(false);
    }catch(failure){
      if(failure instanceof ApiError&&([401,403].includes(failure.status)||(failure.status===503 && (failure.body as {code?:string}|null)?.code==="receiving_confirmation_unavailable"))){setError(warehouseAdmissionMessage(null));setDenied(true);setUncertain(false);}
      else if(failure instanceof ApiError&&[400,422].includes(failure.status)){setError(failure.message);setUncertain(false);}
      else {setUncertain(true);setError("Not confirmed · Try again");}
    }finally{saving.current=false;}
  }
  return <>
    <Modal open title="Report unidentified delivery" onOpenChange={open=>{if(!open)close();}}
      footer={result?<Button variant="primary" onClick={onClose}>Close</Button>:<><Button disabled={mutation.isPending||uncertain} onClick={close}>Cancel</Button><Button variant="primary" loading={mutation.isPending} disabled={mutation.isPending||denied||(!uncertain&&!valid)} onClick={()=>void save()}>{uncertain?"Try again":"Save report"}</Button></>}>
      <Prop label="Goods arrived at">{site.name}</Prop>
      <p className="text-body mb-3">Record only what you observed. Operation checks the source. This report does not create a GRN or add Stock.</p>
      {error&&<p role="alert" className="text-body">{error}</p>}
      {result?<div role="status"><p>Receiving report saved. No GRN created.</p>{result.blockers.map(blocker=><p key={blocker.code}>{blocker.message}</p>)}<p className="text-body">Find this report in My receiving.</p><ReceivingReportEvidence receiptId={result.id}/></div>:<fieldset disabled={locked} className="min-w-0 border-0 p-0 m-0 grid gap-3">
        <DatePicker id="unidentified-date" label="Goods Received Date" value={day} onChange={setDay}/>
        <Input id="unidentified-time" label="Time" hint="Optional" type="time" value={clock} onChange={event=>setClock(event.target.value)} error={clock&&!day?"Record Goods Received Date before Time.":undefined}/>
        <Input id="unidentified-handover" label="Handover person" value={handover} maxLength={200} onChange={event=>setHandover(event.target.value)}/>
        <Input id="unidentified-document" label="Handover document number" value={document} maxLength={64} onChange={event=>setDocument(event.target.value)}/>
        <Textarea id="unidentified-note" label="Note" required value={note} maxLength={500} hint="Describe the goods, visible labels, quantity and condition you observed. Do not guess a PO or Unit ID." onChange={event=>setNote(event.target.value)}/>
      </fieldset>}
    </Modal>
    <Modal open={leave} title="Leave without saving?" description="What you typed is not saved yet." onOpenChange={setLeave} footer={<><Button onClick={onClose}>Leave</Button><Button variant="primary" onClick={()=>setLeave(false)}>Stay</Button></>}>{null}</Modal>
  </>;
}
