import { Hono } from "hono";
import { z } from "zod";
import {
  arrivalSourceCreateInput,
  arrivalHandoverInput,
  arrivalPlanChangeInput,
  arrivalCancelInput,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { parseJsonBody, mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
const router = new Hono<AppEnv>();
const idSchema = z.string().uuid();
router.get("/options", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("ops_stock_items")
    .select(
      "id,unit_code,sku,warehouse_id,status,reserved_ref,hold_claim_id,sold_order_id",
    )
    .eq("qty", 1)
    .order("unit_code")
    .limit(100);
  let caseEvidence: Array<{
    path: string;
    slot: string;
    kind: string;
    at: string;
  }> = [];
  const claim = c.req.query("claim"),
    caseId = c.req.query("case"),
    search = c.req.query("q");
  if (
    (claim && !idSchema.safeParse(claim).success) ||
    (caseId && !idSchema.safeParse(caseId).success)
  )
    return c.json({ message: "Invalid source" }, 422);
  if (claim) q = q.eq("hold_claim_id", claim);
  if (caseId) {
    const res = await sb
      .from("service_cases")
      .select("order_id,evidence")
      .eq("id", caseId)
      .single();
    if (res.error) {
      const m = mapPgError(res.error);
      return c.json(m.body, m.status);
    }
    if (!res.data?.order_id)
      return c.json({ message: "The Case must name its Sales Order" }, 422);
    caseEvidence = Array.isArray(res.data.evidence) ? res.data.evidence : [];
    q = q.eq("sold_order_id", res.data.order_id);
  }
  if (search) q = q.ilike("unit_code", `%${search.replace(/[%_]/g, "")}%`);
  const results = await Promise.all([
    sb.from("warehouses").select("id,name").order("name"),
    sb
      .from("stock_operating_parties")
      .select("id,name,kind")
      .eq("active", true)
      .order("name"),
    q,
  ]);
  for (const r of results)
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  return c.json({
    sites: results[0].data,
    parties: results[1].data,
    units: results[2].data,
    limit: 100,
    caseEvidence,
  });
});
router.post("/:id/proof", requireOperation, async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success)
    return c.json({ message: "Invalid source" }, 422);
  const p = await parseJsonBody(
    c,
    z
      .object({
        mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        size_bytes: z.number().int().positive().max(10485760),
      })
      .strict(),
  );
  if (!p.ok) return c.json(p.body, p.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const source = await sb
    .from("arrival_sources")
    .select("id")
    .eq("id", id)
    .single();
  if (source.error) {
    const m = mapPgError(source.error);
    return c.json(m.body, m.status);
  }
  const ext = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
  }[p.data.mime_type];
  const path = `${id}/${c.var.auth.id}/${crypto.randomUUID()}.${ext}`;
  const result = await sb.storage
    .from("arrival-proofs")
    .createSignedUploadUrl(path);
  if (result.error) return c.json({ message: result.error.message }, 500);
  return c.json({ path, token: result.data.token });
});
router.get("/:id/proof", requireOperation, async (c) => {
  const id = c.req.param("id"),
    path = c.req.query("path") ?? "";
  if (!idSchema.safeParse(id).success || !path.startsWith(`${id}/`))
    return c.json({ message: "Invalid proof" }, 422);
  const r = await userClient(c.env, c.var.auth.jwt)
    .storage.from("arrival-proofs")
    .createSignedUrl(path, 600);
  if (r.error) return c.json({ message: r.error.message }, 500);
  return c.json({ url: r.data.signedUrl });
});
router.get("/:id", requireOperation, async (c) => {
  const id = c.req.param("id");
  if (!idSchema.safeParse(id).success)
    return c.json({ message: "Invalid source" }, 422);
  const sb = userClient(c.env, c.var.auth.jwt);
  const [source, units, events, receipts] = await Promise.all([
    sb.from("arrival_sources").select("*").eq("id", id).single(),
    sb
      .from("arrival_source_units")
      .select(
        "*,unit:ops_stock_items!stock_item_id(id,unit_code,sku,qty,status,warehouse_id,holder_party_id,reserved_ref)",
      )
      .eq("source_id", id),
    sb
      .from("arrival_source_events")
      .select("*")
      .eq("source_id", id)
      .order("recorded_at")
      .order("id"),
    sb
      .from("warehouse_receipts")
      .select("*,unit_results:receiving_unit_results(*)")
      .eq("arrival_source_id", id)
      .order("posted_at"),
  ]);
  for (const r of [source, units, events, receipts])
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  if (
    !units.data?.length ||
    (units.data as unknown as Array<{ unit: unknown }>).some((u) => !u.unit)
  )
    return c.json(
      { message: "Expected Unit records are incomplete; check the source" },
      409,
    );
  return c.json({
    source: source.data,
    units: units.data,
    events: events.data,
    receipts: receipts.data,
  });
});
router.post("/", requireOperation, async (c) => {
  const p = await parseJsonBody(c, arrivalSourceCreateInput);
  if (!p.ok) return c.json(p.body, p.status);
  const r = await userClient(c.env, c.var.auth.jwt).rpc(
    "arrival_source_create",
    { p_input: p.data },
  );
  if (r.error) {
    const m = mapPgError(r.error);
    return c.json(m.body, m.status);
  }
  return c.json(r.data, 201);
});
router.post("/:id/handover", requireOperation, async (c) => {
  if (!idSchema.safeParse(c.req.param("id")).success)
    return c.json({ message: "Invalid source" }, 422);
  const p = await parseJsonBody(c, arrivalHandoverInput);
  if (!p.ok) return c.json(p.body, p.status);
  const r = await userClient(c.env, c.var.auth.jwt).rpc(
    "arrival_source_handover",
    { p_id: c.req.param("id"), p_input: p.data },
  );
  if (r.error) {
    const m = mapPgError(r.error);
    return c.json(m.body, m.status);
  }
  return c.json(r.data);
});
for (const action of ["dates", "cancel"] as const)
  router.post(`/:id/${action}`, requireOperation, async (c) => {
    if (!idSchema.safeParse(c.req.param("id")).success)
      return c.json({ message: "Invalid source" }, 422);
    const p = await parseJsonBody(
      c,
      action === "dates" ? arrivalPlanChangeInput : arrivalCancelInput,
    );
    if (!p.ok) return c.json(p.body, p.status);
    const r = await userClient(c.env, c.var.auth.jwt).rpc(
      "arrival_source_plan",
      {
        p_id: c.req.param("id"),
        p_input: p.data,
        p_cancel: action === "cancel",
      },
    );
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
    return c.json(r.data);
  });
export default router;
