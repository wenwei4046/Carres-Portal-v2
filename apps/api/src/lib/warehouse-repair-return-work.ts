/** Internal receipt consequence only. No Warehouse RO read endpoint or role impersonation. */
import type { Context } from "hono";
import {
  projectRepairOrderReturnWork, repairOrderReturnReceiptResult, REPAIR_ORDER_WORK_RULE,
  type RepairOrderReturnWorkSource,
} from "@carres/shared";
import type { AppEnv } from "../types";
import { adminClient, userClient } from "./supabase";
import { readAllPages } from "./route-helpers";
import { todayIsoMYT } from "./today";
import { withWorkCompletion, workCompletionDeps, type WorkCompletionSpec } from "./work-completion";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type RepairReturnFacts = Omit<RepairOrderReturnWorkSource,"units"> & {
  units: Array<{unit_id:string;goods_received_date:string|null;grn_no:string|null}>;
  receipts: Array<{id:string;arrival_source_id:string;posted_by:string;posted_at:string;grn_no:string|null}>;
  acceptedReceiptIds: string[];
  completionReceiptIds: string[];
};

/** All rows are server-only, scoped first by the caller's source permission. */
export async function readWarehouseRepairReturn(c: Context<AppEnv>, sourceId: string): Promise<RepairReturnFacts|null> {
  if(c.var.auth.role!=="warehouse" || !/^[0-9a-f-]{36}$/i.test(sourceId)) return null;
  const allowed=await userClient(c.env,c.var.auth.jwt).rpc("warehouse_arrival_proof_allowed",{
    p_source_id:sourceId,p_require_open:false,
  });
  if(allowed.error) throw new Error("Warehouse source authority unavailable");
  if(allowed.data!==true) return null;
  const sb=adminClient(c.env);
  const source=await sb.from("arrival_sources").select("repair_order_id,kind,cancelled_at").eq("id",sourceId).maybeSingle();
  if(source.error) throw new Error("Repair source unavailable");
  if(source.data?.kind!=="repair-return" || source.data.cancelled_at || !source.data.repair_order_id) return null;
  const roId=source.data.repair_order_id as string;
  const ro=await sb.from("repair_orders").select("id,ro_no,supplier_id,supplier_received_at,return_target_date,cancelled_at").eq("id",roId).maybeSingle();
  if(ro.error || !ro.data) throw new Error("Repair return facts unavailable");
  const all=async(query:Parameters<typeof readAllPages>[0])=>{
    const result=await readAllPages<Row>(query);
    if(!("rows" in result)) throw new Error("Repair return read incomplete");
    return result.rows;
  };
  const [units,sources,supplier]=await Promise.all([
    all((from,to)=>sb.from("repair_order_units").select("stock_item_id,unit_code").eq("repair_order_id",roId).is("removed_at",null).order("id").range(from,to)),
    all((from,to)=>sb.from("arrival_sources").select("id").eq("repair_order_id",roId).eq("kind","repair-return").is("cancelled_at",null).order("id").range(from,to)),
    sb.from("suppliers").select("name").eq("id",ro.data.supplier_id).maybeSingle(),
  ]);
  if(supplier.error) throw new Error("Repair supplier name unavailable");
  const receipts:Row[]=[];
  for(let i=0;i<sources.length;i+=100) receipts.push(...await all((from,to)=>sb.from("warehouse_receipts")
    .select("id,arrival_source_id,grn_no,goods_received_at,posted_by,posted_at")
    .in("arrival_source_id",sources.slice(i,i+100).map(row=>row.id)).eq("status","posted").order("id").range(from,to)));
  const results:Row[]=[];
  for(let i=0;i<receipts.length;i+=100) results.push(...await all((from,to)=>sb.from("receiving_unit_results")
    .select("receipt_id,stock_item_id").in("receipt_id",receipts.slice(i,i+100).map(row=>row.id))
    .in("outcome",["received","received_with_issue"]).order("id").range(from,to)));
  const completionEvents:Row[]=[];
  for(let i=0;i<receipts.length;i+=100) completionEvents.push(...await all((from,to)=>sb.from("receiving_events")
    .select("receipt_id,completed_ro:payload->>repair_return_completed_ro")
    .in("receipt_id",receipts.slice(i,i+100).map(row=>row.id)).eq("event","posted").order("id").range(from,to)));
  const receiptById=new Map(receipts.map(row=>[row.id,row]));
  const required=new Set(units.map(unit=>unit.stock_item_id));
  const returned=new Map<string,Row>();
  const accepted=new Set<string>();
  for(const result of results){
    const receipt=receiptById.get(result.receipt_id);
    if(!receipt || !required.has(result.stock_item_id)) continue;
    returned.set(result.stock_item_id,receipt);accepted.add(receipt.id);
  }
  return {id:roId,ro_no:ro.data.ro_no,supplier_name:supplier.data?.name ?? null,
    supplier_received_at:ro.data.supplier_received_at,return_target_date:ro.data.return_target_date,cancelled_at:ro.data.cancelled_at,
    units:units.map(unit=>({unit_id:unit.unit_code,goods_received_date:returned.get(unit.stock_item_id)?.goods_received_at ?? null,
      grn_no:returned.get(unit.stock_item_id)?.grn_no ?? null})),
    receipts:receipts as RepairReturnFacts["receipts"],acceptedReceiptIds:[...accepted],completionReceiptIds:completionEvents.filter(event=>event.completed_ro===roId).map(event=>event.receipt_id)};
}

