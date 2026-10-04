import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { documentDisplayNumber, RECEIVING_UNIT_OUTCOME_LABEL } from "@carres/shared";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import DocumentTable from "@/components/kit/DocumentTable";
import SavedEvidenceViewer, {type SavedEvidenceFile} from "@/components/kit/SavedEvidenceViewer";
import { receivingEventLabel } from "@/pages/operation/components/receiving-event-label";
import type { ReceivingEvent } from "@/lib/queries";

export type ReceivingReportEvent = ReceivingEvent;

/** Read-only composition of the shared modal, document table and history grammar. */
export default function ReceivingReportHistory({receiptId,onClose,events,initialEventId=null,evidenceBasePath=`/api/warehouse/receipts/${receiptId}`}:{receiptId:string;onClose:()=>void;events?:ReceivingReportEvent[];initialEventId?:string|null;evidenceBasePath?:string}) {
  const [selected,setSelected]=useState<string|null>(initialEventId);
  const query=useQuery({queryKey:["warehouse-portal","receipt-history",receiptId],
    enabled:events===undefined,queryFn:()=>apiFetch<{events:ReceivingReportEvent[]}>(`/api/warehouse/receipts/${receiptId}/history`)});
  const history=events ?? query.data?.events;
  const event=history?.find(e=>e.id===selected);
  const report=warehouseConfirmationReportFromWire(event?.payload.report);
  const [activeEvidence,setActiveEvidence]=useState<string|null>(null);
  const [evidenceUrls,setEvidenceUrls]=useState<Record<string,string|null>>({});
  const evidenceUrl=async(path:string)=>{
    if(!selected) return null;
    const result=await apiFetch<{url:string}>(`${evidenceBasePath}/history/${selected}/evidence?path=${encodeURIComponent(path)}`);
    return result.url;
  };
  const proof=useQuery({queryKey:["receiving-report-proof",evidenceBasePath,selected,report?.doFilePath],
    enabled:Boolean(selected && report?.doFilePath),retry:false,queryFn:()=>evidenceUrl(report!.doFilePath!)});
  const evidence: SavedEvidenceFile[]=[];
  const addEvidence=(path:string,kind:"photo"|"video",unitCode?:string)=>{
    const existing=evidence.find(file=>file.id===path);
    if(existing){if(unitCode)existing.unitCodes=[...new Set([...(existing.unitCodes ?? []),unitCode])];return;}
    evidence.push({id:path,kind,loadOnOpen:true,url:evidenceUrls[`${selected}:${path}`] ?? null,
      context:`${documentDisplayNumber(report?.poId ?? "") || "Receiving"} · ${fmtDate(event?.event_at,{time:true})}`,
      ...(unitCode?{unitCodes:[unitCode]}:{})});
  };
  for(const file of report?.arrivalEvidence ?? []) addEvidence(file.path,file.kind);
  for(const line of report?.lines ?? []) for(const file of [...(line.damagedPhotos ?? []),...(line.wrongItemPhotos ?? [])])
    addEvidence(typeof file==="string"?file:file.path,"photo",typeof file==="string"?undefined:file.unitCode);
  const loadEvidence=async(path:string)=>{
    try{const url=await evidenceUrl(path);setEvidenceUrls(previous=>({...previous,[`${selected}:${path}`]:url}));return url;}
    catch{setEvidenceUrls(previous=>({...previous,[`${selected}:${path}`]:null}));return null;}
  };
  const facts=report ? [
    ...(report.poId ? [["PO No",documentDisplayNumber(report.poId)]] : []),
    ["Document No",report.doNumber || "Not recorded"],
    ["Goods Received Date",fmtDate(report.goodsReceivedTime ?? report.goodsReceivedAt) || "Not recorded"],
    ["Time",report.goodsReceivedTime ? fmtDate(report.goodsReceivedTime,{timeOnly:true}) : "Time not recorded"],
    ["Handover person",report.handoverPerson || "Not recorded"],
    ["Note",report.note || "Not recorded"],
  ] : [];
  const unitRows=report ? [
    ...(report.lines ?? []).flatMap(l=>(l.units ?? []).map(u=>({key:`${l.id}:${u.unitCode}`,cells:{unit:u.unitCode,result:RECEIVING_UNIT_OUTCOME_LABEL[u.outcome],problem:u.issueKind==="damaged"?"Damaged":u.issueKind==="wrong_item"?"Wrong item":"",note:u.note ?? ""}}))),
    ...(report.arrivalUnits ?? []).map(u=>({key:u.stockItemId,cells:{unit:event?.unit_labels?.[u.stockItemId] ?? "Not recorded",result:RECEIVING_UNIT_OUTCOME_LABEL[u.outcome],problem:u.issueKind==="damaged"?"Damaged":u.issueKind==="wrong_item"?"Wrong item":"",note:u.note ?? ""}})),
  ] : [];
  return <><Modal open title="History" width="wide" onOpenChange={open=>{if(!open)onClose();}}
    footer={selected ? <Button onClick={()=>setSelected(null)}>History</Button> : undefined}>
    {events===undefined && query.isLoading ? <p role="status">Loading…</p> : events===undefined && query.isError ? <div role="alert">Could not be loaded <Button onClick={()=>void query.refetch()}>Try again</Button></div>
      : selected ? !report ? <p role="alert">Not available. Go back and reload.</p> : <div className="min-w-0 space-y-3">
        <p className="text-body font-semibold text-kit-slate-12">{event ? receivingEventLabel(event.event) : "History"}</p>
        <p className="text-meta text-kit-slate-11">{event?.actor_name ?? "Staff identity not recorded"} · {fmtDate(event?.event_at,{time:true})}</p>
        <dl className="grid grid-cols-2 gap-2 text-body">{facts.map(([label,value])=><div key={label} className="min-w-0"><dt className="text-meta text-kit-slate-11">{label}</dt><dd className="break-words text-kit-slate-12">{value}</dd></div>)}</dl>
        {unitRows.length>0 && <DocumentTable label="Units" columns={[{key:"unit",label:"Unit ID"},{key:"result",label:"Receiving"},{key:"problem",label:"Problem"},{key:"note",label:"Note"}]} rows={unitRows}/>}
        {(report.lines ?? []).some(l=>!l.units?.length) && <DocumentTable label="Items" columns={[{key:"sku",label:"SKU"},{key:"received",label:"Received Qty",numeric:true},{key:"damaged",label:"Damaged Qty",numeric:true},{key:"wrong",label:"Wrong Item Qty",numeric:true}]}
          rows={(report.lines ?? []).filter(l=>!l.units?.length).map((l,i)=>({key:l.id ?? String(i),cells:{sku:l.id ? event?.line_labels?.[l.id] ?? "Not recorded" : "Not recorded",received:l.receivedNow ?? "Not recorded",damaged:l.damagedQty ?? "Not recorded",wrong:l.wrongItemQty ?? "Not recorded"}}))}/>}
        {!!report.extraLines?.length && <DocumentTable label="Extra goods" columns={[{key:"sku",label:"SKU"},{key:"qty",label:"Qty",numeric:true},{key:"note",label:"Note"}]} rows={report.extraLines.map((l,i)=>({key:String(i),cells:{sku:l.sku,qty:l.qty,note:l.note ?? ""}}))}/>}
        {report.doFilePath && <div>{proof.isLoading ? <p role="status">Loading…</p>
          : proof.data ? <a href={proof.data} target="_blank" rel="noopener noreferrer" className="text-body text-kit-blue-11">View handover proof</a>
          : <div role="alert">Evidence could not be loaded <Button onClick={()=>void proof.refetch()}>Try again</Button></div>}</div>}
        {evidence.length>0 && <div className="flex flex-wrap gap-2">{evidence.map((file,index)=><Button key={file.id} onClick={()=>setActiveEvidence(file.id)}>{file.kind==="photo"?"Photo":"Video"} {index+1}</Button>)}</div>}
      </div> : !history?.length ? <p>No receiving activity yet.</p> : <ul className="space-y-3">{history.map(e=><li key={e.id}>
        <p className="text-body font-semibold text-kit-slate-12">{receivingEventLabel(e.event)}</p>
        <p className="text-meta text-kit-slate-11">{e.actor_name ?? "Staff identity not recorded"} · {fmtDate(e.event_at,{time:true})}</p>
        {e.payload.reason && <p className="text-label text-kit-slate-11">{e.payload.reason}</p>}
        {e.payload.report != null && <Button onClick={()=>setSelected(e.id)}>View</Button>}
      </li>)}</ul>}
  </Modal><SavedEvidenceViewer files={evidence} activeId={activeEvidence} onClose={()=>setActiveEvidence(null)} onRetry={loadEvidence}/></>;
}
