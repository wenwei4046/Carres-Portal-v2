import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  supplierMarkDeliveredInput,
  supplierPosListQuery,
} from "@carres/shared";
import { requireSupplier } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Supplier · Purchase Orders router.
 *
 * Spec: docs/superpowers/specs/2026-05-09-phase-6-supplier-spec.md §5.
 *
 * Mounted at `/api/supplier/pos`. Per-route `requireSupplier` guard keeps
 * the role gate at this router only — no blanket `use("*", ...)` (per
 * Phase 4.5 Chunk 2 carry-forward `route-mount-middleware-leak` fix
 * `cdc50fc`). RLS plus the cross-supplier guard inside each RPC provide
 * the second-layer scope check (po.supplier_id = app_supplier_id()).
 *
 * Routes:
 *   GET  /                              list this supplier's POs (RLS-scoped)
 *   GET  /:id                           get one PO (RLS-scoped)
 *   POST /:id/acknowledge               supplier_acknowledge (own_logistics)
 *   POST /:id/start-production          supplier_start_production
 *   POST /:id/ready-for-pickup          logistics_supplier_ready_confirm
 *                                       (existing 0034 RPC, supplier-callable)
 *   POST /:id/mark-delivered            supplier_mark_delivered (DO upload)
 */
const supplierPosRouter = new Hono<AppEnv>();

const PIPELINE_BUCKETS = {
  po: ["pending", "acknowledged", "in_production"] as const,
  ready: [
    "ready_for_pickup",
    // ready_confirm_sent is the actual post-press state for HoOKkA flows
    // (logistics_supplier_ready_confirm RPC, 0034:270) — it was missing from
    // the bucket which made the PO disappear from the supplier's view after
    // pressing "Mark Ready for Pickup". Surfaced 2026-05-09 by phase-6
    // E2E spec.
    "ready_confirm_sent",
    "pickup_assigned",
    "pickup_accepted",
    "shipped",
    "reassign_needed",
  ] as const,
  delivered: ["picked_up", "delivered"] as const,
} satisfies Record<"po" | "ready" | "delivered", readonly string[]>;

supplierPosRouter.get("/", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const parsed = supplierPosListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_query",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid query",
      },
      422,
    );
  }
  const f = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  // 2026-05-10 (Loo) — embed purchase_order_lines so the supplier card can
  // render real SKU + qty + cascade attrs. Pre-fix this select was just `*`
  // and the legacy `purchase_orders.sku/.qty` columns it was reading were
  // dropped in migration 0017 when multi-line PO landed — every supplier
  // card showed blank UNITS and no SKU name.
  let q = sb
    .from("purchase_orders")
    .select("*, lines:purchase_order_lines(id, sku, qty, received_qty, attrs)")
    .order("placed_at", { ascending: false });
  if (f.bucket) {
    q = q.in("sup_status", PIPELINE_BUCKETS[f.bucket] as unknown as string[]);
  }

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

supplierPosRouter.get("/:id", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select("*, lines:purchase_order_lines(id, sku, qty, received_qty, attrs)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "PO not found" }, 404);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/acknowledge", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_acknowledge", { p_po_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/start-production", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_start_production", {
    p_po_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/ready-for-pickup", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_supplier_ready_confirm", {
    p_po_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/mark-delivered", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const body = await parseJsonBody(c, supplierMarkDeliveredInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_mark_delivered", {
    p_po_id: id,
    p_do_number: body.data.doNumber,
    p_do_note: body.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default supplierPosRouter;
