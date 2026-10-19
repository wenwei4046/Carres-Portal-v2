// design-standard: list-page — existing ListPageShell and DataGrid; no separate rail for own report history.
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { documentDisplayNumber, warehouseReceiptStatusLabel, RECEIVING_UNIT_OUTCOME_LABEL, type WarehouseConfirmationResult, type WarehouseReceiptStatus } from "@carres/shared";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ListPageShell from "@/components/ListPageShell";
import DocumentTable from "@/components/kit/DocumentTable";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import { DocSection, Prop } from "@/pages/operation/components/workspace-doc";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useWarehouseConfirmationReports, useWarehouseConfirmationSources, useWarehouseConfirmationArrivals, useWarehouseConfirmationHistory, type WarehouseConfirmationReportRow, type WarehouseConfirmationHistoryRow } from "@/lib/warehouse-confirmation";
import WarehouseConfirmationModal from "./WarehouseConfirmationModal";
import WarehouseArrivalConfirmationModal from "./WarehouseArrivalConfirmationModal";
const PdfPreview = lazy(()=>import("@/components/kit/PdfPreview"));

export default function WarehouseConfirmationReports() {
  const query=useWarehouseConfirmationReports(true);
  const sources=useWarehouseConfirmationSources(true);
  const arrivals=useWarehouseConfirmationArrivals(true);
  const [selected,setSelected]=useState<WarehouseConfirmationReportRow|null>(null);
  const [editing,setEditing]=useState(false);
  const columns=useMemo<DataGridColumn<WarehouseConfirmationReportRow>[]>(()=>[
    {key:"source",label:"Document",width:180,minWidth:180,accessor:row=>documentDisplayNumber(row.po_id ?? row.source_no ?? warehouseConfirmationReportFromWire(row.raw_report)?.poId ?? "Not recorded"),searchValue:row=>String(row.po_id ?? warehouseConfirmationReportFromWire(row.raw_report)?.poId ?? "")},
    {key:"supplier",label:"Supplier",width:200,minWidth:160,accessor:row=>row.supplier_name ?? "Not recorded"},
    {key:"do",label:"Handover document number",width:180,minWidth:160,accessor:row=>row.do_number ?? warehouseConfirmationReportFromWire(row.raw_report)?.doNumber ?? "Not recorded"},
    {key:"status",label:"Status",width:160,minWidth:140,accessor:row=>warehouseReceiptStatusLabel(row.status as WarehouseReceiptStatus)},
    {key:"grn",label:"GRN No",width:180,minWidth:180,accessor:row=>row.grn_no ? documentDisplayNumber(row.grn_no) : "Draft, no number yet"},
    {key:"date",label:"Date",width:180,minWidth:160,accessor:row=>fmtDate(row.submitted_at,{time:true})},
  ],[]);
  const parsed=selected ? warehouseConfirmationReportFromWire(selected.raw_report) : null;
  const source=parsed?.poId ? sources.data?.pos.find(po=>po.po_id===parsed.poId) : null;
  const arrival=parsed?.arrivalSourceId?arrivals.data?.sources.find(source=>source.id===parsed.arrivalSourceId):null;
  const result:WarehouseConfirmationResult|null=selected?.status==="draft" && Array.isArray(selected.blockers) && selected.blockers.length ? {id:selected.id,receipt_id:selected.id,status:"draft",grn_no:null,revision:selected.revision,already_saved:true,blockers:selected.blockers} : null;
  return <ListPageShell register title="My receiving">
    {query.isPending ? <p role="status">Loading…</p> : query.isError ? <div role="alert"><p>Could not be loaded</p><Button onClick={()=>void query.refetch()}>Try again</Button></div> :
      <DataGrid appearance="reference" rows={query.data.receipts} columns={columns} rowKey={row=>row.id} sessionKey="warehouse-confirmation-reports" storageKey="carres.warehouse.confirmation-reports" searchPlaceholder="Search" emptyMessage="No receiving activity yet." onRowClick={row=>{setSelected(row);setEditing(false);}}/>}
    {selected && editing && parsed && source && result && selected.save_key ? <WarehouseConfirmationModal key={selected.id} po={source} site={sources.data?.warehouse ?? undefined} saved={{saveKey:selected.save_key,result,report:parsed}} onClose={()=>{setEditing(false);setSelected(null);void query.refetch();}}/> : selected && editing && parsed && arrival && result && selected.save_key ? <WarehouseArrivalConfirmationModal key={selected.id} source={arrival} site={sources.data?.warehouse??undefined} saved={{saveKey:selected.save_key,result,report:parsed}} onClose={()=>{setEditing(false);setSelected(null);void query.refetch();}}/> : selected && <Modal open title={selected.grn_no ? documentDisplayNumber(selected.grn_no) : "Receiving"} width="wide" onOpenChange={open=>{if(!open)setSelected(null);}}
      footer={<><Button onClick={()=>setSelected(null)}>Close</Button>{selected.status==="draft" && <Button variant="primary" disabled={(!source && !arrival) || !parsed || !result || !selected.save_key || sources.isError || arrivals.isError} onClick={()=>setEditing(true)}>Edit</Button>}</>}>
      <p className="text-body">{selected.grn_no ? "Receiving saved" : "Receiving report saved. No GRN created."}</p>
      <Prop label="Document">{documentDisplayNumber(selected.po_id ?? selected.source_no ?? parsed?.poId ?? "Not recorded")}</Prop>
      {(selected.blockers ?? []).map(blocker=><p key={blocker.code} role="status" className="text-body text-kit-red-11">{blocker.message}</p>)}
      {selected.status==="draft" && ((!source && !arrival) || sources.isError || arrivals.isError) && <div role="alert"><p>{sources.isError ? "Could not be loaded" : "Not available. Go back and reload."}</p><Button onClick={()=>void sources.refetch()}>Try again</Button></div>}
      <WarehouseReportHistory receiptId={selected.id}/>
    </Modal>}
  </ListPageShell>;
}

