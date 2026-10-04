import { Hono } from "hono";
import { z } from "zod";
import { claimPhotoWire, warehouseSubmitReceiptInput, warehouseConfirmReceiptInput } from "@carres/shared";
import { warehouseConfirmationReportToWire } from "@carres/shared/adapters";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import { withWarehouseRepairReturnCompletion } from "../../lib/warehouse-repair-return-work";
import { rpcWithArrivalTime } from "../../lib/receiving-time";

/** Warehouse-owned incoming sources, physical reports and final confirmation.
 * The legacy count route remains available during the governed database rollout.
 * The new final-confirmation route requires its matching SQL engine and never
 * falls back to the legacy queue. Every route forwards the user's JWT; SQL owns
 * active individual, source, actual Site, evidence and posting authority.
 * Per-route guards avoid leaking middleware onto sibling routers.
 */
const warehouseReceivingRouter = new Hono<AppEnv>();

/** The incoming list. The RPC returns `{ warehouse, pos }` in one shape so the
 *  shell header and the list cannot disagree about which warehouse this is. */
warehouseReceivingRouter.get("/incoming", requireWarehouse, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_incoming_pos");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { warehouse: null, pos: [] });
});

/** Non-PO arrivals use their own source identities; no synthetic PO is made. */
warehouseReceivingRouter.get("/arrivals", requireWarehouse, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_incoming_arrivals");
  if (error) { const mapped = mapPgError(error); return c.json(mapped.body, mapped.status); }
  if (!Array.isArray(data)) return c.json({ error: "Arrival sources could not be loaded" }, 502);
  return c.json({ arrivals: data });
});

const arrivalProofInput = z.object({
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z.number().int().positive().max(10485760),
}).strict();

/** Scope is checked twice: the active individual/Site RPC, then user-JWT
 * Storage RLS. No admin signing and no permission to create/change a source. */
warehouseReceivingRouter.post("/arrivals/:id/proof", requireWarehouse, async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ message: "Invalid source" }, 422);
  const parsed = await parseJsonBody(c, arrivalProofInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const allowed = await sb.rpc("warehouse_arrival_proof_allowed", { p_source_id: id.data, p_require_open: true });
  if (allowed.error) { const mapped = mapPgError(allowed.error); return c.json(mapped.body, mapped.status); }
  if (allowed.data !== true) return c.json({ message: "The source is not available to this Warehouse" }, 403);
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[parsed.data.mime_type];
  const path = `${id.data}/${c.var.auth.id}/${crypto.randomUUID()}.${ext}`;
  const result = await sb.storage.from("arrival-proofs").createSignedUploadUrl(path);
  if (result.error) return c.json({ message: result.error.message }, 500);
  return c.json({ path, token: result.data.token });
});

warehouseReceivingRouter.get("/arrivals/:id/proof", requireWarehouse, async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  const path = c.req.query("path") ?? "";
  if (!id.success || !path.startsWith(`${id.data}/`) || path.split("/").some((part) => part === ".." || !part))
    return c.json({ message: "Invalid proof" }, 422);
  const sb = userClient(c.env, c.var.auth.jwt);
  const allowed = await sb.rpc("warehouse_arrival_proof_allowed", { p_source_id: id.data, p_require_open: false });
  if (allowed.error) { const mapped = mapPgError(allowed.error); return c.json(mapped.body, mapped.status); }
  if (allowed.data !== true) return c.json({ message: "The source is not available to this Warehouse" }, 403);
  const result = await sb.storage.from("arrival-proofs").createSignedUrl(path, 3600);
  if (result.error) return c.json({ message: result.error.message }, 500);
  return c.json({ url: result.data.signedUrl });
});

/** What this warehouse has filed. Carries the claims each check-in opened —
 *  the card's third bullet ("their own open issues") — through the receipt
 *  link, so a warehouse never needs read access to `supplier_claims` itself. */
warehouseReceivingRouter.get("/receipts", requireWarehouse, async (c) => {
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
warehouseReceivingRouter.get("/receipts/:id/history", requireWarehouse, async (c) => {
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

warehouseReceivingRouter.get("/receipts/:id/history/:eventId/evidence", requireWarehouse, async (c) => {
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

/**
 * File a count.
 *
 * Nothing moves here. The submission is a QUEUED CALL to the receive engine:
 * `warehouse_submit_receipt` validates and stores the payload, and ops's
 * check-in replays it through `operation_receive_po_with_do`. That is why the
 * card can say "ops reviews" and mean it — there is no second receive path to
 * keep in step with the first.
 *
 * zod refuses obvious junk before the round-trip; the RULES (this PO is ours,
 * the line still owes these units, a damaged unit carries a photo, a wrong item
 * carries its kind) all live in the RPC, mirrored by `warehouseReceiptProblems`
 * on the form. The client is never trusted with the payload that gets stored:
 * the RPC rebuilds it from what the database read.
 */
warehouseReceivingRouter.post("/receipts", requireWarehouse, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSubmitReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await rpcWithArrivalTime((args) => sb.rpc("warehouse_submit_receipt", args), {
    p_po_id: body.poId,
    p_do_number: body.doNumber,
    p_do_file_path: body.doFilePath,
    p_note: body.note ?? null,
    // 0426 — arrival photo/video evidence and extra goods ride the count.
    p_arrival_evidence: body.arrivalEvidence ?? [],
    p_extra_lines: body.extraLines ?? [],
    p_lines: body.lines.map((l) => ({
      id: l.id,
      received_now: l.receivedNow ?? 0,
      damaged_qty: l.damagedQty ?? 0,
      wrong_item_qty: l.wrongItemQty ?? 0,
      wrong_item_claim_type: l.wrongItemClaimType ?? null,
      // Storage KEYS: a plain string files a claim-level photo; since 0614
      // `supplier_claim_photo_entries` also reads `{path, unit_code}` and keeps
      // the Unit the photo shows. Any other shape is still dropped.
      damaged_photos: (l.damagedPhotos ?? []).map(claimPhotoWire),
      wrong_item_photos: (l.wrongItemPhotos ?? []).map(claimPhotoWire),
      // 0426 — one physical result per governed expected Unit.
      units: (l.units ?? []).map((u) => ({
        unit_code: u.unitCode,
        outcome: u.outcome,
        issue_kind: u.issueKind ?? null,
        note: u.note ?? null,
      })),
    })),
  }, body.goodsReceivedTime);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

/** One final-confirmation RPC owns validation, preserved blockers and posting.
 * Never fall back to the legacy queue after a timeout or missing function: that
 * would silently change the promise made by the final confirmation control. */
warehouseReceivingRouter.post("/receipts/confirm", requireWarehouse, async (c) => {
  const parsed = await parseJsonBody(c, warehouseConfirmReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;
  return withWarehouseRepairReturnCompletion(c,body.report.arrivalSourceId ?? undefined,async()=>{
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_confirm_receipt", {
    p_report: warehouseConfirmationReportToWire(body.report),
    p_save_key: body.saveKey,
    p_receipt_id: body.receiptId ?? null,
    p_revision: body.revision ?? null,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  if (!data) return c.json({ error: "Receipt confirmation returned no result" }, 502);
  return c.json(data, 200);
  });
});

export default warehouseReceivingRouter;
