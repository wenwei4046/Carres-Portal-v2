import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireSupplier } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Supplier · Products router.
 *
 * Spec: docs/superpowers/specs/2026-05-09-phase-6-supplier-spec.md §5.
 *
 * Mounted at `/api/supplier/products`. RLS on `product_skus.supplier_id`
 * (added migration 0026, policy 0002:260-270) scopes the read; we just
 * forward the user JWT.
 *
 * Routes:
 *   GET  /              list this supplier's SKUs (joined to product_models
 *                       for display name)
 *   GET  /demand        aggregate open-PO demand by SKU. RLS-scoped via
 *                       purchase_orders.supplier_id; client groups+sums.
 */
const supplierProductsRouter = new Hono<AppEnv>();

const OPEN_SUP_STATUSES = [
  "pending",
  "acknowledged",
  "in_production",
  "ready_for_pickup",
  "pickup_assigned",
  "pickup_accepted",
  "shipped",
  "reassign_needed",
];

supplierProductsRouter.get("/", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("product_skus")
    .select(
      "sku, category, model_key, variant, price, model:product_models(name, blurb)",
    )
    .order("category")
    .order("model_key")
    .order("variant");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

supplierProductsRouter.get("/demand", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // Pull open POs + aggregate to lines. Two-step is cheaper than a CTE here
  // because RLS already filters purchase_orders by supplier_id at the row
  // level; we just need the line-level rollup.
  const { data: pos, error: posErr } = await sb
    .from("purchase_orders")
    .select("id, sku, qty, sup_status")
    .in("sup_status", OPEN_SUP_STATUSES);
  if (posErr) throw new HTTPException(500, { message: posErr.message });

  // Sum by sku across the supplier's open POs.
  const map = new Map<string, { sku: string; openQty: number; poCount: number }>();
  for (const row of pos ?? []) {
    const r = row as { sku: string; qty: number; sup_status: string };
    if (!r.sku) continue;
    const cur = map.get(r.sku) ?? { sku: r.sku, openQty: 0, poCount: 0 };
    cur.openQty += r.qty;
    cur.poCount += 1;
    map.set(r.sku, cur);
  }
  return c.json([...map.values()].sort((a, b) => b.openQty - a.openQty));
});

export default supplierProductsRouter;