function WarehouseReportHistory({receiptId}:{receiptId:string}) {
  const query=useWarehouseConfirmationHistory(receiptId);
  const [active,setActive]=useState<{eventId:string;path:string;kind:"photo"|"video"|"pdf";context:string}|null>(null);
  const [url,setUrl]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const signing=useRef(0);
  const closeEvidence=()=>{signing.current++;setActive(null);setLoading(false);};
  const sign=async(file:NonNullable<typeof active>)=>{
    const request=++signing.current;
    setActive(file);setUrl(null);setLoading(true);
    try {const response=await apiFetch<{url:string}>(`/api/warehouse/confirmation/receipts/${receiptId}/history/${file.eventId}/evidence?path=${encodeURIComponent(file.path)}`);if(signing.current===request)setUrl(response.url);return response.url;}catch{return null;}finally{if(signing.current===request)setLoading(false);}
  };
  if(query.isPending)return <DocSection title="History"><p role="status">Loading…</p></DocSection>;
  if(query.isError)return <DocSection title="History"><p role="alert">Could not be loaded</p><Button onClick={()=>void query.refetch()}>Try again</Button></DocSection>;
  const filesOf=(event:WarehouseConfirmationHistoryRow)=>{
    const report=warehouseConfirmationReportFromWire(event.payload.report);
    if(!report)return [];
    const files:Array<{path:string;kind:"photo"|"video"|"pdf"}>=[];
    const add=(path:string,kind:"photo"|"video"="photo")=>{if(!files.some(file=>file.path===path))files.push({path,kind:/\.pdf$/i.test(path)?"pdf":kind});};
    if(report.doFilePath)add(report.doFilePath);
    for(const file of report.arrivalEvidence ?? [])add(file.path,file.kind);
    for(const line of report.lines ?? [])for(const photo of [...line.damagedPhotos ?? [],...line.wrongItemPhotos ?? []])add(typeof photo==="string"?photo:photo.path);
    return files;
  };
  return <DocSection title="History">
    <ul className="space-y-3">{query.data.events.map(event=><li key={event.id}>
      <p className="text-meta text-kit-slate-11">{fmtDate(event.event_at,{time:true})} · {event.actor_name || "Staff identity not recorded"}</p>
      <p className="text-body">{event.event==="posted"?"Receiving saved":event.event==="resubmitted"?"Count submitted again":event.event==="submitted"?"Count submitted":"Activity"}</p>
      <WarehouseReportSnapshot event={event}/>
      {filesOf(event).map((file,index)=><Button key={file.path} size="sm" onClick={()=>void sign({...file,eventId:event.id,context:fmtDate(event.event_at,{time:true})})}>View proof {index+1}</Button>)}
    </li>)}</ul>
    {active?.kind==="pdf" ? <Modal open title="Evidence" width="viewer" onOpenChange={open=>{if(!open)closeEvidence();}}>
      {loading?<p role="status">Loading…</p>:url?<Suspense fallback={<p>Loading…</p>}><PdfPreview src={url} title="Evidence"/></Suspense>:<p role="alert">Could not be loaded</p>}
      <Button onClick={()=>void sign(active)}>Try again</Button>
    </Modal> : active && loading ? <Modal open title="Evidence" onOpenChange={open=>{if(!open)closeEvidence();}}><p role="status">Loading…</p></Modal> : active && <SavedEvidenceViewer activeId={active.path} onClose={closeEvidence} files={[{id:active.path,kind:active.kind,url,context:active.context}]} onRetry={()=>sign(active)}/>}
  </DocSection>;
}

