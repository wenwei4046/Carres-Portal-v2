import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * 0436 — the storage case (docs/payment/MASTER.md §6 · §7).
 *
 * Reads are internal (RLS enforces); the two writes go through the SQL
 * doors, which derive the start, snapshot the §7 rule, gate the extra-free
 * decision and append the order history fact. The route shapes requests and
 * maps errors; it decides nothing the SQL doors already decide.
 *
 * Mounted at `/api/finance/payment-storage`.
 */
const paymentStorageRouter = new Hono<AppEnv>();

const INTERNAL = ["operation", "finance", "principal", "warehouse"] as const;

paymentStorageRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view storage cases." });
  }
  const orderId = c.req.query("orderId");
  const sb = userClient(c.env, auth.jwt);
  let query = sb.from("payment_storage_cases").select("*")
    .order("created_at", { ascending: false });
  if (orderId) {
    const check = z.string().uuid().safeParse(orderId);
    if (!check.success) throw new HTTPException(422, { message: "Bad order id." });
    query = query.eq("order_id", check.data);
  }
  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ cases: data ?? [] });
});

const startInput = z.object({
  orderId: z.string().uuid(),
  productGroup: z.enum(["mattress_bedframe", "sofa"]),
  readinessOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerDelayOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  witnessNote: z.string().trim().min(1, "The witness note is required.").max(1000),
  evidenceUrl: z.string().trim().max(300).nullish(),
});

paymentStorageRouter.post("/start", async (c) => {
  const parsed = await parseJsonBody(c, startInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_start", {
    p_order_id: parsed.data.orderId,
    p_product_group: parsed.data.productGroup,
    p_readiness_on: parsed.data.readinessOn,
    p_customer_delay_on: parsed.data.customerDelayOn,
    p_witness_note: parsed.data.witnessNote,
    p_evidence_url: parsed.data.evidenceUrl ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ case: data }, 201);
});

const extraFreeInput = z.object({
  caseId: z.string().uuid(),
  freeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1, "The reason is required.").max(500),
  evidenceUrl: z.string().trim().min(1, "The written request evidence is required.").max(300),
});

paymentStorageRouter.post("/extra-free", async (c) => {
  const parsed = await parseJsonBody(c, extraFreeInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_extra_free", {
    p_case_id: parsed.data.caseId,
    p_free_until: parsed.data.freeUntil,
    p_reason: parsed.data.reason,
    p_evidence_url: parsed.data.evidenceUrl,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ case: data });
});

const chargeInput = z.object({
  caseId: z.string().uuid(),
});

// 0438 — commenced unbilled §7 periods become a Storage / Additional Storage
// Invoice through the 0429 lifecycle. The SQL door owns every decision.
paymentStorageRouter.post("/charge", async (c) => {
  const parsed = await parseJsonBody(c, chargeInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_invoice", {
    p_case_id: parsed.data.caseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data as Record<string, unknown>, 201);
});

export default paymentStorageRouter;
