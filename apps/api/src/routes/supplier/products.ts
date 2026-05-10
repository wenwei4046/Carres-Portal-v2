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

  // 2026-05-10 (Loo) — TWO buckets in the response:
  //   openQty   = formal commitment (already-issued PO lines)
  //   pendingQty = pre-commit demand (sales orders with matching cat_covered
  //                that no PO has covered yet)
  //
  // Open bucket: query purchase_order_lines via embedded purchase_orders
  // (RLS-scoped to caller's supplier_id). Replaces the broken legacy query
  // that read dropped scalar `purchase_orders.sku/qty` columns.
  //
  // Pending bucket: orders + order_lines aren't readable by the supplier
  // role under RLS, so we go through `supplier_pending_demand()` SECURITY
  // DEFINER RPC (migration 0078) which does the join + aggregation
  // server-side and returns only (sku, pending_qty, order_count).
  const [linesRes, pendingRes] = await Promise.all([
    sb
      .from("purchase_order_lines")
      .select(
        "sku, qty, purchase_orders!inner(id, sup_status)",
      )
      .in(
        "purchase_orders.sup_status",
        OPEN_SUP_STATUSES as unknown as string[],
      ),
    sb.rpc("supplier_pending_demand"),
  ]);
  if (linesRes.error) {
    throw new HTTPException(500, { message: linesRes.error.message });
  }
  if (pendingRes.error) {
    throw new HTTPException(500, { message: pendingRes.error.message });
  }

  const map = new Map<
    string,
    { sku: string; openQty: number; poCount: number; pendingQty: number; pendingOrderCount: number }
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (linesRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    const qty = Number(row.qty ?? 0);
    if (!sku || qty <= 0) continue;
    const cur =
      map.get(sku) ??
      { sku, openQty: 0, poCount: 0, pendingQty: 0, pendingOrderCount: 0 };
    cur.openQty += qty;
    cur.poCount += 1;
    map.set(sku, cur);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (pendingRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    if (!sku) continue;
    const cur =
      map.get(sku) ??
      { sku, openQty: 0, poCount: 0, pendingQty: 0, pendingOrderCount: 0 };
    cur.pendingQty += Number(row.pending_qty ?? 0);
    cur.pendingOrderCount += Number(row.order_count ?? 0);
    map.set(sku, cur);
  }
  return c.json(
    [...map.values()].sort(
      (a, b) =>
        b.openQty + b.pendingQty - (a.openQty + a.pendingQty),
    ),
  );
});

export default supplierProductsRouter;
