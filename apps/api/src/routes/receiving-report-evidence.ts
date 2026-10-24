import { Hono } from "hono";
import { z } from "zod";
import {receivingReportEvidenceFiles} from "@carres/shared";
import { requireWarehouse, requireOperation } from "../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";
const slotInput=z.object({fileId:z.string().uuid(),name:z.string().min(1).max(180),mimeType:z.enum(["image/jpeg","image/png","application/pdf","video/mp4","video/quicktime","video/webm"]),sizeBytes:z.number().int().min(1).max(10485760)}).strict();
const bucket="receiving-report-proofs";
function failure(error:{code?:string;message?:string}){
 if(["PGRST202","42883","42P01"].includes(error.code??""))return {body:{code:"receiving_report_evidence_unavailable",message:"Report evidence is not available yet."},status:503 as const};
 return mapPgError(error);
}
/** User-JWT signing only. SQL rechecks original actor, receipt and current Site.
 * Office uses the same read door; it never receives an upload/complete route. */
export function receivingReportEvidenceRouter(mode:"warehouse"|"office"){
 const router=new Hono<AppEnv>();
 router.use("*",mode==="warehouse"?requireWarehouse:requireOperation);
 router.get("/:id/report-evidence",async c=>{
  const id=z.string().uuid().safeParse(c.req.param("id"));if(!id.success)return c.json({message:"Invalid receipt"},422);
  const result=await userClient(c.env,c.var.auth.jwt).rpc("receiving_report_files_read",{p_receipt_id:id.data});
  if(result.error){const m=failure(result.error);return c.json(m.body,m.status);}
  const parsed=receivingReportEvidenceFiles.safeParse(result.data);if(!parsed.success)return c.json({message:"Report evidence could not be loaded"},502);
  return c.json(parsed.data);
 });
 router.get("/:id/report-evidence/:fileId",async c=>{
  const ids=z.object({id:z.string().uuid(),fileId:z.string().uuid()}).safeParse(c.req.param());if(!ids.success)return c.json({message:"Invalid evidence"},422);
  const sb=userClient(c.env,c.var.auth.jwt);const result=await sb.rpc("receiving_report_files_read",{p_receipt_id:ids.data.id});
  if(result.error){const m=failure(result.error);return c.json(m.body,m.status);}
  const parsed=receivingReportEvidenceFiles.safeParse(result.data);if(!parsed.success)return c.json({message:"Report evidence could not be loaded"},502);
  const file=parsed.data.files.find(f=>f.id===ids.data.fileId&&f.event_id);if(!file)return c.json({message:"Evidence is not available"},403);
  const signed=await sb.storage.from(bucket).createSignedUrl(file.path,300);
  if(signed.error||!signed.data?.signedUrl)return c.json({message:"Evidence could not be loaded"},502);
  return c.json({url:signed.data.signedUrl});
 });
 if(mode==="warehouse"){
  router.post("/:id/report-evidence/slots",async c=>{
   const id=z.string().uuid().safeParse(c.req.param("id"));if(!id.success)return c.json({message:"Invalid receipt"},422);
   const input=await parseJsonBody(c,slotInput);if(!input.ok)return c.json(input.body,input.status);
   const sb=userClient(c.env,c.var.auth.jwt);const d=input.data;
   const result=await sb.rpc("receiving_report_file_slot",{p_receipt_id:id.data,p_file_id:d.fileId,p_name:d.name,p_mime:d.mimeType,p_size:d.sizeBytes});
   if(result.error){const m=failure(result.error);return c.json(m.body,m.status);}
   const slot=z.object({id:z.literal(d.fileId),path:z.string().startsWith(`${id.data}/${c.var.auth.id}/`),attached:z.boolean()}).safeParse(result.data);
   if(!slot.success)return c.json({message:"Evidence could not be saved"},502);
   if(slot.data.attached)return c.json({...slot.data,token:""});
   const signed=await sb.storage.from(bucket).createSignedUploadUrl(slot.data.path);
   if(signed.error||!signed.data?.token)return c.json({message:"Evidence could not be saved"},502);
   return c.json({...slot.data,token:signed.data.token});
  });
  router.post("/:id/report-evidence/:fileId/complete",async c=>{
   const ids=z.object({id:z.string().uuid(),fileId:z.string().uuid()}).safeParse(c.req.param());if(!ids.success)return c.json({message:"Invalid evidence"},422);
   const result=await userClient(c.env,c.var.auth.jwt).rpc("receiving_report_file_complete",{p_receipt_id:ids.data.id,p_file_id:ids.data.fileId});
   if(result.error){const m=failure(result.error);return c.json(m.body,m.status);}
   const parsed=z.object({id:z.literal(ids.data.fileId),path:z.string(),event_id:z.string().uuid(),already_saved:z.boolean()}).safeParse(result.data);
   if(!parsed.success)return c.json({message:"Evidence could not be saved"},502);
   return c.json(parsed.data);
  });
 }
 return router;
}