/** Resolves only this source-linked RO return occurrence and its generations. */
async function probe(c:Context<AppEnv>,sourceId:string,roId:string){
  const facts=await readWarehouseRepairReturn(c,sourceId);
  if(!facts || facts.id!==roId) throw new Error("Repair return source changed");
  const items=projectRepairOrderReturnWork({repairOrder:facts,today:todayIsoMYT()});
  if(!items.length) return [];
  const base=`purchasing:${roId}:${REPAIR_ORDER_WORK_RULE.returnDatePassed}`;
  const {readWorkLedger,ledgerRow,LEDGER_COLUMNS}=await import("../routes/operation/work");
  const {currentId}=await readWorkLedger(c,{read:async(_context,ids)=>{
    if(ids.some(id=>id!==base && !(id.startsWith(`${base}:g`) && /^\d+$/.test(id.slice(base.length+2)))))
      throw new Error("Unexpected repair occurrence scope");
    const result=await readAllPages<Row>((from,to)=>adminClient(c.env).from("work_occurrence_events")
      .select(LEDGER_COLUMNS).in("occurrence_id",[...ids]).order("at").order("id").range(from,to));
    if(!("rows" in result)) throw new Error("Repair occurrence history incomplete");
    return result.rows.map(ledgerRow);
  }},items.map(item=>item.id));
  return items.map(item=>({...item,id:currentId.get(item.id) ?? item.id}));
}

export const warehouseRepairReturnDeps = () => ({
  read:readWarehouseRepairReturn,probe,completion:workCompletionDeps(),
});

/** Records only this successful physical receipt, never a concurrent RO cancellation. */
export async function withWarehouseRepairReturnCompletion(c:Context<AppEnv>,sourceId:string|undefined,
  write:()=>Promise<Response>,deps=warehouseRepairReturnDeps()):Promise<Response> {
  if(!sourceId) return write();
  let before:RepairReturnFacts|null;
  try{before=await deps.read(c,sourceId);}catch(error){deps.completion.log("Repair return completion unknown",{error:String(error)});return write();}
  if(!before) return write();
  let postedId:string|null=null;
  const spec:WorkCompletionSpec<RepairReturnFacts|null>={owner:"Purchasing",rules:[REPAIR_ORDER_WORK_RULE.returnDatePassed],
    probe:()=>deps.probe(c,sourceId,before!.id),
    readFacts:async(_context,_id,since)=>{
      if(!postedId) return null;
      const facts=await deps.read(c,sourceId);
      const own=facts?.receipts.find(receipt=>receipt.id===postedId && receipt.arrival_source_id===sourceId && receipt.posted_by===c.var.auth.id);
      if(!facts || facts.id!==before!.id || !own || !own.grn_no || !own.posted_at || new Date(own.posted_at).getTime()<new Date(since).getTime()
        || !facts.acceptedReceiptIds.includes(postedId) || !facts.completionReceiptIds.includes(postedId)) return null;
      return facts;
    },
    result:(_rule,facts)=>facts?repairOrderReturnReceiptResult(facts):null,
  };
  return withWorkCompletion(c,[{spec,objectIds:[before.id]}],async()=>{
    const response=await write();
    if(response.ok){
      try{const result=await response.clone().json() as {status?:string;id?:string;receipt_id?:string};
        if(result.status==="posted") postedId=result.receipt_id ?? result.id ?? null;
      }catch{/* Unknown response never proves completion. */}
    }
    return response;
  },deps.completion);
}
