import { Hono } from "hono";
import { z } from "zod";
import { warehouseConfirmReceiptInput, warehouseConfirmationResult } from "@carres/shared";
import { warehouseConfirmationReportToWire } from "@carres/shared/adapters";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { receivingCompletionSpec } from "../../lib/receiving-work-completion";
import { withWorkCompletion, workCompletionDeps } from "../../lib/work-completion";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
const readiness = z.object({ contract_version: z.literal(1), individual: z.boolean(), site_active: z.boolean() });
const missingFunction = (error: { code?: string; message?: string }, name: string) =>
  ["PGRST202", "42883"].includes(error.code ?? "") && (error.message ?? "").includes(name);

/** Admission comes from current database identity, not a client flag or a shared login name.
 * Missing deployment preserves the explicit legacy count door; a failed read never selects it. */
router.get("/confirmation/readiness", requireWarehouse, async c => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("warehouse_receiving_readiness");
  if (error) {
    if (missingFunction(error, "warehouse_receiving_readiness"))
      return c.json({ mode: "legacy_count", reason: "confirmation_not_available" });
    if (error.code === "42501") { const mapped = mapPgError(error); return c.json(mapped.body, mapped.status); }
    return c.json({ code: "receiving_confirmation_unavailable" }, 503);
  }
  const parsed = readiness.safeParse(data);
  if (!parsed.success) return c.json({ code: "receiving_confirmation_unknown" }, 502);
  if (!parsed.data.individual) return c.json({ mode: "legacy_count", reason: "individual_required" });
  return c.json({ mode: parsed.data.site_active ? "confirmation" : "unavailable",
    reason: parsed.data.site_active ? null : "receiving_site_inactive" });
});

/** Separate source reader preserves legacy shared-login semantics and per-line Site scope. */
router.get("/confirmation/incoming", requireWarehouse, async c => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("warehouse_confirmation_incoming");
  if (error) {
    if (missingFunction(error, "warehouse_confirmation_incoming")) return c.json({ code: "receiving_confirmation_unavailable" }, 503);
    const mapped = mapPgError(error); return c.json(mapped.body, mapped.status);
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { pos?: unknown }).pos))
    return c.json({ code: "receiving_confirmation_unknown" }, 502);
  return c.json(data);
});

