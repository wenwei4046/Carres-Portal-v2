import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import Modal from "@/components/kit/Modal";
import type { CancelPoInput } from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import Loading from "@/components/kit/Loading";
import SupplierAnswerEvidenceUploadField from "@/components/SupplierAnswerEvidenceUploadField";
import type { EvidenceEntry } from "@/components/EvidenceUploadField";
import { usePoCancellations, useRecordPoCancellation, type PoCancellationFacts } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

type Cancellation=NonNullable<CancelPoInput["cancellation"]>;
type SourceDraft={qty:string;units:string[];recipients:Record<string,string>};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
type Problem=(problem:string,action:string,retry?:()=>void)=>ReactNode;
/** Only the existing PO cancellation act, not a general PO source editor.
 * Server facts supply exact source/Unit/recipient ownership. Nothing is reserved
 * or released by selection or by saving a pending supplier request. */
export default function PoCancellationFields({poId,onSaved,onCancel,renderProblem,onDirtyChange}:{poId:string;onSaved:()=>void;onCancel:()=>void;renderProblem:Problem;onDirtyChange?:(dirty:boolean)=>void}) {
 const read=usePoCancellations(poId);
 if(read.isLoading&&!read.data) return <Loading variant="skeleton" label="Loading"/>;
 if(!read.data) return <>{renderProblem("Not available","Try again",()=>void read.refetch())}</>;
 return <CancellationEditor readAvailable={!read.isError&&!read.isFetching} onDirtyChange={onDirtyChange} poId={poId} data={read.data} refresh={async()=>{const r=await read.refetch();return r.data??read.data!;}} onSaved={onSaved} onCancel={onCancel} renderProblem={renderProblem}/>;
}
function CancellationEditor({poId,data,refresh,onSaved,onCancel,renderProblem,onDirtyChange,readAvailable}:{poId:string;data:PoCancellationFacts;refresh:()=>Promise<PoCancellationFacts>;onSaved:()=>void;onCancel:()=>void;renderProblem:Problem;onDirtyChange?:(dirty:boolean)=>void;readAvailable:boolean}) {
 const record=useRecordPoCancellation(poId);
 const navigate=useNavigate();
 const [discardOpen,setDiscardOpen]=useState(false);
 const afterDiscard=useRef<(()=>void)|null>(null);
 const [requestId,setRequestId]=useState<string>(()=>crypto.randomUUID());
 const [caseChoice,setCaseChoice]=useState("new");
 const [expectedRequestVersion,setExpectedRequestVersion]=useState(0);
 const [expectedPoVersion,setExpectedPoVersion]=useState(data.poVersion);
 const [received,setReceived]=useState(()=>Object.fromEntries(data.lines.map(line=>[line.lineId,line.receivedQty])));
 const [reason,setReason]=useState("");const [decisionReason,setDecisionReason]=useState("");
 const [facts,setFacts]=useState<Cancellation["supplierFacts"]>({supplierStatement:"awaiting",fee:"not_confirmed",shipped:null,evidence:[]});
 const [sources,setSources]=useState<Record<string,SourceDraft>>({});
 const [problem,setProblem]=useState<string|null>(null);
 const keys=useRef(new Map<string,string>());
 const cases=new Map<string,PoCancellationFacts["events"][number]>();
 for(const event of data.events) if(!cases.has(event.request_id)||cases.get(event.request_id)!.request_version<event.request_version) cases.set(event.request_id,event);
 const selectedCase=cases.get(requestId);
 const originalActor=data.events.filter(event=>event.request_id===requestId).sort((a,b)=>a.request_version-b.request_version)[0]?.actor_id;
 function chooseCase(value:string) {
  setCaseChoice(value);setProblem(null);setDecisionReason("");
  const event=cases.get(value);setRequestId(event?.request_id??crypto.randomUUID());setExpectedRequestVersion(event?.request_version??0);
  setExpectedPoVersion(event?.expected_po_version??data.poVersion);
  setReason(event?.reason??"");setFacts(event?.supplier_facts??{supplierStatement:"awaiting",fee:"not_confirmed",shipped:null,evidence:[]});
  setReceived(Object.fromEntries(data.lines.map(line=>[line.lineId,event?.scope.find(old=>old.lineId===line.lineId)?.receivedQty??line.receivedQty])));
  const next:Record<string,SourceDraft>={};
  for(const line of event?.scope??[]) for(const source of line.sources) next[`${line.lineId}/${source.demandId}`]={qty:String(source.qty),units:line.unitIds.filter(id=>data.lines.find(current=>current.lineId===line.lineId)?.sources.find(current=>current.demandId===source.demandId)?.unitChoices.some(unit=>unit.id===id)),recipients:Object.fromEntries(source.recipients.map(recipient=>[recipient.recipientId,String(recipient.qty)]))};
  setSources(next);
 }
 const draftOf=(key:string):SourceDraft=>sources[key]??{qty:"0",units:[],recipients:{}};
 const change=(key:string,patch:Partial<SourceDraft>)=>setSources(current=>({...current,[key]:{...draftOf(key),...patch}}));
 const lines:Cancellation["lines"]=[];let valid=true;
 for(const line of data.lines) {
  const selected:Cancellation["lines"][number]["sources"]=[];const unitIds:string[]=[];
  for(const source of line.sources) {
   const draft=draftOf(`${line.lineId}/${source.demandId}`);
   const qty=line.identityMode==="exact_unit"?draft.units.length:Number(draft.qty);
   if(qty===0) continue;
   if(!source.contextual||!Number.isInteger(qty)||qty<0||qty>source.activeQty||line.identityMode==="quantity"&&line.receivedQty>0&&line.sources.length>1) valid=false;
   unitIds.push(...draft.units);
   const recipients=source.purpose==="ready_stock"?[]:source.recipients.length===1?[{recipientId:source.recipients[0].recipientId,qty}]:source.recipients.map(recipient=>({recipientId:recipient.recipientId,qty:Number(draft.recipients[recipient.recipientId]??0)})).filter(recipient=>recipient.qty>0);
   if(source.purpose!=="ready_stock"&&(recipients.reduce((n,r)=>n+r.qty,0)!==qty||recipients.some(r=>!Number.isInteger(r.qty)||r.qty>(source.recipients.find(x=>x.recipientId===r.recipientId)?.qty??0)))) valid=false;
   selected.push({demandId:source.demandId,qty,recipients});
  }
  const qty=selected.reduce((n,source)=>n+source.qty,0);
  if(qty>0) {if(qty>line.pendingQty)valid=false;lines.push({lineId:line.lineId,qty,receivedQty:received[line.lineId],unitIds,sources:selected});}
 }
 for(const line of lines){line.unitIds.sort();line.sources.sort((a,b)=>a.demandId.localeCompare(b.demandId));for(const source of line.sources)source.recipients.sort((a,b)=>a.recipientId.localeCompare(b.recipientId));}lines.sort((a,b)=>a.lineId.localeCompare(b.lineId));
 const stale=expectedPoVersion!==data.poVersion||lines.some(line=>line.receivedQty!==data.lines.find(current=>current.lineId===line.lineId)?.receivedQty)||expectedRequestVersion!==(selectedCase?.request_version??0);
 const ordinary=["agreed","unable_to_supply"].includes(facts.supplierStatement)&&facts.fee==="no"&&facts.shipped===false&&facts.evidence.length>0;
 const commercial=facts.supplierStatement==="disagreed"||facts.fee==="yes"||facts.shipped===true;
 const sameSaved=!!selectedCase&&selectedCase.reason===reason&&stable(selectedCase.scope)===stable(lines)&&stable(selectedCase.supplier_facts)===stable(facts);
 const canDecide=data.canDecideException&&selectedCase?.kind==="pending"&&originalActor!==data.actorId&&selectedCase.actor_id!==data.actorId&&commercial&&facts.evidence.length>0&&facts.fee!=="not_confirmed"&&facts.supplierStatement!=="awaiting"&&sameSaved;
 const canComplete=ordinary||selectedCase?.kind==="exception_approved"&&sameSaved;
 const dirty=selectedCase?!sameSaved||decisionReason.trim().length>0:lines.length>0||reason.trim().length>0||facts.supplierStatement!=="awaiting"||facts.fee!=="not_confirmed"||facts.shipped!==null||facts.evidence.length>0;
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange]);
 function leaveDraft(action:()=>void) {
  if(dirty){afterDiscard.current=action;setDiscardOpen(true);}else action();
 }
 const ready=readAvailable&&valid&&!stale&&lines.length>0&&reason.trim().length>0&&!record.isPending;
 async function submit(action:Cancellation["action"]) {
  setProblem(null);
  const body={action,requestId,expectedRequestVersion,expectedPoVersion,lines,supplierFacts:facts,decisionReason};
  const signature=JSON.stringify({reason,body});let key=keys.current.get(signature);if(!key){key=crypto.randomUUID();keys.current.set(signature,key);}
  try {
   const result=await record.mutateAsync({reason,cancellation:{...body,key}});
   /* 0717 · Weisiang's decision (Mr Lim, WhatsApp 2026-10-22; Jess was not part of this decision):
      `complete` is sent for two approvals; it waits in Cancellation Requests. */
   if(result.request){onSaved();return;}
   setExpectedRequestVersion(result.cancellation.requestVersion);setCaseChoice(requestId);setDecisionReason("");
   if(result.cancellation.state==="effective"||result.cancellation.state==="exception_refused")onSaved();else await refresh();
  }catch(error){setProblem((error as {body?:{message?:string}}).body?.message??"Not confirmed · Try again");}
 }
 const entries:EvidenceEntry[]=facts.evidence.map(path=>({path,kind:/\.pdf$/i.test(path)?"pdf":/\.(mp4|webm|mov)$/i.test(path)?"video":"photo"}));
 return <div className="flex flex-col gap-3" data-testid="po-cancellation-fields">
  {!!data.financeHandoffs?.length&&<p role="status" className="text-body text-c-secondary">Finance connection pending</p>}
  {[...cases.values()].some(event=>event.kind!=="effective")?<Select disabled={record.isPending} id="po-cancel-case" label="History" value={caseChoice} onValueChange={value=>leaveDraft(()=>chooseCase(value))} options={[{value:"new",label:"New"},...[...cases.values()].filter(event=>event.kind!=="effective").map(event=>({value:event.request_id,label:`${fmtDate(event.at)} · ${event.reason}`}))]}/>:null}
  <Textarea id="po-cancel-reason" label="Reason" value={reason} required onChange={event=>setReason(event.target.value)} disabled={record.isPending}/>
  {data.lines.filter(line=>line.pendingQty>0||lines.some(selected=>selected.lineId===line.lineId)).map(line=><fieldset key={line.lineId} className="flex flex-col gap-3 border-b border-kit-slate-5 pb-3">
   <legend className="text-strong">{line.sku}</legend>
   <p className="text-meta text-kit-slate-11">Order Qty {line.orderedQty} · Received Qty {line.receivedQty} · Cancelled Qty {line.cancelledQty} · Pending Delivery Qty {line.pendingQty}</p>
   {line.sources.map(source=>{const key=`${line.lineId}/${source.demandId}`;const draft=draftOf(key);const qty=line.identityMode==="exact_unit"?draft.units.length:Number(draft.qty);const unavailable=!source.contextual||line.identityMode==="quantity"&&line.receivedQty>0&&line.sources.length>1;
    return <div key={source.demandId} className="flex flex-col gap-2">
     <Link className="text-body text-kit-blue-11 underline" to={`/operation?tab=manual-purchase&mp=${encodeURIComponent(source.requestId)}`} onClick={event=>{event.preventDefault();leaveDraft(()=>navigate(`/operation?tab=manual-purchase&mp=${encodeURIComponent(source.requestId)}`));}}>{source.requestNo??"Manual Purchase Request"}</Link>
     {unavailable?<p className="text-meta text-kit-slate-11">Not available</p>:line.identityMode==="exact_unit"?<div className="flex flex-wrap gap-3">{source.unitChoices.map(unit=><Checkbox key={unit.id} id={`cancel-${unit.id}`} label={unit.unitCode} checked={draft.units.includes(unit.id)} disabled={record.isPending||unit.status!=="incoming"&&!draft.units.includes(unit.id)} onCheckedChange={checked=>change(key,{units:checked?[...draft.units,unit.id]:draft.units.filter(id=>id!==unit.id)})}/>)}</div>:<Input id={`cancel-qty-${source.demandId}`} label="Cancelled Qty" type="number" min={0} max={Math.min(source.activeQty,line.pendingQty)} value={draft.qty} disabled={record.isPending} onChange={event=>change(key,{qty:event.target.value})}/>}
     {qty>0&&source.recipients.length>1?source.recipients.map(recipient=><Input key={recipient.recipientId} id={`cancel-recipient-${source.demandId}-${recipient.recipientId}`} label={recipient.name??"Goods recipient"} type="number" min={0} max={recipient.qty} value={draft.recipients[recipient.recipientId]??"0"} disabled={record.isPending} onChange={event=>change(key,{recipients:{...draft.recipients,[recipient.recipientId]:event.target.value}})}/>):null}
    </div>;
   })}
  </fieldset>)}
  <Select disabled={record.isPending} id="po-cancel-supplier" label="Supplier reply" value={facts.supplierStatement} onValueChange={value=>setFacts(current=>({...current,supplierStatement:value as Cancellation["supplierFacts"]["supplierStatement"]}))} options={[{value:"awaiting",label:"Waiting for supplier to agree"},{value:"agreed",label:"Supplier agrees"},{value:"unable_to_supply",label:"Supplier cannot supply"},{value:"disagreed",label:"Supplier disagrees"}]}/>
  <Select disabled={record.isPending} id="po-cancel-fee" label="Supplier charges for this cancellation?" value={facts.fee} onValueChange={value=>setFacts(current=>({...current,fee:value as Cancellation["supplierFacts"]["fee"]}))} options={[{value:"not_confirmed",label:"Not confirmed"},{value:"yes",label:"Yes"},{value:"no",label:"No"}]}/>
  <Select disabled={record.isPending} id="po-cancel-shipped" label="Goods have shipped?" value={facts.shipped===null?"unknown":facts.shipped?"yes":"no"} onValueChange={value=>setFacts(current=>({...current,shipped:value==="unknown"?null:value==="yes"}))} options={[{value:"unknown",label:"Not confirmed"},{value:"yes",label:"Yes"},{value:"no",label:"No"}]}/>
  <SupplierAnswerEvidenceUploadField poId={poId} poVersion={expectedPoVersion} entries={entries} onChange={entries=>setFacts(current=>({...current,evidence:entries.map(entry=>entry.path)}))} ariaLabel="Evidence" disabled={record.isPending}/>
  {canDecide?<Textarea disabled={record.isPending} id="po-cancel-decision" label="Reason" value={decisionReason} onChange={event=>setDecisionReason(event.target.value)}/>:null}
  {stale?renderProblem("This work changed. Refresh and try again.","Refresh",()=>void refresh().then(current=>{setExpectedPoVersion(current.poVersion);setReceived(Object.fromEntries(current.lines.map(line=>[line.lineId,line.receivedQty])));setExpectedRequestVersion(current.events.filter(event=>event.request_id===requestId).reduce((max,event)=>Math.max(max,event.request_version),0));})):null}
  {!readAvailable?renderProblem("Not available","Try again",()=>void refresh()):null}
  {problem?renderProblem(problem,"Try again"):null}
  <Modal open={discardOpen} onOpenChange={setDiscardOpen} title="Discard" footer={<>
   <Button variant="neutral" onClick={()=>setDiscardOpen(false)}>Cancel</Button>
   <Button variant="primary" onClick={()=>{setDiscardOpen(false);const action=afterDiscard.current;afterDiscard.current=null;action?.();}}>Discard</Button>
  </>}>Not saved</Modal>
  <div className="flex flex-wrap gap-2">
   <Button variant="neutral" onClick={onCancel} disabled={record.isPending}>Back</Button>
   <Button variant="neutral" onClick={()=>void submit("record")} disabled={!ready||sameSaved}>Save</Button>
   {canDecide?<><Button variant="neutral" onClick={()=>void submit("refuse_exception")} disabled={!ready||!decisionReason.trim()}>Refuse</Button><Button variant="primary" onClick={()=>void submit("approve_exception")} disabled={!ready||!decisionReason.trim()}>Approve</Button></>:<Button variant="primary" onClick={()=>void submit("complete")} disabled={!ready||!canComplete}>Send for approval</Button>}
  </div>
 </div>;
}
