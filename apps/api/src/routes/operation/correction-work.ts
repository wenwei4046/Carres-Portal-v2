/**
 * /api/operation/correction-work — STAGE 3 · card 3.4.
 *
 * Durable correction work raised BY a sales order change FOR a downstream
 * module. This router serves the RECEIVING module's surface; the Sales Order
 * lane reads the same rows and has no close door at all.
 *
 *   GET  /                 open work, filtered by module
 *   GET  /order/:orderId   what THIS sales order has raised (read-only side)
 *   POST /:id/close        the receiving module's own door
 *
 * `LINEAGE IS NOT PERMISSION.` Nothing here writes purchase_orders,
 * po_receipts, invoices, payments or a delivery record — closing a row records
 * that a human looked, and changes no downstream fact.
 */
import { Hono } from "hono";
import { z } from "zod";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const correctionWorkRouter = new Hono<AppEnv>();

const SELECT =
  "id, order_id, revision, module, consequence, fields_changed, classification, " +
  "potentially_affected, shared, evidence, state, raised_at, closed_at, closed_note, " +
  "orders(so, customer_name)";

const listQuery = z.object({
  module: z.enum(["purchasing", "operation", "delivery", "finance"]).optional(),
  state: z.enum(["open", "closed", "all"]).default("open"),
});

correctionWorkRouter.get("/", requireOperation, async (c) => {
  const parsed = listQuery.safeParse({
    module: c.req.query("module") ?? undefined,
    state: c.req.query("state") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb.from("sales_order_correction_work").select(SELECT);
  if (parsed.data.module) q = q.eq("module", parsed.data.module);
  if (parsed.data.state !== "all") q = q.eq("state", parsed.data.state);
  const { data, error } = await q.order("raised_at", { ascending: false }).limit(200);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ work: data ?? [] });
});

correctionWorkRouter.get("/order/:orderId", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sales_order_correction_work")
    .select(SELECT)
    .eq("order_id", c.req.param("orderId"))
    .order("raised_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ work: data ?? [] });
});

const closeInput = z.object({ note: z.string().trim().max(500).optional() });

correctionWorkRouter.post("/:id/close", requireOperation, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = closeInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("correction_work_close", {
    p_id: c.req.param("id"),
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    /* 42501 with detail `closed_by_raiser` is not an auth failure the user can
     * fix by logging in differently — it is the rule that someone else must
     * look. It reaches the screen as a 403 carrying the rule's own sentence. */
    const e = error as { code?: string; details?: string; message?: string };
    if (e.code === "42501") {
      return c.json(
        { error: "forbidden", code: e.details ?? "forbidden", message: e.message ?? "not permitted" },
        403,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default correctionWorkRouter;
