import { Link } from "react-router-dom";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import { RECEIVING_UNIT_OUTCOME_LABEL, documentDisplayNumber } from "@carres/shared";
import Button from "@/components/kit/Button";
import DocumentTable from "@/components/kit/DocumentTable";
import { fmtDate } from "@/lib/fmt-date";
import type { ReceivingSessionDetail } from "@/lib/queries";
import { DocSection, Prop } from "./workspace-doc";
import { receivingEventLabel } from "./receiving-event-label";

/** A preserved report is read first. It cannot use the legacy count's post door. */
export default function BlockedReceivingReport({detail,onBack}:{detail:ReceivingSessionDetail;onBack:()=>void}) {
  const receipt=detail.receipt;
  const report=warehouseConfirmationReportFromWire(receipt.raw_report);
  const labels=new Map((detail.reported_source?.lines ?? []).map(line=>[line.id,line.sku]));
  return <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-c-card p-4" data-testid="blocked-receiving-report">
    <Button onClick={onBack}>Receiving</Button>
    <DocSection title="Receiving"><p role="status" className="text-body">Receiving report saved. No GRN created.</p>
      {(receipt.validation_blockers ?? []).map(blocker=><p key={blocker.code} className="text-body text-kit-red-11">{blocker.message}</p>)}
      <Prop label="Count submitted">{fmtDate(receipt.submitted_at,{time:true})} · {receipt.submitted_by_name || "Staff identity not recorded"}</Prop>
      <Prop label="Goods arrived at">{receipt.actual_site_name || "Not recorded"}</Prop>
      <Prop label="Goods Received Date">{report?.goodsReceivedAt ? fmtDate(report.goodsReceivedAt) : report?.goodsReceivedTime ? fmtDate(report.goodsReceivedTime,{time:true}) : "Not recorded"}</Prop>
      <Prop label="Supplier DO No">{report?.doNumber || "Not recorded"}</Prop>
      {detail.reported_source && <Prop label="PO No"><Link className="text-kit-blue-11 hover:underline" to={`/operation/procurement?po=${encodeURIComponent(detail.reported_source.id)}`}>{documentDisplayNumber(detail.reported_source.id)}</Link></Prop>}
    </DocSection>
    {detail.arrival_source && <DocSection title="Document"><Link className="text-kit-blue-11 hover:underline" to={`/operation?tab=arrival-source&arrival=${encodeURIComponent(detail.arrival_source.id)}`}>{documentDisplayNumber(detail.arrival_source.source_no)}</Link></DocSection>}
    <DocSection title="Original">
      {!report ? <p role="alert">Could not be loaded</p> : <>
        <DocumentTable label="Items" columns={[{key:"sku",label:"SKU"},{key:"received",label:"Received Qty",numeric:true},{key:"damaged",label:"Damaged Qty",numeric:true},{key:"wrong",label:"Wrong Item Qty",numeric:true}]}
          rows={(report.lines ?? []).map((line,index)=>({key:String(index),cells:{sku:line.id?labels.get(line.id)||"Not recorded":"Not recorded",received:line.receivedNow??"Not recorded",damaged:line.damagedQty??"Not recorded",wrong:line.wrongItemQty??"Not recorded"}}))}/>
        <DocumentTable label="Unit results" columns={[{key:"unit",label:"Unit ID"},{key:"outcome",label:"Outcome"},{key:"problem",label:"Problem"}]}
          rows={[...(report.arrivalUnits ?? []).map((unit,index)=>({key:`arrival:${index}`,cells:{unit:detail.arrival_source?.units.find(row=>row.stock_item_id===unit.stockItemId)?.unit?.unit_code || "Not recorded",outcome:unit.outcome?RECEIVING_UNIT_OUTCOME_LABEL[unit.outcome]:"Not recorded",problem:unit.issueKind==="damaged"?"Damaged":unit.issueKind==="wrong_item"?"Wrong item":"Not recorded"}})),...(report.lines ?? []).flatMap((line,lineIndex)=>(line.units ?? []).map((unit,index)=>({key:`${lineIndex}:${index}`,cells:{unit:unit.unitCode || "Not recorded",outcome:unit.outcome?RECEIVING_UNIT_OUTCOME_LABEL[unit.outcome]:"Not recorded",problem:unit.issueKind==="damaged"?"Damaged":unit.issueKind==="wrong_item"?"Wrong item":"Not recorded"}})))]}/>
        {(report.extraLines ?? []).length>0 && <DocumentTable label="Extra goods" columns={[{key:"sku",label:"SKU"},{key:"qty",label:"Extra Qty",numeric:true},{key:"note",label:"Note"}]} rows={(report.extraLines ?? []).map((line,index)=>({key:String(index),cells:{sku:line.sku || "Not recorded",qty:line.qty ?? "Not recorded",note:line.note || "Not recorded"}}))}/>}
        {report.note && <Prop label="Note">{report.note}</Prop>}
      </>}
    </DocSection>
    <DocSection title="History"><ul className="space-y-3">{detail.events.map(event=><li key={event.id}><p className="text-body">{receivingEventLabel(event.event)}</p><p className="text-meta text-kit-slate-11">{event.actor_name || "Staff identity not recorded"} · {fmtDate(event.event_at,{time:true})}</p></li>)}</ul></DocSection>
  </div>;
}
