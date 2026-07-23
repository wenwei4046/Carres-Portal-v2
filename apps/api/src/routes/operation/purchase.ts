import { Hono } from "hono";
import {
  buildPurchaseTodayReport,
  buildPurchaseChaseReceive,
  myHolidaySet,
  purchaseTodayResponseSchema,
  type DemandLine,
  type ProductCategory,
  type PurchaseChase,
  type PurchaseLinkedOrder,
  type PurchasePoInput,
  type PurchaseReceive,
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
// (non-peak) leads (corrected 2026-07-23: mattress + bedframe are 5–7 wd, sofa
// 14 official / ~10 actual). Peak is OFF for now (the engine never auto-pads).
// This SINGLE number drives raise-by (when to order) so we use the SAFE upper
// bound (order early enough, never late); the shorter ACTUAL/promise number
// (mattress/bedframe 5, sofa 10) lands as a second column with the Settings
// table (migration 0243, pending Jess) so the principal can tune + promise the
// shorter credible date without under-buffering the order.
const DEFAULT_LEAD_DAYS: Record<string, number> = {
  sofa: 10, // Jess 2026-07-23: make + deliver ≈ 10 working days (14 is the padded max)
  bedframe: 7, // Jess: 5–7 working days
  mattress: 7, // Jess: 5–7 working days
};

// Supplier work week per category (Jess 2026-07-23): Nice Future (mattress) = 5-day
// (Sat + Sun off); Ohana (bedframe + sofa) = 6-day (works Saturday). Drives ONLY the
// make+deliver LEAD leg; the arrival buffer + urgency use the Carres 5-day week
// (options.offDays below). One-supplier-per-category proxy until 0243 lands a real
// per-supplier work_week. (Corrects daf06588, which forced the whole engine to 5-day.)
const SUPPLIER_OFF_DAYS: Record<string, readonly number[]> = {
  mattress: [0, 6], // Nice Future — no Saturday
  bedframe: [0], // Ohana — works Saturday
  sofa: [0], // Ohana — works Saturday
};

// Stock must ARRIVE this many working days before the customer deadline (Jess: the
// editable arrival buffer — leaves time to arrange delivery / assign logistic).
// Counted on the Carres/delivery-side week (options.offDays). Editable via 0243 later.
const ARRIVAL_BUFFER_WORKING_DAYS = 7;

const PROCURABLE: ReadonlyArray<ProductCategory> = ["sofa", "bedframe", "mattress"];

// Default per-supplier review cadence = Mon / Wed / Fri.
// TODO: make configurable per supplier (a supplier_review_days config), instead
// of one hardcoded cadence for everyone.
const DEFAULT_REVIEW_DAYS: readonly number[] = [1, 3, 5];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ②③ read model — load every OPEN purchase order (+ its lines) and shape it into
 * the Chase / Receive lists via the pure `buildPurchaseChaseReceive`.
 *
 * Bounded read: filtered to `status='open'` (a small live slice, well under the
 * PostgREST row cap). Linked customer names come from a single batched `orders`
 * lookup over the distinct source SOs (`po.so` + `po.so_refs[]`). userClient /
 * RLS only — read-only, no write path.
 */
async function loadChaseReceive(
  sb: ReturnType<typeof userClient>,
): Promise<
  | { ok: true; chase: PurchaseChase[]; receive: PurchaseReceive[] }
  | { ok: false; err: { code?: string; message?: string; details?: string } }
> {
  const { data: poRows, error: poErr } = await sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, sup_status, status, expected_ready_date, eta_date, so, so_refs, purchase_order_lines(sku, qty, received_qty)",
    )
    .eq("status", "open");
  if (poErr) return { ok: false, err: poErr };
  const pos = poRows ?? [];

  // Distinct source SOs across every open PO (po.so + po.so_refs[]).
  const distinctSos = new Set<number>();
  for (const p of pos) {
    const so = (p as Record<string, unknown>).so as number | null;
    if (typeof so === "number") distinctSos.add(so);
    for (const ref of (((p as Record<string, unknown>).so_refs as number[] | null) ?? [])) {
      if (typeof ref === "number") distinctSos.add(ref);
    }
  }

  // Batched customer/deadline lookup by SO (any order — incl. autocount).
  const orderBySo = new Map<
    number,
    { customerName: string | null; deliveryDate: string | null }
  >();
  if (distinctSos.size > 0) {
    const { data: orderRows, error: orderErr } = await sb
      .from("orders")
      .select("so, customer_name, delivery_date")
      .in("so", [...distinctSos]);
    if (orderErr) return { ok: false, err: orderErr };
    for (const r of orderRows ?? []) {
      const so = Number((r as Record<string, unknown>).so);
      orderBySo.set(so, {
        customerName: ((r as Record<string, unknown>).customer_name as string | null) ?? null,
        deliveryDate: ((r as Record<string, unknown>).delivery_date as string | null) ?? null,
      });
    }
  }

  const inputs: PurchasePoInput[] = pos.map((p) => {
    const row = p as Record<string, unknown>;
    const so = row.so as number | null;
    const soRefs = (row.so_refs as number[] | null) ?? [];
    const sos: number[] = [];
    if (typeof so === "number") sos.push(so);
    for (const ref of soRefs) if (typeof ref === "number" && !sos.includes(ref)) sos.push(ref);

    const linkedOrders: PurchaseLinkedOrder[] = sos.map((n) => {
      const o = orderBySo.get(n);
      return {
        so: n,
        customerName: o?.customerName ?? null,
        deliveryDate: o?.deliveryDate ?? null,
      };
    });

    const lineRows = (row.purchase_order_lines as
      | Array<{ sku: string; qty: number | string; received_qty: number | string }>
      | null) ?? [];

    return {
      poId: row.id as string,
      supplierId: row.supplier_id as string,
      supStatus: row.sup_status as string,
      status: row.status as string,
      expectedReadyDate: (row.expected_ready_date as string | null) ?? null,
      etaDate: (row.eta_date as string | null) ?? null,
      lines: lineRows.map((l) => ({
        sku: l.sku,
        qty: Number(l.qty ?? 0),
        receivedQty: Number(l.received_qty ?? 0),
      })),
      linkedOrders,
    };
  });

  const { chase, receive } = buildPurchaseChaseReceive(inputs, {
    today: todayIso(),
    holidays: myHolidaySet(),
    // Jess 2026-07-23 · Carres suppliers work Mon–Fri (Ohana confirmed; the
    // rest match). Saturday counted as a working day used to inflate `daysLate`
    // on chase rows over long weekends. Passing offDays = [Sun, Sat] fixes it
    // without touching the shared engine default (which the sofa/bedframe
    // 6-day-week tests still assume).
    offDays: [0, 6],
  });
  return { ok: true, chase, receive };
}

