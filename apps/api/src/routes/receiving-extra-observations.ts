import {Hono} from "hono";
import {z} from "zod";
import {receivingExtraObservations,receivingExtraObservation,receivingExtraObservationNote,recordExtraObservationInput} from "@carres/shared";
import {requireWarehouse,requireOperation} from "../lib/auth-guards";
import {parseJsonBody,mapPgError} from "../lib/route-helpers";
import {userClient} from "../lib/supabase";
import type {AppEnv} from "../types";
const noteInput=z.object({note:z.string().trim().min(1).max(2000),key:z.string().uuid()}).strict();
function failed(e:{code?:string;message?:string}){return ["PGRST202","PGRST205","42883","42P01"].includes(e.code??"")?{body:{code:"receiving_extra_observations_unavailable"},status:503 as const}:mapPgError(e);}
/** Facts only. No final receipt writer, Inventory mutation or Work completion wrapper. */
export function receivingExtraObservationsRouter(mode:"warehouse"|"office"){
 const router=new Hono<AppEnv>();router.use("*",mode==="warehouse"?requireWarehouse:requireOperation);
 router.get("/:id/extra-observations",async c=>{
  const id=z.string().uuid().safeParse(c.req.param("id"));if(!id.success)return c.json({message:"Invalid Receiving"},422);
  const result=await userClient(c.env,c.var.auth.jwt).rpc("receiving_extra_observations_read",{p_receipt_id:id.data});
  if(result.error){const m=failed(result.error);return c.json(m.body,m.status);}
  const parsed=receivingExtraObservations.safeParse(result.data);if(!parsed.success||parsed.data.receipt_id!==id.data)return c.json({message:"Observation could not be loaded"},502);
  return c.json(mode==="warehouse"?{...parsed.data,notes:[],can_investigate:false}:parsed.data);
 });
 if(mode==="warehouse")router.post("/:id/extra-observations",async c=>{
  const id=z.string().uuid().safeParse(c.req.param("id"));if(!id.success)return c.json({message:"Invalid Receiving"},422);
  const input=await parseJsonBody(c,recordExtraObservationInput);if(!input.ok)return c.json(input.body,input.status);const b=input.data;
  const result=await userClient(c.env,c.var.auth.jwt).rpc("receiving_extra_observation_record",{p_receipt_id:id.data,p_revision:b.revision,p_key:b.key,p_label:b.label,p_qty:b.qty,p_note:b.note,p_day:b.day});
  if(result.error){const m=failed(result.error);return c.json(m.body,m.status);}
  const parsed=receivingExtraObservation.safeParse(result.data);if(!parsed.success||parsed.data.receipt_id!==id.data||parsed.data.recorded_by!==c.var.auth.id||parsed.data.request_key!==b.key||parsed.data.report_revision!==b.revision||parsed.data.qty!==b.qty||parsed.data.label!==(b.label||null)||parsed.data.note!==b.note||parsed.data.goods_received_at!==b.day)return c.json({message:"Observation confirmation did not match"},502);
  return c.json(parsed.data);
 });
 if(mode==="office")router.post("/:id/extra-observations/:observationId/notes",async c=>{
  const ids=z.object({id:z.string().uuid(),observationId:z.string().uuid()}).safeParse(c.req.param());if(!ids.success)return c.json({message:"Invalid observation"},422);
  const input=await parseJsonBody(c,noteInput);if(!input.ok)return c.json(input.body,input.status);
  const result=await userClient(c.env,c.var.auth.jwt).rpc("receiving_extra_observation_note",{p_receipt_id:ids.data.id,p_observation_id:ids.data.observationId,p_note:input.data.note,p_key:input.data.key});
  if(result.error){const m=failed(result.error);return c.json(m.body,m.status);}
  const parsed=receivingExtraObservationNote.safeParse(result.data);if(!parsed.success||parsed.data.observation_id!==ids.data.observationId||parsed.data.actor_id!==c.var.auth.id||parsed.data.request_key!==input.data.key||parsed.data.note!==input.data.note)return c.json({message:"Note confirmation did not match"},502);
  return c.json(parsed.data);
 });
 return router;
}
