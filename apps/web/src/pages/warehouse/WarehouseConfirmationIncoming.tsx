// design-standard: list-page — one scoped Incoming register using the shared kit.
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ARRIVAL_SOURCE_TYPES, documentDisplayNumber, type WarehouseIncomingPo, type WarehouseConfirmationResult } from "@carres/shared";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ListPageShell from "@/components/ListPageShell";
import Button from "@/components/kit/Button";
import { fmtDate } from "@/lib/fmt-date";
import { useWarehouseConfirmationSources, useWarehouseConfirmationArrivals, useWarehouseConfirmationReports, type WarehouseArrivalSource, type WarehouseConfirmationReportRow } from "@/lib/warehouse-confirmation";
import WarehouseConfirmationModal from "./WarehouseConfirmationModal";
import WarehouseArrivalConfirmationModal from "./WarehouseArrivalConfirmationModal";
type Row={id:string;reference:string;kind:string;from:string|null;supplier:string|null;items:string;date:string|null;po?:WarehouseIncomingPo;arrival?:WarehouseArrivalSource;draft?:WarehouseConfirmationReportRow;ambiguous:boolean};
export default function WarehouseConfirmationIncoming(){
 const pos=useWarehouseConfirmationSources(true),arrivals=useWarehouseConfirmationArrivals(true),reports=useWarehouseConfirmationReports(true);
 const navigate=useNavigate();
 const [selected,setSelected]=useState<Row|null>(null);
 const rows=useMemo<Row[]>(()=>{
  const draftFor=(kind:'po'|'arrival',id:string)=>(reports.data?.receipts??[]).filter(row=>{const raw=row.raw_report&&typeof row.raw_report==='object'&&!Array.isArray(row.raw_report)?row.raw_report as Record<string,unknown>:null;return row.status==='draft' && (kind==='po'?raw?.po_id===id:raw?.arrival_source_id===id);});
  return [...(pos.data?.pos??[]).map(po=>{const drafts=draftFor('po',po.po_id);return {id:`po:${po.po_id}`,reference:po.po_id,kind:'PO No',from:null,supplier:po.supplier_name,items:po.lines.map(line=>line.sku).join(' · '),date:po.eta_date,po,draft:drafts.length===1?drafts[0]:undefined,ambiguous:drafts.length>1};}),
   ...(arrivals.data?.sources??[]).map(arrival=>{const drafts=draftFor('arrival',arrival.id);return {id:`arrival:${arrival.id}`,reference:arrival.source_no,kind:ARRIVAL_SOURCE_TYPES.find(([key])=>key===arrival.kind)?.[1]??'Not recorded',from:arrival.from_site_name,supplier:null,items:arrival.units.map(unit=>unit.unit_code).join(' · '),date:arrival.expected_date,arrival,draft:drafts.length===1?drafts[0]:undefined,ambiguous:drafts.length>1};})];
 },[pos.data,arrivals.data,reports.data]);
 const open=useCallback((row:Row)=>{if(row.ambiguous || (row.draft && (!row.draft.save_key || !warehouseConfirmationReportFromWire(row.draft.raw_report)))){navigate('/warehouse/receipts');return;}setSelected(row);},[navigate]);
 const columns=useMemo<DataGridColumn<Row>[]>(()=>[
  {key:'document',label:'Document',width:190,minWidth:180,accessor:row=><><span>{documentDisplayNumber(row.reference)}</span><span className="block text-meta text-kit-slate-11">{row.kind}</span></>,searchValue:row=>`${row.reference} ${row.kind}`},
  {key:'supplier',label:'Supplier',width:180,minWidth:160,accessor:row=>row.supplier??'Not recorded'},
  {key:'from',label:'From',width:180,minWidth:160,accessor:row=>row.from??'Origin not recorded'},
  {key:'items',label:'Items',width:260,minWidth:180,accessor:row=>row.items,searchValue:row=>row.items},
  {key:'date',label:'Expected arrival',width:180,minWidth:160,sortable:true,sortFn:(a,b)=>(a.date??'9999').localeCompare(b.date??'9999'),accessor:row=>row.date?fmtDate(row.date):'Not recorded'},
  {key:'action',label:'Receiving',width:180,minWidth:180,accessor:row=>row.po?.open_receipt_id?'Waiting Carres check':<Button onClick={()=>open(row)}>{row.ambiguous?'My receiving':row.draft?'Edit':'Count this delivery'}</Button>},
 ],[open]);
 const loading=pos.isPending||arrivals.isPending||reports.isPending,error=pos.isError||arrivals.isError||reports.isError;
 const raw=selected?.draft?warehouseConfirmationReportFromWire(selected.draft.raw_report):null;
 const saved=selected?.draft&&raw&&selected.draft.save_key?{saveKey:selected.draft.save_key,report:raw,result:{id:selected.draft.id,receipt_id:selected.draft.id,status:'draft',grn_no:null,revision:selected.draft.revision,already_saved:true,blockers:selected.draft.blockers} as WarehouseConfirmationResult}:undefined;
 return <ListPageShell register title="Incoming" titleRight={<><span>{pos.data?.warehouse?.name}</span><Button onClick={()=>navigate("/warehouse/receipts?report=new")}>Report unidentified delivery</Button></>}>
  {error?<div role="alert"><p>Could not be loaded</p><Button onClick={()=>void Promise.all([pos.refetch(),arrivals.refetch(),reports.refetch()])}>Try again</Button></div>:loading?<p role="status">Loading…</p>:<DataGrid appearance="reference" rows={rows} columns={columns} rowKey={row=>row.id} sessionKey="warehouse-confirmation-incoming" storageKey="carres.warehouse.confirmation-incoming" searchPlaceholder="Search" sortDefault={{key:'date',dir:'asc'}}/>}
  {selected?.po&&<WarehouseConfirmationModal po={selected.po} site={pos.data?.warehouse??undefined} saved={saved} onClose={()=>setSelected(null)}/>}
  {selected?.arrival&&<WarehouseArrivalConfirmationModal source={selected.arrival} site={pos.data?.warehouse??undefined} saved={saved} onClose={()=>setSelected(null)}/>}
 </ListPageShell>;
}
