import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  patchDeliveryStopInputSchema,
  setDeliveryChainInputSchema,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Multi-leg delivery chain — operation endpoints over migration 0156's RPCs.
 *
 *   PUT   /api/operation/orders/:id/delivery-chain              — replace chain
 *   PATCH /api/operation/orders/:id/delivery-stops/:leg         — patch one leg
 *
 * γ architecture (Loo 2026-06-05): cross-state / cross-border deliveries need
 * a sequence of partners (NETS → TEOW → EU etc.) but most orders are still
 * single-leg Klang Valley. The route uses jsonb on `orders.delivery_stops`
 * so single-leg orders carry zero extra weight (null column) and multi-leg
 * orders get a flexible chain without a new table.
 *
 * POD upload: frontend uploads the photo directly to the `delivery-orders`
 * Storage bucket via supabase-js (storage RLS already permits operation),
 * then PATCHes the leg with `pod_url`. No upload endpoint here — keeps the
 * Worker out of the file body path (CF body-size limits, slower transfers).
 *
 * Both endpoints role-gate to operation OR principal; partner upload comes
 * later when partners get portal logins (Loo flagged Phase 2).
 *
 * Mount via `api.route("/operation/orders", deliveryChainRouter)` in
 * apps/api/src/index.ts — paths above become absolute as listed.
 */
const deliveryChainRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();

function requireOperationOrPrincipal(role: string): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// PUT /:id/delivery-chain — replace entire chain (operation sets the route).
deliveryChainRouter.put("/:id/delivery-chain", async (c) => {
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
  const parsed = setDeliveryChainInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid delivery-chain input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { error } = await sb.rpc("set_delivery_chain", {
    p_order_id: idCheck.data,
    p_stops: parsed.data.stops,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ stops: parsed.data.stops });
});

// PATCH /:id/delivery-stops/:leg — sparse patch one leg.
deliveryChainRouter.patch("/:id/delivery-stops/:leg", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const legRaw = c.req.param("leg");
  const legNum = Number(legRaw);
  if (!Number.isInteger(legNum) || legNum < 1) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `leg must be a positive integer, got "${legRaw}"`,
      },
      422,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = patchDeliveryStopInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid leg patch at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  // Reject empty patch — nothing to do, signal misuse to caller.
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
  const { data, error } = await sb.rpc("patch_delivery_stop", {
    p_order_id: idCheck.data,
    p_leg: legNum,
    p_patch: parsed.data,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ stop: data });
});

export default deliveryChainRouter;
