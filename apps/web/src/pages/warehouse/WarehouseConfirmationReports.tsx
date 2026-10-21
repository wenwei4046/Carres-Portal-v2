import ReceivingReportEvidence from "@/components/receiving/ReceivingReportEvidence";
import {ReceivingSourceReservations} from "@/components/receiving/ReceivingSourceReservations";
// design-standard: list-page — existing ListPageShell and DataGrid; no separate rail for own report history.
import { useSearchParams } from "react-router-dom";
import WarehouseUnidentifiedReportModal from "./WarehouseUnidentifiedReportModal";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { documentDisplayNumber, warehouseReceiptStatusLabel, RECEIVING_UNIT_OUTCOME_LABEL, type WarehouseConfirmationResult, type WarehouseIncomingPo, type WarehouseReceiptStatus } from "@carres/shared";
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
import { useWarehouseConfirmationReports, useWarehouseConfirmationSources, useWarehouseConfirmationArrivals, useWarehouseConfirmationHistory, type WarehouseConfirmationReportRow, type WarehouseConfirmationHistoryRow, type WarehouseArrivalSource } from "@/lib/warehouse-confirmation";
import WarehouseConfirmationModal from "./WarehouseConfirmationModal";
import WarehouseArrivalConfirmationModal from "./WarehouseArrivalConfirmationModal";
import WarehousePoCorrectionPicker from "./WarehousePoCorrectionPicker";
import type { WarehouseReportDraft } from "@/lib/warehouse-report-correction";
const PdfPreview = lazy(()=>import("@/components/kit/PdfPreview"));

type ReportEditor = {site:{id:string;name:string};saved:WarehouseReportDraft} & (
  {kind:"po";po:WarehouseIncomingPo}|{kind:"arrival";arrival:WarehouseArrivalSource}
);

