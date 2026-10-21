import {useEffect,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {receivingExtraObservations,receivingExtraObservation,receivingExtraObservationNote,type ReceivingExtraObservation,type RecordExtraObservationInput} from "@carres/shared";
import {apiFetch,ApiError} from "@/lib/api";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Input from "@/components/kit/Input";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import DocumentTable from "@/components/kit/DocumentTable";
import {DocSection,Prop} from "@/pages/operation/components/workspace-doc";
import {fmtDate} from "@/lib/fmt-date";
type Draft={label:string;qty:string;day:string|null;note:string;key:string};
type NoteDraft={row:ReceivingExtraObservation;text:string;key:string};
/** Versioned original custody observations, not current stock or an accepted source. */
export default function ReceivingExtraObservations({receiptId,office=false}:{receiptId:string;office?:boolean}){
 const base=office?`/api/operation/warehouse-receipts/${receiptId}/extra-observations`:`/api/warehouse/confirmation/receipts/${receiptId}/extra-observations`;
 const query=useQuery({queryKey:["receiving-extra-observations",receiptId,office],retry:false,queryFn:async()=>{
  const data=receivingExtraObservations.parse(await apiFetch(base));if(data.receipt_id!==receiptId)throw new Error("Original report identity does not match");return data;
 }});
 const [record,setRecord]=useState<Draft|null>(null),[selected,setSelected]=useState<ReceivingExtraObservation|null>(null),[note,setNote]=useState<NoteDraft|null>(null);
 const [status,setStatus]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[state,setState]=useState<"idle"|"saving"|"uncertain"|"blocked">("idle");
 const [leave,setLeave]=useState(false);const busy=useRef(false);const attempt=useRef<{kind:"record";body:RecordExtraObservationInput}|{kind:"note";body:{key:string;note:string};id:string}|null>(null);
 const dirty=Boolean(record&&(record.label||record.qty||record.day||record.note)||note?.text||state==="uncertain");
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
 const reset=()=>{setRecord(null);setSelected(null);setNote(null);setError(null);setState("idle");attempt.current=null;setLeave(false);void query.refetch();};
 const close=()=>{if(busy.current||state==="uncertain")return;if(dirty)setLeave(true);else reset();};
 const qtyValid=!record?.qty||(/^[1-9]\d*$/.test(record.qty)&&Number(record.qty)<=2147483647);
 const validRecord=Boolean(record&&(record.label.trim()||record.qty||record.note.trim())&&qtyValid);
 async function save(){
  if(busy.current||state==="blocked"||(!record&&!note)||(!note&&!validRecord))return;
  const body=state==="uncertain"&&attempt.current?attempt.current:record?{kind:"record" as const,body:{revision:query.data!.revision,key:record.key,label:record.label.trim()||null,qty:record.qty?Number(record.qty):null,note:record.note.trim(),day:record.day}}:{kind:"note" as const,id:note!.row.id,body:{key:note!.key,note:note!.text.trim()}};
  if(body.kind==="note"&&!body.body.note)return;
  attempt.current=body;busy.current=true;setState("saving");setError(null);
  try{
   if(body.kind==="record"){
    const saved=receivingExtraObservation.parse(await apiFetch(base,{method:"POST",body:JSON.stringify(body.body)}));
    if(saved.receipt_id!==receiptId||saved.request_key!==body.body.key||saved.report_revision!==body.body.revision||saved.qty!==body.body.qty||saved.label!==body.body.label||saved.note!==body.body.note)throw new Error("Observation confirmation does not match");
    setStatus("Observation recorded. No GRN or Stock created.");
   }else{
    const saved=receivingExtraObservationNote.parse(await apiFetch(`${base}/${body.id}/notes`,{method:"POST",body:JSON.stringify(body.body)}));
    if(saved.observation_id!==body.id||saved.request_key!==body.body.key||saved.note!==body.body.note)throw new Error("Note confirmation does not match");setStatus("Investigation note recorded. No goods accepted or returned.");
   }
   setRecord(null);setNote(null);setSelected(null);attempt.current=null;setState("idle");await query.refetch();
  }catch(e){if(e instanceof ApiError&&[400,401,403,409,422].includes(e.status)){setError(e.message);setState([401,403,409].includes(e.status)?"blocked":"idle");}else{setError("Not confirmed · Try again");setState("uncertain");}}
  finally{busy.current=false;}
 }
 if(query.isPending)return <DocSection title="Original observations"><p role="status">Loading…</p></DocSection>;
 if(query.isError){const denied=query.error instanceof ApiError&&[401,403].includes(query.error.status);const missing=query.error instanceof ApiError&&[404,503].includes(query.error.status);return <DocSection title="Original observations"><p role="alert">{missing?"Original observations are not available yet.":denied?"Original observations are not available for this account and Site.":"Could not be loaded"}</p>{!denied&&!missing&&<Button onClick={()=>void query.refetch()}>Try again</Button>}</DocSection>;}
 return <DocSection title="Original observations">
  <p className="text-meta">Each row is a separate observation. Do not add these quantities together. A note does not accept or return goods.</p>
  {status&&<p role="status" className="text-body">{status}</p>}
  {!office&&query.data.can_record&&query.data.observer&&<Button onClick={()=>{setRecord({label:"",qty:"",day:null,note:"",key:crypto.randomUUID()});setState("idle");setError(null);}}>Record goods held</Button>}
  {query.data.observations.length===0?<p className="text-body">No observations recorded yet.</p>:<DocumentTable label="Original observations" columns={[{key:"entry",label:"Observation"},{key:"date",label:"Date"},{key:"label",label:"Label on goods"},{key:"qty",label:"Observed Qty",numeric:true},{key:"site",label:"Goods arrived at"},{key:"holder",label:"Received by"}]} rows={query.data.observations.map((row,index)=>({key:row.id,onOpen:()=>{setSelected(row);setError(null);setState("idle");},openLabel:`Open observation ${index+1}`,cells:{entry:String(index+1),date:fmtDate(row.recorded_at,{time:true}),label:row.label||"Not recorded",qty:row.qty??"Not recorded",site:row.site_name,holder:row.holder_name}}))}/>}
  {record&&<Modal open title="Record goods held" onOpenChange={open=>{if(!open)close();}} footer={<><Button disabled={state==="saving"||state==="uncertain"} onClick={close}>Cancel</Button><Button variant="primary" loading={state==="saving"} disabled={state==="saving"||state==="blocked"||!validRecord} onClick={()=>void save()}>{state==="uncertain"?"Try again":"Save observation"}</Button></>}>
   <Prop label="Goods arrived at">{query.data.observer?.site_name||"Not recorded"}</Prop><Prop label="Received by">{query.data.observer?.holder_name||"Not recorded"}</Prop><Prop label="Recorded by">{query.data.observer?.actor_name||"Staff identity not recorded"}</Prop>
   {error&&<p role="alert">{error}</p>}
   <fieldset disabled={state!=="idle"} className="grid min-w-0 gap-3 border-0 p-0 m-0">
    <Input id="extra-observation-label" label="Label on goods" hint="Optional" value={record.label} maxLength={120} onChange={e=>setRecord({...record,label:e.target.value})}/>
    <Input id="extra-observation-qty" label="Observed Qty" hint="Leave blank when not known." type="number" min={1} step={1} max={2147483647} value={record.qty} error={!qtyValid?"Enter a whole quantity greater than zero.":undefined} onChange={e=>setRecord({...record,qty:e.target.value})}/>
    <DatePicker id="extra-observation-day" label="Goods Received Date" value={record.day} onChange={day=>setRecord({...record,day})}/>
    <Textarea id="extra-observation-fact" label="Note" value={record.note} maxLength={300} onChange={e=>setRecord({...record,note:e.target.value})}/>
   </fieldset>
  </Modal>}
  {selected&&!record&&<Modal open title="Original observation" onOpenChange={open=>{if(!open)close();}} footer={<><Button disabled={state==="saving"||state==="uncertain"} onClick={close}>Close</Button>{note&&<Button variant="primary" loading={state==="saving"} disabled={!note.text.trim()||state==="saving"||state==="blocked"} onClick={()=>void save()}>{state==="uncertain"?"Try again":"Save note"}</Button>}</>}>
   <Prop label="Report revision">{String(selected.report_revision)}</Prop><Prop label="Reported PO No">{typeof selected.report_snapshot.po_id==="string"&&selected.report_snapshot.po_id?selected.report_snapshot.po_id:"Not recorded"}</Prop>
   <p className="text-meta">This is the original receiving report. It does not confirm the source of the extra goods.</p>
   <Prop label="Recorded by">{selected.actor_name} · {fmtDate(selected.recorded_at,{time:true})}</Prop><Prop label="Received by">{selected.holder_name}</Prop><Prop label="Goods arrived at">{selected.site_name}</Prop>
   <Prop label="Label on goods">{selected.label||"Not recorded"}</Prop><Prop label="Observed Qty">{selected.qty??"Not recorded"}</Prop><Prop label="Goods Received Date">{selected.goods_received_at?fmtDate(selected.goods_received_at):"Not recorded"}</Prop><Prop label="Note">{selected.note||"Not recorded"}</Prop>
   <ul aria-label="Investigation history" className="space-y-3">{query.data.notes.filter(n=>n.observation_id===selected.id).map(n=><li key={n.id}><p className="text-meta">{n.actor_name} · {fmtDate(n.recorded_at,{time:true})}</p><p className="text-body whitespace-pre-wrap break-words">{n.note}</p></li>)}</ul>
   {office&&query.data.can_investigate&&!note&&<Button onClick={()=>{setNote({row:selected,text:"",key:crypto.randomUUID()});setState("idle");}}>Add investigation note</Button>}
   {note&&<Textarea id="extra-investigation-note" label="Investigation note" value={note.text} maxLength={2000} disabled={state!=="idle"} onChange={e=>setNote({...note,text:e.target.value})}/>}
   {error&&<p role="alert">{error}</p>}
  </Modal>}
  <Modal open={leave} title="Leave without saving?" description="What you typed is not saved yet." onOpenChange={setLeave} footer={<><Button onClick={reset}>Leave</Button><Button variant="primary" onClick={()=>setLeave(false)}>Stay</Button></>}>{null}</Modal>
 </DocSection>;
}