purchaseRouter.get("/today", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // ── 0. ②③ Chase / Receive — over the OPEN POs, independent of ① demand. ────
  const cr = await loadChaseReceive(sb);
  if (!cr.ok) {
    const m = mapPgError(cr.err);
    return c.json(m.body, m.status);
  }
  const chaseReceive = { chase: cr.chase, receive: cr.receive };

  // ── 1. Candidate orders: live (place / proceed_order), any source. ────────
  // Jess 2026-07-23 · Reversed the earlier AutoCount exclusion (portal-native
  // only). AutoCount-imported orders that are still `place` / `proceed_order`
  // are LIVE work that must feed procurement — they carry real delivery dates
  // + real customer commitments, and Jess is importing this-week / next-week
  // orders from AutoCount as her main flow. `.in("status", …)` already drops
  // anything past its lifecycle (delivered / cancelled), so no `source_system`
  // gate is needed to protect against archive noise.
  const { data: orderRows, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, status, source_system, delivery_date, delivery_date_tbd, placed_at, created_at",
    )
    .in("status", ["place", "proceed_order"]);
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
    const empty = buildPurchaseTodayReport(
      [],
      {},
      {
        today: todayIso(),
        holidays: myHolidaySet(),
        reviewDaysBySupplier: {},
      },
      {},
      {},
      {},
      chaseReceive,
    );
    return c.json(purchaseTodayResponseSchema.parse(empty));
  }

  // ── 2. Demand lines: join to catalog for category + supplier. ─────────────
  // !inner drops custom/OTHERS lines whose sku isn't a catalog SKU (not
  // procurable). Category is filtered in JS (bounded by native-order lines).
  // NOTE: there is NO foreign key order_lines.sku → product_skus.sku (sku is
  // plain text), so a PostgREST embed `order_lines(...product_skus(...))` 500s in
  // prod ("Could not find a relationship"). Fetch lines, then resolve the catalog
  // facts by sku in a second query (product_skus→product_models IS a real FK, so
  // THAT embed is valid).
  const { data: lineRows, error: lineErr } = await sb
    .from("order_lines")
    .select("id, order_id, sku, qty")
    .in("order_id", orderIds);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const lines = lineRows ?? [];
  const lineSkus = [...new Set(lines.map((l) => l.sku as string))];

  const catBySku = new Map<
    string,
    {
      supplierId: string | null;
      cost: number | null;
      category: ProductCategory | undefined;
      modelName: string | null;
    }
  >();
  if (lineSkus.length > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, supplier_id, cost, product_models!inner(category, name)")
      .in("sku", lineSkus);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    for (const s of skuRows ?? []) {
      const pm = (s as Record<string, unknown>).product_models as
        | { category?: string | null; name?: string | null }
        | null
        | undefined;
      catBySku.set(s.sku as string, {
        supplierId: (s.supplier_id as string | null) ?? null,
        cost: s.cost != null ? Number(s.cost) : null,
        category: (pm?.category as ProductCategory | undefined) ?? undefined,
        modelName: (pm?.name as string | null) ?? null,
      });
    }
  }

  // Per-SKU system cost (product_skus.cost) — DISPLAY-only, advisory. Never
  // reaches an order_line / PO / pricing path; the card just shows Σ(cost×toOrder).
  const costBySku: Record<string, number | null> = {};
  // Per-SKU model name (product_models.name) — the human label on each place line.
  const modelNameBySku: Record<string, string | null> = {};

  const demand: DemandLine[] = [];
  for (const l of lines) {
    const cat = catBySku.get(l.sku as string);
    const category = cat?.category;
    const supplierId = cat?.supplierId ?? null;
    // Only the 3 procurable categories; a line with no supplier can't be bought.
    if (!category || !PROCURABLE.includes(category) || !supplierId) continue;

    costBySku[l.sku as string] = cat?.cost ?? null;
    modelNameBySku[l.sku as string] = cat?.modelName ?? null;

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
      leadDays: DEFAULT_LEAD_DAYS[category] ?? 7,
      offDays: SUPPLIER_OFF_DAYS[category] ?? [0],
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
      // options.offDays = the CARRES / delivery-side week (Mon–Fri, 5-day). It
      // drives the arrival buffer + the urgency buckets (we can't SEND a PO on a
      // Carres off-day). The per-line make+deliver LEAD instead uses each line's
      // own supplier week (DemandLine.offDays, set from SUPPLIER_OFF_DAYS) — so
      // Ohana's Saturday counts toward its lead while Nice Future's does not.
      offDays: [0, 6],
      // Stock must land 7 working days before the deadline (leaves time to
      // arrange delivery). Editable via the 0243 lead-time config later.
      arrivalBufferDays: ARRIVAL_BUFFER_WORKING_DAYS,
      // consumeFreeStock stays OFF (default) — free stock is advisory only.
      reviewDaysBySupplier,
    },
    soByOrderId,
    customerNameByOrderId,
    costBySku,
    chaseReceive,
    modelNameBySku,
  );

  return c.json(purchaseTodayResponseSchema.parse(report));
});

export default purchaseRouter;