/** Show the recorded revision, with labels supplied by the scoped history reader.
 * A later source or tally never replaces an earlier physical observation. */
export function WarehouseReportSnapshot({event}:{event:WarehouseConfirmationHistoryRow}){
 const report=warehouseConfirmationReportFromWire(event.payload.report);
 if(!report)return null;
 const outcome=(value:string|null|undefined)=>value&&value in RECEIVING_UNIT_OUTCOME_LABEL?RECEIVING_UNIT_OUTCOME_LABEL[value as keyof typeof RECEIVING_UNIT_OUTCOME_LABEL]:"Not recorded";
 const unitRows=[...(report.lines??[]).flatMap((line,l)=>(line.units??[]).map((unit,u)=>({key:`po:${l}:${u}`,cells:{unit:unit.unitCode||"Not recorded",outcome:outcome(unit.outcome),problem:unit.issueKind==="damaged"?"Damaged":unit.issueKind==="wrong_item"?"Wrong item":"Not recorded"}}))),
  ...(report.arrivalUnits??[]).map((unit,i)=>({key:`arrival:${i}`,cells:{unit:unit.stockItemId?event.unit_labels?.[unit.stockItemId]??"Not recorded":"Not recorded",outcome:outcome(unit.outcome),problem:unit.issueKind==="damaged"?"Damaged":unit.issueKind==="wrong_item"?"Wrong item":"Not recorded"}}))];
 return <div className="my-3">
  <Prop label="Goods Received Date">{report.goodsReceivedTime?fmtDate(report.goodsReceivedTime,{time:true}):report.goodsReceivedAt?fmtDate(report.goodsReceivedAt):"Not recorded"}</Prop>
  {!report.goodsReceivedTime&&<Prop label="Time">{report.goodsReceivedClock||"Not recorded"}</Prop>}
  <Prop label="Handover document number">{report.doNumber||"Not recorded"}</Prop>
  {report.handoverPerson&&<Prop label="Handover person">{report.handoverPerson}</Prop>}
  {(report.lines??[]).length>0&&<DocumentTable label="Recorded quantities" columns={[{key:"sku",label:"SKU"},{key:"received",label:"Received Qty",numeric:true},{key:"damaged",label:"Damaged Qty",numeric:true},{key:"wrong",label:"Wrong Item Qty",numeric:true}]} rows={(report.lines??[]).map((line,index)=>({key:String(index),cells:{sku:line.id?event.line_labels?.[line.id]??"Not recorded":"Not recorded",received:line.receivedNow??"Not recorded",damaged:line.damagedQty??"Not recorded",wrong:line.wrongItemQty??"Not recorded"}}))}/>}
  {unitRows.length>0&&<DocumentTable label="Recorded Unit results" columns={[{key:"unit",label:"Unit ID"},{key:"outcome",label:"Outcome"},{key:"problem",label:"Problem"}]} rows={unitRows}/>}
  {(report.extraLines??[]).length>0&&<DocumentTable label="Recorded Extra" columns={[{key:"sku",label:"SKU"},{key:"qty",label:"Extra Qty",numeric:true},{key:"note",label:"Note"}]} rows={(report.extraLines??[]).map((extra,index)=>({key:String(index),cells:{sku:extra.sku||"Not recorded",qty:extra.qty??"Not recorded",note:extra.note||"Not recorded"}}))}/>}
  {report.note&&<Prop label="Note">{report.note}</Prop>}
 </div>;
}
