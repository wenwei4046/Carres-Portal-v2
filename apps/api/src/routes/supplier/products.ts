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
 *   GET  /demand        two demand buckets by SKU, each with a `category`
 *                       resolved server-side (resolve_demand_category, migration
 *                       0148): Commit (supplier_committed_demand — open-status PO
 *                       lines) + Forecast (supplier_pending_demand — active lines
 *                       not yet POed). Route merges by SKU.
 */
const supplierProductsRouter = new Hono<AppEnv>();

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

  // Two buckets, both SECURITY DEFINER RPCs that carry `category`
  // (resolve_demand_category, migration 0148):
  //   committed = Commit bucket  (open-status PO lines)
  //   pending   = Forecast bucket (active lines, po_id IS NULL, scoped to
  //               the caller-supplier's cat_covered)
  // A line moves from Forecast → Commit the moment Operation issues a PO
  // (thread.po_id set); a delivered PO drops out of the open-status list.
  const [committedRes, pendingRes] = await Promise.all([
    sb.rpc("supplier_committed_demand"),
    sb.rpc("supplier_pending_demand"),
  ]);
  if (committedRes.error) {
    throw new HTTPException(500, { message: committedRes.error.message });
  }
  if (pendingRes.error) {
    throw new HTTPException(500, { message: pendingRes.error.message });
  }

  const map = new Map<
    string,
    { sku: string; category: string | null; openQty: number; poCount: number; pendingQty: number; pendingOrderCount: number }
  >();
  const get = (sku: string) =>
    map.get(sku) ?? { sku, category: null, openQty: 0, poCount: 0, pendingQty: 0, pendingOrderCount: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (committedRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    if (!sku) continue;
    const cur = get(sku);
    cur.openQty += Number(row.committed_qty ?? 0);
    cur.poCount += Number(row.po_count ?? 0);
    cur.category = cur.category ?? (row.category ?? null);
    map.set(sku, cur);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (pendingRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    if (!sku) continue;
    const cur = get(sku);
    cur.pendingQty += Number(row.pending_qty ?? 0);
    cur.pendingOrderCount += Number(row.order_count ?? 0);
    cur.category = cur.category ?? (row.category ?? null);
    map.set(sku, cur);
  }

  return c.json(
    [...map.values()].sort((a, b) => b.openQty + b.pendingQty - (a.openQty + a.pendingQty)),
  );
});

export default supplierProductsRouter;
