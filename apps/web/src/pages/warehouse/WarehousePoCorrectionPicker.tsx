// design-standard: not-a-list-page — bounded source choice inside the existing report dialog.
import { useMemo } from "react";
import { documentDisplayNumber, type WarehouseIncomingPo } from "@carres/shared";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { ApiError } from "@/lib/api";
import { prepareWarehousePoCorrection, warehousePoCorrectionCandidates, type WarehouseReportDraft } from "@/lib/warehouse-report-correction";
import type { WarehouseConfirmationReportRow } from "@/lib/warehouse-confirmation";
import { Prop } from "@/pages/operation/components/workspace-doc";

export default function WarehousePoCorrectionPicker({report,pos,reports,site,loading,error,onRetry,onCancel,onChoose}:{
  report:WarehouseConfirmationReportRow;pos:readonly WarehouseIncomingPo[];reports:readonly WarehouseConfirmationReportRow[];
  site?:{id:string;name:string};loading:boolean;error:unknown;onRetry:()=>void;onCancel:()=>void;
  onChoose:(po:WarehouseIncomingPo,saved:WarehouseReportDraft)=>void;
}){
  const candidates=useMemo(()=>site?warehousePoCorrectionCandidates(report,site.id,pos,reports):[],[report,site,pos,reports]);
  const columns:DataGridColumn<WarehouseIncomingPo>[]=[
    {key:"po",label:"PO No",width:180,minWidth:180,accessor:po=>documentDisplayNumber(po.po_id),searchValue:po=>po.po_id},
    {key:"supplier",label:"Supplier",width:180,minWidth:160,accessor:po=>po.supplier_name||"Not recorded"},
    {key:"items",label:"Items",width:260,minWidth:180,accessor:po=>po.lines.map(line=>line.sku).join(" · "),searchValue:po=>po.lines.map(line=>line.sku).join(" ")},
    {key:"action",label:"Receiving",width:180,minWidth:180,accessor:po=><Button onClick={()=>{if(!site)return;const saved=prepareWarehousePoCorrection(report,po,site.id);if(saved)onChoose(po,saved);}}>Count this delivery</Button>},
  ];
  const denied=error instanceof ApiError && [401,403].includes(error.status);
  const unavailable=error instanceof ApiError && error.status===503 && (error.body as {code?:string}|null)?.code==="receiving_confirmation_unavailable";
  return <Modal open title="Find PO or CO" width="wide" onOpenChange={open=>{if(!open)onCancel();}} footer={<Button onClick={onCancel}>Cancel</Button>}>
    <p className="text-body mb-3">The original report stays in History. Check the goods again for the selected PO or CO.</p>
    <Prop label="Goods arrived at">{site?.name||"Not recorded"}</Prop>
    {loading?<p role="status">Loading…</p>:error?<div role="alert"><p>{denied?"Not available. Go back and reload.":unavailable?"Not available yet":"Could not be loaded"}</p>{!denied&&!unavailable&&<Button onClick={onRetry}>Try again</Button>}</div>:<DataGrid appearance="reference" rows={candidates} columns={columns} rowKey={po=>po.po_id} sessionKey={`warehouse-report-source-correction:${report.id}`} storageKey="carres.warehouse.report-source-correction" searchPlaceholder="Search" emptyMessage="Not available. Go back and reload."/>}
  </Modal>;
}
