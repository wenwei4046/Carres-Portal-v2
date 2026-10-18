import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SERVICE_CASE_MOVEMENTS, SERVICE_CASE_REMEDIES, serviceCaseRemedyProposalSchema, type CaseEvidenceListResponse, type ServiceCaseRemedyDecision, type ServiceCaseRemedyState } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import Select from "@/components/kit/Select";
import Checkbox from "@/components/kit/Checkbox";
import Loading from "@/components/kit/Loading";
import DatePicker from "@/components/kit/DatePicker";

/** Only the existing Case's formal decision; this neither approves a purchase
 * nor performs Stock, Delivery, Finance or customer communication work. */
export default function CaseRemedyApproval({ caseId, disabled=false, onDirtyChange, onBusyChange }: { caseId: string; disabled?: boolean; onDirtyChange?: (dirty:boolean)=>void; onBusyChange?: (busy:boolean)=>void }) {
 const qc=useQueryClient(); const queryKey=["ops","service-cases",caseId,"remedy"];
 const endpoint=`/api/ops/service-cases/${caseId}/remedy`;
 const read=useQuery({queryKey,queryFn:()=>apiFetch<ServiceCaseRemedyState>(endpoint),retry:false});
 const files=useQuery({queryKey:["ops","service-cases",caseId,"evidence"],queryFn:()=>apiFetch<CaseEvidenceListResponse>(`/api/ops/service-cases/${caseId}/evidence`),retry:false});
 const [editing,setEditing]=useState(false); const [key,setKey]=useState(()=>crypto.randomUUID());
 const [requestId,setRequestId]=useState(""); const [policy,setPolicy]=useState(""); const [policyVersion,setPolicyVersion]=useState("");
 const [policyResult,setPolicyResult]=useState(""); const [remedy,setRemedy]=useState(""); const [movement,setMovement]=useState("");
 const [charge,setCharge]=useState(""); const [amount,setAmount]=useState(""); const [payer,setPayer]=useState(""); const [reason,setReason]=useState("");
 const [acceptedBy,setAcceptedBy]=useState(""); const [acceptedOn,setAcceptedOn]=useState<string|null>(null); const [acceptanceFile,setAcceptanceFile]=useState("");
 const [evidence,setEvidence]=useState<string[]>([]); const [affectedUnits,setAffectedUnits]=useState<string[]>([]);
 const [decisionReasons,setDecisionReasons]=useState<Record<string,string>>({}); const [problem,setProblem]=useState<string|null>(null);
 const propose=useMutation({mutationFn:(body:unknown)=>apiFetch(`${endpoint}/proposals`,{method:"POST",body:JSON.stringify(body)}),onSuccess:()=>{setEditing(false);setKey(crypto.randomUUID());setProblem(null);void qc.invalidateQueries({queryKey});},onError:(e:Error)=>setProblem(e.message)});
 const decide=useMutation({mutationFn:(body:ServiceCaseRemedyDecision)=>apiFetch(`${endpoint}/decisions`,{method:"POST",body:JSON.stringify(body)}),onSuccess:(_result,body)=>{setProblem(null);setDecisionReasons(previous=>({...previous,[body.approvalId]:""}));void qc.invalidateQueries({queryKey});},onError:(e:Error)=>setProblem(e.message)});
 const dirty=(editing&&Boolean(requestId||policy||policyVersion||policyResult||remedy||movement||charge||amount||payer||reason||acceptedBy||acceptedOn||acceptanceFile||evidence.length||affectedUnits.length))||Object.values(decisionReasons).some(r=>r.trim())||propose.isPending||decide.isPending;
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange?.(propose.isPending||decide.isPending);return()=>onBusyChange?.(false);},[propose.isPending,decide.isPending,onBusyChange]);
 useEffect(()=>{if(!dirty)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);},[dirty]);
 const request=read.data?.requests.find(r=>r.id===requestId);
 const locked=disabled||propose.isPending||decide.isPending;
 const toggle=(values:string[],value:string,on:boolean)=>on?[...values,value]:values.filter(x=>x!==value);
 function sendProposal() {
  const selectedEvidence=charge==="charged"&&acceptanceFile?Array.from(new Set([...evidence,acceptanceFile])):evidence;
  const parsed=serviceCaseRemedyProposalSchema.safeParse({key,requestId,expectedRequestVersion:request?.version,affectedUnits,policy,policyVersion,policyResult,remedy,movement,charge,amount:charge==="charged"?Number(amount):null,payer:charge==="charged"?payer:"",payerAcceptance:charge==="charged"?{by:acceptedBy,on:acceptedOn,evidence:acceptanceFile}:null,reason,evidence:selectedEvidence});
  if(!parsed.success){setProblem(parsed.error.issues[0]?.message??"Complete the remedy proposal.");return;}
  propose.mutate(parsed.data);
 }
 return <Block title="Case approval">
  {read.isPending?<Loading label="Loading Case approvals"/>:read.isError?<div role="alert"><p>Case approvals could not be loaded.</p><Button onClick={()=>void read.refetch()}>Try again</Button></div>:read.data?<div className="space-y-3">
   <p className="text-body text-c-secondary">Service Case Approver: {read.data.approver?.actorName??read.data.approver?.acting_user_name??read.data.approver?.normal_user_name??"Not assigned"}</p>
   {disabled&&<p role="status" className="text-body text-c-secondary">Save the Case changes before reviewing its remedy.</p>}
   {read.data.proposals.map(p=><div key={p.id} className="space-y-2">
    <p className="text-strong text-c-ink">{p.status==="pending"?"Need approval":p.status==="approved"?"Approved":"Refused"}</p>
    {p.payload.scope.context.lines.map((line,i)=><div key={i} className="space-y-1">
     <p className="text-body text-c-ink">{line.sku} · {line.qty}</p>
     {Object.entries(line.attrs??{}).map(([name,value])=><p key={name} className="text-body text-c-secondary">{name.replaceAll("_"," ")}: {typeof value==="object"?JSON.stringify(value):String(value)}</p>)}
     {line.recipientNeeds.map(need=>{const recipient=p.payload.scope.context.recipients.find(r=>r.id===need.recipientId);return <p key={need.recipientId} className="text-body text-c-secondary">{recipient?.name??"Recipient not recorded"} · {need.qty} pcs</p>;})}
    </div>)}
    {p.payload.scope.context.recipients.map(recipient=><div key={recipient.id} className="space-y-1">
     <p className="text-body text-c-ink">{[recipient.company,recipient.name,recipient.phone].filter(Boolean).join(" · ")}</p>
     <p className="text-body text-c-secondary">{recipient.method==="delivery"?"Delivery":"Self pickup"} · {fmtDate(recipient.deliveryDate)}</p>
     {recipient.method==="delivery"?<><p className="break-words text-body text-c-secondary">{[recipient.addressLine1,recipient.addressLine2,recipient.city,recipient.state,recipient.postcode].filter(Boolean).join(", ")}</p><p className="text-body text-c-secondary">{recipient.buildingType} · Floor {recipient.floor} · {recipient.lift==="has_lift"?"Has lift":"No lift"}</p></>:<p className="text-body text-c-secondary">Collected by {recipient.collectedBy} · Check pickup location in the linked request.</p>}
    </div>)}
    <Link to={`/operation?tab=manual-purchase&mp=${encodeURIComponent(p.payload.proposal.requestId)}`} className="block text-body text-kit-blue-11">Open Manual Purchase Request</Link>
    <p className="text-body text-c-secondary">{SERVICE_CASE_REMEDIES.find(x=>x.value===p.payload.proposal.remedy)?.label} · {SERVICE_CASE_MOVEMENTS.find(x=>x.value===p.payload.proposal.movement)?.label}</p>
    <p className="text-body text-c-secondary">{p.payload.proposal.policy} · {p.payload.proposal.policyVersion} · {p.payload.proposal.policyResult==="eligible"?"Eligible":"Not eligible"}</p>
    <p className="text-body text-c-secondary">{p.payload.proposal.charge==="free"?"Free":`Charged RM ${p.payload.proposal.amount?.toFixed(2)} · ${p.payload.proposal.payer}`}</p>
    {p.payload.proposal.payerAcceptance&&<p className="text-body text-c-secondary">Accepted by {p.payload.proposal.payerAcceptance.by} · {fmtDate(p.payload.proposal.payerAcceptance.on)}</p>}
    <p className="text-body text-c-ink">{p.payload.proposal.reason}</p>
    {p.decidedAt&&<p className="text-meta text-c-secondary">{p.decidedByName??"Staff identity not recorded"} · {fmtDate(p.decidedAt,{time:true})} · {p.decisionReason??"Decision recorded"}</p>}
    {p.payload.proposal.evidence.map((path,i)=>{const file=files.data?.evidence.find(e=>e.path===path);return file?.url?<a key={path} href={file.url} target="_blank" rel="noreferrer" className="block text-body text-kit-blue-11">Case evidence {i+1}</a>:<p key={path} className="text-body text-c-secondary">Case evidence {i+1} could not be loaded.</p>;})}
    {!!p.payload.proposal.affectedUnits?.length&&<p className="text-body text-c-secondary">{p.payload.proposal.affectedUnits.map(id=>read.data?.units.find(u=>u.id===id)?.code??"Unit identity not recorded").join(" · ")}</p>}
    {!p.scopeCurrent&&<p role="status" className="text-body text-c-secondary">The Case or requested goods changed. Prepare a new proposal.</p>}
    {p.status==="pending"&&read.data?.canDecide&&<div className="space-y-2">
     <Textarea id={`case-decision-${p.id}`} label="Decision reason" value={decisionReasons[p.id]??""} onChange={e=>setDecisionReasons({...decisionReasons,[p.id]:e.target.value})} disabled={locked}/>
     <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={locked||!p.scopeCurrent||p.payload.proposal.evidence.some(path=>!files.data?.evidence.some(e=>e.path===path&&e.url))} loading={decide.isPending} onClick={()=>decide.mutate({approvalId:p.id,status:"approved",reason:decisionReasons[p.id]??""})}>Approve</Button><Button disabled={locked||!(decisionReasons[p.id]??"").trim()||!p.scopeCurrent} onClick={()=>decide.mutate({approvalId:p.id,status:"rejected",reason:decisionReasons[p.id]??""})}>Refuse</Button></div>
    </div>}
   </div>)}
   {!read.data.requests.length?<p className="text-body text-c-secondary">Create the linked <Link to="/operation?tab=manual-purchase" className="text-kit-blue-11">Manual Purchase Request</Link> before preparing its remedy proposal.</p>:read.data.canPropose&&!editing?<Button disabled={locked} onClick={()=>setEditing(true)}>Prepare remedy proposal</Button>:null}
   {editing&&<div className="space-y-3">
    <Select id="case-remedy-request" label="Manual Purchase Request" value={requestId||undefined} onValueChange={setRequestId} options={read.data.requests.map(r=>({value:r.id,label:r.number??"Not recorded"}))} disabled={locked}/>
    {request?.context.lines.map(l=><p key={l.id} className="text-body text-c-ink">{l.sku} · {l.qty}</p>)}
    <Input id="case-remedy-policy" label="Policy" value={policy} onChange={e=>setPolicy(e.target.value)} disabled={locked}/>
    <Input id="case-remedy-policy-version" label="Policy version" value={policyVersion} onChange={e=>setPolicyVersion(e.target.value)} disabled={locked}/>
    <Select id="case-remedy-policy-result" label="Policy result" value={policyResult||undefined} onValueChange={setPolicyResult} options={[{value:"eligible",label:"Eligible"},{value:"not_eligible",label:"Not eligible"}]} disabled={locked}/>
    <Select id="case-remedy-choice" label="Remedy" value={remedy||undefined} onValueChange={setRemedy} options={SERVICE_CASE_REMEDIES.filter(x=>policyResult!=="not_eligible"||["paid_service","goodwill_exception"].includes(x.value))} disabled={locked}/>
    <Select id="case-remedy-movement" label="Movement" value={movement||undefined} onValueChange={setMovement} options={SERVICE_CASE_MOVEMENTS} disabled={locked}/>
    <Select id="case-remedy-charge" label="Charge" value={charge||undefined} onValueChange={setCharge} options={[{value:"free",label:"Free"},{value:"charged",label:"Charged"}]} disabled={locked}/>
    {charge==="charged"&&<><Input id="case-remedy-amount" type="number" label="Amount (RM)" value={amount} onChange={e=>setAmount(e.target.value)} disabled={locked}/><Input id="case-remedy-payer" label="Payer" value={payer} onChange={e=>setPayer(e.target.value)} disabled={locked}/><Input id="case-remedy-accepted-by" label="Accepted by" value={acceptedBy} onChange={e=>setAcceptedBy(e.target.value)} disabled={locked}/><DatePicker id="case-remedy-accepted-on" label="Accepted on" value={acceptedOn} onChange={setAcceptedOn} disabled={locked}/><Select id="case-remedy-acceptance-evidence" label="Acceptance evidence" value={acceptanceFile||undefined} onValueChange={setAcceptanceFile} options={read.data.evidence.map((e,i)=>({value:e.path,label:`Case evidence ${i+1}`}))} disabled={locked}/></>}
    <Textarea id="case-remedy-reason" label="Reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={locked}/>
    {read.data.units.map(u=><Checkbox key={u.id} id={`case-remedy-unit-${u.id}`} label={`${u.code??u.sku} · ${u.sku}`} checked={affectedUnits.includes(u.id)} onCheckedChange={on=>setAffectedUnits(toggle(affectedUnits,u.id,on))} disabled={locked}/>)}
    <p className="text-strong text-c-ink">Case evidence</p>
    {read.data.evidence.map((e,i)=><Checkbox key={e.path} id={`case-remedy-evidence-${i}`} label={`Case evidence ${i+1} · ${e.slot.replaceAll("_"," ")}`} checked={evidence.includes(e.path)} onCheckedChange={on=>setEvidence(toggle(evidence,e.path,on))} disabled={locked}/>)}
    {!read.data.evidence.length&&<p className="text-body text-c-secondary">Add the evidence to the existing Case before submitting.</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={locked} onClick={()=>setEditing(false)}>Cancel</Button><Button variant="primary" disabled={locked||!request||!evidence.length} loading={propose.isPending} onClick={sendProposal}>Send for approval</Button></div>
   </div>}
  </div>:null}
  {problem&&<p role="alert" className="text-body text-c-secondary">{problem}</p>}
 </Block>;
}