export default function WarehouseConfirmationReports() {
  const [params,setParams]=useSearchParams();
  const reporting=params.get("report")==="new";
  const setReporting=(open:boolean)=>setParams(previous=>{const next=new URLSearchParams(previous);if(open)next.set("report","new");else next.delete("report");return next;},{replace:true});
  const query=useWarehouseConfirmationReports(true);
  const sources=useWarehouseConfirmationSources(true);
  const arrivals=useWarehouseConfirmationArrivals(true);
  const [selected,setSelected]=useState<WarehouseConfirmationReportRow|null>(null);
  const [editor,setEditor]=useState<ReportEditor|null>(null);
  const [findingSource,setFindingSource]=useState(false);
  const columns=useMemo<DataGridColumn<WarehouseConfirmationReportRow>[]>(()=>[
    {key:"source",label:"Document",width:180,minWidth:180,accessor:row=>documentDisplayNumber(row.po_id ?? row.source_no ?? warehouseConfirmationReportFromWire(row.raw_report)?.poId ?? "Not recorded"),searchValue:row=>String(row.po_id ?? warehouseConfirmationReportFromWire(row.raw_report)?.poId ?? "")},
    {key:"supplier",label:"Supplier",width:200,minWidth:160,accessor:row=>row.supplier_name ?? "Not recorded"},
    {key:"do",label:"Handover document number",width:180,minWidth:160,accessor:row=>row.do_number ?? warehouseConfirmationReportFromWire(row.raw_report)?.doNumber ?? "Not recorded"},
    {key:"status",label:"Status",width:160,minWidth:140,accessor:row=>row.status==="draft"&&row.raw_report?"Draft":warehouseReceiptStatusLabel(row.status as WarehouseReceiptStatus)},
    {key:"grn",label:"GRN No",width:180,minWidth:180,accessor:row=>row.grn_no ? documentDisplayNumber(row.grn_no) : "Draft, no number yet"},
    {key:"date",label:"Date",width:180,minWidth:160,accessor:row=>fmtDate(row.submitted_at,{time:true})},
  ],[]);
  const parsed=selected ? warehouseConfirmationReportFromWire(selected.raw_report) : null;
  const source=parsed?.poId ? sources.data?.pos.find(po=>po.po_id===parsed.poId) : null;
  const arrival=parsed?.arrivalSourceId?arrivals.data?.sources.find(source=>source.id===parsed.arrivalSourceId):null;
  const result:WarehouseConfirmationResult|null=selected?.status==="draft" && !selected.grn_no && Array.isArray(selected.blockers) && selected.blockers.length ? {id:selected.id,receipt_id:selected.id,status:"draft",grn_no:null,revision:selected.revision,already_saved:true,blockers:selected.blockers} : null;
  const site=sources.data?.warehouse;
  const sameSite=Boolean(site && (!parsed?.actualSiteId || parsed.actualSiteId===site.id));
  const editable=Boolean(selected && parsed && result && selected.save_key && sameSite);
  const closeReport=()=>{setEditor(null);setFindingSource(false);setSelected(null);void query.refetch();};
  const edit=()=>{
    if(!selected?.save_key || !parsed || !result || !site || !sameSite)return;
    const saved={saveKey:selected.save_key,result,report:parsed};
    if(source)setEditor({kind:"po",po:source,site:{...site},saved});
    else if(arrival)setEditor({kind:"arrival",arrival,site:{...site},saved});
  };
  const sourceError=sources.isError?sources.error ?? new Error("source read unavailable"):query.isError?query.error ?? new Error("reports read unavailable"):null;
  return <ListPageShell register title="My receiving" titleRight={<Button disabled={!site || sources.isError || sources.isPending} onClick={()=>setReporting(true)}>Report unidentified delivery</Button>}>
    {reporting && site && !sources.isError && <WarehouseUnidentifiedReportModal site={site} onClose={()=>{setReporting(false);void query.refetch();}}/>}
    {reporting && (sources.isPending ? <p role="status">Loading…</p> : sources.isError || !site ? <div role="alert"><p>Could not be loaded</p><Button onClick={()=>void sources.refetch()}>Try again</Button></div> : null)}
    {query.isPending ? <p role="status">Loading…</p> : query.isError ? <div role="alert"><p>Could not be loaded</p><Button onClick={()=>void query.refetch()}>Try again</Button></div> :
      <DataGrid appearance="reference" rows={query.data.receipts} columns={columns} rowKey={row=>row.id} sessionKey="warehouse-confirmation-reports" storageKey="carres.warehouse.confirmation-reports" searchPlaceholder="Search" emptyMessage="No receiving activity yet." onRowClick={row=>{setSelected(row);setEditor(null);setFindingSource(false);}}/>}
    {selected && editor?.kind==="po" ? <WarehouseConfirmationModal key={selected.id} po={editor.po} site={editor.site} saved={editor.saved} onClose={closeReport}/>
      :selected && editor?.kind==="arrival" ? <WarehouseArrivalConfirmationModal key={selected.id} source={editor.arrival} site={editor.site} saved={editor.saved} onClose={closeReport}/>
      :selected && findingSource ? <WarehousePoCorrectionPicker report={selected} pos={sources.data?.pos??[]} reports={query.data?.receipts??[]} site={site??undefined} loading={sources.isPending||query.isPending} error={sourceError} onRetry={()=>void Promise.all([sources.refetch(),query.refetch()])} onCancel={()=>setFindingSource(false)} onChoose={(po,saved)=>{if(!site)return;setFindingSource(false);setEditor({kind:"po",po,site:{...site},saved});}}/>
      :selected && <Modal open title={selected.grn_no ? documentDisplayNumber(selected.grn_no) : "Receiving"} width="wide" onOpenChange={open=>{if(!open)closeReport();}}
        footer={<><Button onClick={closeReport}>Close</Button>{editable&&!parsed?.arrivalSourceId&&<Button variant={source||arrival?undefined:"primary"} onClick={()=>setFindingSource(true)}>Find PO or CO</Button>}{selected.status==="draft" && (source||arrival) && <Button variant="primary" disabled={!editable || (!source && !arrival) || sources.isError || arrivals.isError} onClick={edit}>Edit</Button>}</>}>
        <p className="text-body">{selected.grn_no ? "Receiving saved" : "Receiving report saved. No GRN created."}</p>
        <Prop label="Document">{documentDisplayNumber(selected.po_id ?? selected.source_no ?? parsed?.poId ?? "Not recorded")}</Prop>
        {(selected.blockers ?? []).map(blocker=><p key={blocker.code} role="status" className="text-body text-kit-red-11">{blocker.message}</p>)}
        {selected.status==="draft" && (sources.isPending||arrivals.isPending) ? <p role="status">Loading…</p> : selected.status==="draft" && (sources.isError||arrivals.isError) ? <div role="alert"><p>Could not be loaded</p><Button onClick={()=>void Promise.all([sources.refetch(),arrivals.refetch()])}>Try again</Button></div> : selected.status==="draft" && ((!source&&!arrival)&&(!editable||parsed?.arrivalSourceId)||!sameSite) ? <p role="alert">Not available. Go back and reload.</p> : null}
        <ReceivingReportEvidence receiptId={selected.id}/><WarehouseReportHistory receiptId={selected.id}/>
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
      <p className="text-body">{event.payload.reason==="Arrival evidence added"?"Arrival evidence added":event.event==="submitted"&&warehouseConfirmationReportFromWire(event.payload.report)&&!warehouseConfirmationReportFromWire(event.payload.report)?.poId&&!warehouseConfirmationReportFromWire(event.payload.report)?.arrivalSourceId?"Receiving report saved. No GRN created.":event.event==="posted"?"Receiving saved":event.event==="resubmitted"?"Count submitted again":event.event==="submitted"?"Count submitted":"Activity"}</p>
      <WarehouseReportSnapshot event={event}/>
      <ReceivingSourceReservations value={event.payload.source_reservations}/>
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
  {report.poId&&<Prop label="Reported PO No">{report.poId}</Prop>}
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