router.get("/confirmation/arrivals",requireWarehouse,async c=>{
  const result=await userClient(c.env,c.var.auth.jwt).rpc("warehouse_incoming_arrivals");
  if(result.error){if(missingFunction(result.error,"warehouse_incoming_arrivals"))return c.json({code:"receiving_confirmation_unavailable"},503);const m=mapPgError(result.error);return c.json(m.body,m.status);}
  if(!Array.isArray(result.data))return c.json({code:"receiving_confirmation_unknown"},502);
  return c.json({sources:result.data});
});
router.post("/confirmation/arrivals/:id/proof",requireWarehouse,async c=>{
  const id=z.string().uuid().safeParse(c.req.param("id"));
  if(!id.success)return c.json({message:"Invalid source"},422);
  const input=await parseJsonBody(c,z.object({mime_type:z.enum(["application/pdf","image/jpeg","image/png"]),size_bytes:z.number().int().positive().max(10485760)}).strict());
  if(!input.ok)return c.json(input.body,input.status);
  const sb=userClient(c.env,c.var.auth.jwt);
  const admitted=await sb.rpc("warehouse_arrival_proof_allowed",{p_source_id:id.data,p_require_open:true});
  if(admitted.error){const m=mapPgError(admitted.error);return c.json(m.body,m.status);}
  if(admitted.data!==true)return c.json({message:"Source not available"},403);
  const ext={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png"}[input.data.mime_type];
  const path=`${id.data}/${c.var.auth.id}/${crypto.randomUUID()}.${ext}`;
  const signed=await sb.storage.from("arrival-proofs").createSignedUploadUrl(path);
  if(signed.error || !signed.data?.token)return c.json({message:"Evidence could not be saved"},502);
  return c.json({path,token:signed.data.token});
});

/** The one final-confirmation engine either posts or preserves this exact report.
 * Never retry by sending to the legacy count queue after an error or lost response. */
router.post("/receipts/confirm", requireWarehouse, async c => {
  const parsed = await parseJsonBody(c, warehouseConfirmReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;
  return withWorkCompletion(c, [{ spec: receivingCompletionSpec(), objectIds: body.receiptId ? [body.receiptId] : [] }], async () => {
    const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("warehouse_confirm_receipt", {
      p_report: warehouseConfirmationReportToWire(body.report), p_save_key: body.saveKey,
      p_receipt_id: body.receiptId ?? null, p_revision: body.revision ?? null,
    });
    if (error) {
      if (missingFunction(error, "warehouse_confirm_receipt"))
        return c.json({ code: "receiving_confirmation_unavailable" }, 503);
      const mapped = mapPgError(error); return c.json(mapped.body, mapped.status);
    }
    const result = warehouseConfirmationResult.safeParse(data);
    if (!result.success) return c.json({ code: "receiving_confirmation_unknown" }, 502);
    return c.json(result.data);
  }, workCompletionDeps());
});

router.get("/confirmation/receipts", requireWarehouse, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const receipts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let beforeAt: string | null = null;
  let beforeId: string | null = null;
  // Stable (submitted_at,id) pagination: never silently report the first 200
  // as complete history. Failure on any page discards the incomplete response.
  for (let page = 0; page < 100; page++) {
    const { data, error } = await sb.rpc("warehouse_receipts_page", {
      p_before_at: beforeAt, p_before_id: beforeId, p_limit: 200,
    });
    if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
    const parsed = z.array(z.object({ id: z.string().uuid(), submitted_at: z.string().datetime({ offset: true }) }).passthrough()).max(200).safeParse(data);
    if (!parsed.success || new Set(parsed.data.map((row) => row.id)).size !== parsed.data.length || parsed.data.some((row) => seen.has(row.id)))
      return c.json({ error: "Receiving reports could not be loaded" }, 502);
    for (const row of parsed.data) { seen.add(row.id); receipts.push(row); }
    if (parsed.data.length < 200) return c.json({ receipts });
    const last = parsed.data[parsed.data.length - 1]!;
    beforeAt = last.submitted_at;
    beforeId = last.id;
  }
  return c.json({ error: "Receiving reports could not be loaded" }, 502);
});

/** Read-only history of this Warehouse Site's exact report. The SQL projection
 * exposes report snapshots and actor names, not supplier correspondence or stock internals. */
router.get("/confirmation/receipts/:id/history", requireWarehouse, async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({message:"Invalid receipt"},422);
  const sb = userClient(c.env,c.var.auth.jwt);
  const events: Record<string,unknown>[] = [];
  const seen = new Set<string>();
  let beforeAt: string | null = null;
  let beforeId: string | null = null;
  for (let page=0;page<100;page++) {
    const {data,error} = await sb.rpc("warehouse_receipt_history_page",{p_receipt_id:id.data,p_before_at:beforeAt,p_before_id:beforeId,p_limit:200});
    if (error) {const mapped=mapPgError(error);return c.json(mapped.body,mapped.status);}
    const parsed=z.array(z.object({id:z.string().uuid(),receipt_id:z.literal(id.data),event_at:z.string().datetime({offset:true})}).passthrough()).max(200).safeParse(data);
    if (!parsed.success || new Set(parsed.data.map(e=>e.id)).size!==parsed.data.length || parsed.data.some(e=>seen.has(e.id)))
      return c.json({error:"Receiving history could not be loaded"},502);
    for(const event of parsed.data) {seen.add(event.id);events.push(event);}
    if(parsed.data.length<200) return c.json({events});
    const last=parsed.data[parsed.data.length-1]!;
    beforeAt=last.event_at;beforeId=last.id;
  }
  return c.json({error:"Receiving history could not be loaded"},502);
});

router.get("/confirmation/receipts/:id/history/:eventId/evidence", requireWarehouse, async (c) => {
  const parsed=z.object({id:z.string().uuid(),eventId:z.string().uuid(),path:z.string().min(1).max(500)})
    .safeParse({id:c.req.param("id"),eventId:c.req.param("eventId"),path:c.req.query("path")});
  if(!parsed.success) return c.json({message:"Invalid evidence"},422);
  const sb=userClient(c.env,c.var.auth.jwt);
  const {data:bucket,error}=await sb.rpc("warehouse_receipt_evidence_bucket",{
    p_receipt_id:parsed.data.id,p_event_id:parsed.data.eventId,p_path:parsed.data.path,
  });
  if(error){const mapped=mapPgError(error);return c.json(mapped.body,mapped.status);}
  if(bucket!=="delivery-orders" && bucket!=="arrival-proofs") return c.json({message:"Evidence could not be loaded"},403);
  // User JWT Storage RLS is the second boundary; never elevate signing to admin.
  const signed=await sb.storage.from(bucket).createSignedUrl(parsed.data.path,3600);
  if(signed.error || !signed.data?.signedUrl) return c.json({message:"Evidence could not be loaded"},502);
  return c.json({url:signed.data.signedUrl});
});

export default router;
