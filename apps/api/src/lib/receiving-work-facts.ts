import { z } from "zod";
import type { Context } from "hono";
import type { AppEnv } from "../types";
import { userClient } from "./supabase";
export const receivingWorkReceiptSchema=z.object({
  id:z.string().uuid(),po_id:z.string().nullable(),status:z.string(),submitted_at:z.string(),
  goods_received_at:z.string().nullable().optional(),actual_site_id:z.string().nullable(),warehouse_id:z.string(),
  has_raw_report:z.boolean(),validation_blockers:z.array(z.unknown()),grn_no:z.string().nullable(),posted_by:z.string().nullable(),
});
export type ReceivingWorkReceipt=z.infer<typeof receivingWorkReceiptSchema>;
const factSchema=z.object({receipt:receivingWorkReceiptSchema,posted_event_id:z.string().uuid().nullable()});
/** One own report, attested by the database's current individual/Site scope. */
export async function readWarehouseReceivingWorkFact(c:Context<AppEnv>,receiptId:string,since:string|null){
  const result=await userClient(c.env,c.var.auth.jwt).rpc("warehouse_receiving_work_fact",{p_receipt_id:receiptId,p_since:since});
  if(result.error)throw new Error("Receiving completion could not be read");
  const fact=factSchema.safeParse(result.data);
  if(!fact.success || fact.data.receipt.id!==receiptId)throw new Error("Receiving completion could not be read");
  return fact.data;
}
