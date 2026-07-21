import { Hono } from "hono";
import {
  buildPurchaseTodayReport,
  myHolidaySet,
  purchaseTodayResponseSchema,
  type DemandLine,
  type ProductCategory,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase — the Procurement cockpit read model.
 *
 *   GET /today — assemble live demand + supply, run the pure net-requirements
 *                MRP engine (packages/shared/src/net-requirements.ts), and
 *                return the data the Purchase page's "① Place orders" section
 *                needs (delivery bundles to raise + a per-supplier buy list).
 *
 * READ-ONLY reporting. userClient / RLS is the security boundary (never
 * service_role); no order-write path, RLS policy, or migration is touched.
 * operation + principal only (mirrors requireOperation, which admits both).
 *
 * Mount via `api.route("/operation/purchase", purchaseRouter)` in
 * apps/api/src/index.ts.
 */
const purchaseRouter = new Hono<AppEnv>();

// Effective lead time (WORKING days) per procurable category — Jess's normal
// (non-peak) leads. Peak is OFF for now (the engine never auto-pads).
// TODO: move to a lead_time_config table (migration 0243, pending Jess) so the
// principal can tune these + author a per-supplier peak window.
const DEFAULT_LEAD_DAYS: Record<string, number> = {
  sofa: 14,
  bedframe: 8,
  mattress: 10,
};

const PROCURABLE: ReadonlyArray<ProductCategory> = ["sofa", "bedframe", "mattress"];

// Default per-supplier review cadence = Mon / Wed / Fri.
// TODO: make configurable per supplier (a supplier_review_days config), instead
// of one hardcoded cadence for everyone.
const DEFAULT_REVIEW_DAYS: readonly number[] = [1, 3, 5];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

purchaseRouter.get("/today", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // ── 1. Candidate orders: live (place / proceed_order), NOT AutoCount. ──────
  // source_system is null for portal-native orders → keep those; drop only the
  // AutoCount archive (they don't feed procurement).
  const { data: orderRows, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, status, source_system, delivery_date, delivery_date_tbd, placed_at, created_at",
    )
    .in("status", ["place", "proceed_order"])
    .or("source_system.is.null,source_system.neq.autocount");
  if (orderErr) {
    const m = mapPgError(orderErr);
    return c.json(m.body, m.status);
  }
  const orders = orderRows ?? [];
  const orderIds = orders.map((o) => o.id as string);
  const orderById = new Map(orders.map((o) => [o.id as string, o]));
  const soByOrderId = new Map<string, number>(
    orders.map((o) => [o.id as string, Number(o.so)]),
  );
  // Customer name per order — carried to the card's primary label (display only).
  const customerNameByOrderId: Record<string, string | null> = {};
  for (const o of orders) {
    customerNameByOrderId[o.id as string] =
      ((o.customer_name as string | null) ?? null) || null;
  }

  // No live orders → nothing to buy. Short-circuit (skip the supply reads).
  if (orderIds.length === 0) {
    const empty = buildPurchaseTodayReport([], {}, {
      today: todayIso(),
      holidays: myHolidaySet(),
      reviewDaysBySupplier: {},
    });
    return c.json(purchaseTodayResponseSchema.parse(empty));
  }

  // ── 2. Demand lines: join to catalog for category + supplier. ─────────────
  // !inner drops custom/OTHERS lines whose sku isn't a catalog SKU (not
  // procurable). Category is filtered in JS (bounded by native-order lines).
  const { data: lineRows, error: lineErr } = await sb
    .from("order_lines")
    .select(
      "id, order_id, sku, qty, product_skus!inner(supplier_id, cost, product_models!inner(category))",
    )
    .in("order_id", orderIds);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }

  // Per-SKU system cost (product_skus.cost) — DISPLAY-only, advisory. Never
  // reaches an order_line / PO / pricing path; the card just shows Σ(cost×toOrder).
  const costBySku: Record<string, number | null> = {};

  const demand: DemandLine[] = [];
  for (const l of lineRows ?? []) {
    const psk = (l as Record<string, unknown>).product_skus as
      | {
          supplier_id?: string | null;
          cost?: number | string | null;
          product_models?: { category?: string | null } | null;
        }
      | null
      | undefined;
    const category = psk?.product_models?.category as ProductCategory | undefined;
    const supplierId = psk?.supplier_id ?? null;
    // Only the 3 procurable categories; a line with no supplier can't be bought.
    if (!category || !PROCURABLE.includes(category) || !supplierId) continue;

    costBySku[l.sku as string] = psk?.cost != null ? Number(psk.cost) : null;

    const order = orderById.get(l.order_id as string);
    if (!order) continue;

    const tbd = Boolean(order.delivery_date_tbd);
    const deadline = tbd ? null : ((order.delivery_date as string | null) ?? null);
    const placedAt = ((order.placed_at as string | null) ??
      (order.created_at as string | null) ??
      todayIso()) as string;

    demand.push({
      lineId: l.id as string,
      orderId: l.order_id as string,
      sku: l.sku as string,
      category,
      supplierId,
      qty: Number(l.qty ?? 0),
      deadline: deadline ? deadline.slice(0, 10) : null,
      leadDays: DEFAULT_LEAD_DAYS[category] ?? 10,
      placedAt: placedAt.slice(0, 10),
      committed: order.status === "proceed_order",
    });
  }

  const demandSkus = [...new Set(demand.map((d) => d.sku))];

  // ── 3. Supply: open POs + free stock, restricted to the demand SKUs. ──────
  // Restricting to demand SKUs keeps both reads well under the PostgREST row
  // cap (bounded by the live-order SKU set, not the whole PO / stock tables).
  const openPoBySku: Record<string, number> = {};
  const freeStockBySku: Record<string, number> = {};

  if (demandSkus.length > 0) {
    // openPoBySku = Σ(qty − received_qty) on OPEN POs (POStatus 'received' =
    // fully received, 'cancelled' excluded; only 'open' remains).
    const { data: poLines, error: poErr } = await sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
      .in("sku", demandSkus)
      .eq("purchase_orders.status", "open");
    if (poErr) {
      const m = mapPgError(poErr);
      return c.json(m.body, m.status);
    }
    for (const r of poLines ?? []) {
      const remaining = Number(r.qty ?? 0) - Number(r.received_qty ?? 0);
      if (remaining <= 0) continue;
      const sku = r.sku as string;
      openPoBySku[sku] = (openPoBySku[sku] ?? 0) + remaining;
    }

    // freeStockBySku = Σ(qty − reserved) at the Klg warehouse only.
    // Resolve the Klg warehouse by name (no `code` column exists). If exactly
    // one matches we scope to it; otherwise we sum ALL warehouses + flag it.
    // TODO: freeStock is ADVISORY here — the engine leaves consumeFreeStock OFF
    // by default (make-to-order never auto-eats labelled stock without a WMS).
    let klgWarehouseId: string | null = null;
    const { data: whRows, error: whErr } = await sb
      .from("warehouses")
      .select("id, name")
      .or("name.ilike.%klang%,name.ilike.%klg%");
    if (whErr) {
      const m = mapPgError(whErr);
      return c.json(m.body, m.status);
    }
    // TODO(klg-resolution): 0 or >1 name matches → sum ALL warehouses' free
    // stock as the safest default (never under-report advisory stock). Tighten
    // once warehouses carry a stable code / the Klg row is unambiguous.
    if ((whRows ?? []).length === 1) klgWarehouseId = whRows![0].id as string;

    let stockQ = sb
      .from("stock_balances")
      .select("sku, qty, reserved, warehouse_id")
      .in("sku", demandSkus);
    if (klgWarehouseId) stockQ = stockQ.eq("warehouse_id", klgWarehouseId);
    const { data: stockRows, error: stockErr } = await stockQ;
    if (stockErr) {
      const m = mapPgError(stockErr);
      return c.json(m.body, m.status);
    }
    for (const r of stockRows ?? []) {
      const free = Number(r.qty ?? 0) - Number(r.reserved ?? 0);
      if (free <= 0) continue;
      const sku = r.sku as string;
      freeStockBySku[sku] = (freeStockBySku[sku] ?? 0) + free;
    }
  }

  // Every distinct demand supplier reviews on the default Mon/Wed/Fri cadence.
  const reviewDaysBySupplier: Record<string, readonly number[]> = {};
  for (const supplierId of new Set(demand.map((d) => d.supplierId))) {
    reviewDaysBySupplier[supplierId] = DEFAULT_REVIEW_DAYS;
  }

  // ── 4. Run the engine + shape the response. ───────────────────────────────
  const report = buildPurchaseTodayReport(
    demand,
    { openPoBySku, freeStockBySku },
    {
      today: todayIso(),
      holidays: myHolidaySet(),
      // consumeFreeStock stays OFF (default) — free stock is advisory only.
      reviewDaysBySupplier,
    },
    soByOrderId,
    customerNameByOrderId,
    costBySku,
  );

  return c.json(purchaseTodayResponseSchema.parse(report));
});

export default purchaseRouter;
