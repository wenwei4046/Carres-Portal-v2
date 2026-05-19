import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/operation/pos/:id/lp-accept-inbound — Phase 4.5 Chunk 1 (Task 29).
 *
 * Sofa pre-flight 代按 (Codex F1). Stamps `partner_confirmed_at` on the PO so
 * the inbound LP leg can be marked accepted by either:
 *   • the assigned partner themself (LP self-accept), OR
 *   • operation / principal acting on the partner's behalf (代按).
 *
 * The wrapped RPC `lp_accept_inbound_delivery` (migration 0045) **does NOT
 * advance threads** — it only moves PO `sup_status` to `partner_confirmed`.
 * Thread advancement happens later via the customer-leg dispatch path.
 *
 * Mounted as a separate sub-router under `/operation/pos`. The inline
 * allowlists below legitimately admit `partner` and `principal` in addition
 * to `operation`. Carry-forward `phase-4.5-chunk-2-route-mount-middleware-leak`
 * (closed) made these allowlists effective: previously `operationPosRouter`
 * exported a blanket `use("*", ...)` middleware that — due to Hono v4's
 * flatten-into-parent semantics — leaked across siblings and silently 403'd
 * partner and principal traffic here. `operationPosRouter` now uses
 * per-route `requireOperation` guards (see `lib/auth-guards.ts`), so
 * siblings see clean middleware boundaries.
 */
const lpInboundRouter = new Hono<AppEnv>();

lpInboundRouter.post("/:id/lp-accept-inbound", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal", "partner"].includes(auth.role)) {
    throw new HTTPException(403, { message: "operation, principal, or partner only" });
  }
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("lp_accept_inbound_delivery", { p_po_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const rejectSchema = z.object({ reason: z.string().max(500).optional() });
const relocateSchema = z.object({ new_warehouse_id: z.string().uuid() });

lpInboundRouter.post("/:id/lp-reject-inbound", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal", "partner"].includes(auth.role)) throw new HTTPException(403);
  const id = c.req.param("id");
  const body = rejectSchema.parse(await c.req.json().catch(() => ({})));
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_reject_customer", { p_po_id: id, p_reason: body.reason ?? "" });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

lpInboundRouter.post("/:id/relocate-inbound", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal"].includes(auth.role)) throw new HTTPException(403);
  const id = c.req.param("id");
  const body = relocateSchema.parse(await c.req.json());
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("operation_relocate_warehouse", {
    p_po_id: id,
    p_new_warehouse_id: body.new_warehouse_id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default lpInboundRouter;
