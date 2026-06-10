import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { updateOpsOrderControlInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * ops_order_control overlay — the editable "Master Sheet, live" fields for an
 * order (migration 0159; P2 of project-orders-control-spec).
 *
 *   GET /api/operation/orders/:id/control   — read the overlay (null if none)
 *   PUT /api/operation/orders/:id/control   — sparse upsert
 *
 * Plain-table CRUD via PostgREST (no RPC): the row is a 1:1 overlay keyed by
 * order_id, created lazily on first edit. RLS (migration 0159) is the security
 * boundary — read = any internal HQ role, write = operation/principal — so we
 * forward the user JWT and let RLS enforce; the inline role gate here is just
 * defence-in-depth + a clean 403 message.
 *
 * Mount via `api.route("/operation/orders", orderControlRouter)` in
 * apps/api/src/index.ts so the paths above are absolute. Mirrors the sibling
 * deliveryChainRouter mounting + inline-guard pattern.
 */
const orderControlRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// GET /:id/control — read the overlay. Absent row → { control: null } (the FE
// renders all-default fields and creates the row on first save).
orderControlRouter.get("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .select(
      "order_id, stock_location, stock_eta, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, updated_at, updated_by",
    )
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data ?? null });
});

// PUT /:id/control — sparse upsert of the overlay. Only the fields the drawer
// changed come in; the rest keep their value (or column default on insert).
// updated_at is auto-bumped by the set_updated_at trigger on the UPDATE branch.
orderControlRouter.put("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsOrderControlInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid order-control input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  // Reject empty patch — nothing to write, signal misuse.
  if (Object.keys(parsed.data).length === 0) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "Patch object must contain at least one field",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      { order_id: idCheck.data, ...parsed.data, updated_by: auth.id },
      { onConflict: "order_id" },
    )
    .select(
      "order_id, stock_location, stock_eta, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, updated_at, updated_by",
    )
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data });
});

export default orderControlRouter;
