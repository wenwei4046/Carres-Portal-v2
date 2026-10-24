import { projectRepairOrderWork, REPAIR_ORDER_WORK_RULE } from "@carres/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import type { WorkCompletionTarget, WorkCompletionSpec } from "./work-completion";
import { adminClient } from "./supabase";
import { todayIsoMYT } from "./today";
import { readRepairOrderForWarehouseReceiving } from "../routes/operation/repair-orders";

export interface WarehouseRepairReturnFacts {
  sourceId:string;repairOrderId:string;receiptId:string|null;grnNo:string|null;
  actorId:string;postedBy:string|null;eventId:string|null;eventSourceId:string|null;
  eventRepairOrderId:string|null;allUnitsReturned:boolean;
}
export function warehouseRepairReturnResult(rule:string,f:WarehouseRepairReturnFacts):string|null {
  if(rule!==REPAIR_ORDER_WORK_RULE.returnDatePassed || !f.allUnitsReturned || !f.receiptId || !f.grnNo || !f.eventId
    || f.postedBy!==f.actorId || f.eventSourceId!==f.sourceId || f.eventRepairOrderId!==f.repairOrderId)return null;
  return `repair_orders=${f.repairOrderId};warehouse_receipts=${f.receiptId};grn=${f.grnNo};receiving_events=${f.eventId}`;
}

/** Only this exact, USER-JWT-attested source's repair obligation is observed.
 * Administrative metadata stays on the server; the caller retains its real
 * Warehouse identity throughout the existing physical and Work write doors. */
export async function warehouseRepairReturnTargets(c:Context<AppEnv>,sourceId:string):Promise<WorkCompletionTarget[]> {
  const before=await readRepairOrderForWarehouseReceiving(c,sourceId);
  if(!before)return [];
  const spec:WorkCompletionSpec<WarehouseRepairReturnFacts>={
    owner:"Receiving repair return",rules:[REPAIR_ORDER_WORK_RULE.returnDatePassed],
    probe:async(context,id)=>{
      const ro=await readRepairOrderForWarehouseReceiving(context,sourceId,id);
      if(!ro)return null;
      const items=projectRepairOrderWork({repairOrders:[ro],poDuty:null,today:todayIsoMYT()});
      const {readWorkLedger,supabaseWorkLedger,readWorkLedgerRows}=await import("../routes/operation/work");
      const metadata=adminClient(context.env);
      const ledger={...supabaseWorkLedger,read:(_c:Context<AppEnv>,ids:readonly string[])=>readWorkLedgerRows(metadata,ids)};
      const {currentId}=await readWorkLedger(context,ledger,items.map(item=>item.id));
      return items.map(item=>({...item,id:currentId.get(item.id)??item.id}));
    },
    readFacts:async(context,id,since)=>{
      const ro=await readRepairOrderForWarehouseReceiving(context,sourceId,id);
      const sb=adminClient(context.env);
      // The private Arrival engine stamps this marker only on the false -> true
      // all-active-Units-returned transition caused by this exact receipt.
      const events=await sb.from("receiving_events").select("id,receipt_id,payload")
        .eq("event","posted").eq("actor_id",context.var.auth.id).gte("event_at",since)
        .eq("payload->>source_id",sourceId).eq("payload->>repair_return_completed_ro",id)
        .order("event_at",{ascending:false}).limit(1);
      if(events.error)throw new Error("Repair return completion could not be read");
      const event=events.data?.[0];
      const receipt=event ? await sb.from("warehouse_receipts").select("id,status,grn_no,posted_by,arrival_source_id").eq("id",event.receipt_id).maybeSingle() : null;
      if(receipt?.error)throw new Error("Repair return completion could not be read");
      const r=receipt?.data;
      const payload=event?.payload as {source_id?:string;repair_return_completed_ro?:string}|undefined;
      return {sourceId,repairOrderId:id,actorId:context.var.auth.id,
        receiptId:r?.status==="posted" && r.arrival_source_id===sourceId ? r.id : null,
        grnNo:r?.grn_no??null,postedBy:r?.posted_by??null,eventId:event?.id??null,
        eventSourceId:payload?.source_id??null,eventRepairOrderId:payload?.repair_return_completed_ro??null,
        allUnitsReturned:Boolean(ro && !ro.cancelled_at && ro.units.length && ro.units.every(unit=>unit.goods_received_date && unit.grn_no))};
    },
    result:warehouseRepairReturnResult,
  };
  return [{spec,objectIds:[before.id]}];
}
