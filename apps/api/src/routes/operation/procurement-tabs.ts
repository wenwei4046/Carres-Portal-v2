import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PROCUREMENT_TAB_SLUGS, type ProcurementTabSlug } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/procurement/:slug — Phase 4.5 Chunk 2 Sprint F Task 33.
 *
 * Per-tab PO listing for the tabbed procurement shell. The operation
 * Procurement page is split into 3 tabs (one per supplier × category channel):
 *
 *   • nice-future     — all POs whose supplier slug is 'nice-future'
 *   • hookka-sofa     — POs from supplier slug 'hookka' AND category 'sofa'
 *   • hookka-bedframe — POs from supplier slug 'hookka' AND category 'bedframe'
 *
 * The slug whitelist comes from `PROCUREMENT_TAB_SLUGS` in
 * `packages/shared/src/sops.ts` (T32). Invalid slugs return 422 before any
 * Supabase round-trip.
 *
 * Schema notes:
 *   • `suppliers.slug` was added in migration 0032 (NOT NULL + UNIQUE after
 *     seed) so the slug is the stable cross-env handle.
 *   • `purchase_orders` itself has no `category` column. Category lives on
 *     `product_models.category` (product_category enum). The project SKU
 *     convention is `cat:model[:variant]` (lowercase, colon-separated; see
 *     migration 0019 §17.2 D1 + apps/api/src/routes/operation/movements.ts:97
 *     for the same pattern). For category filtering we therefore inner-join
 *     `purchase_order_lines` and apply `.like("sku", "<category>:%")` on the
 *     line's SKU. Any line in a hookka PO whose SKU matches the prefix flips
 *     the parent PO into the result set; this matches movements.ts behavior.
 *   • Response shape `{ pos: [...] }` matches the existing
 *     `GET /api/operation/pos` list endpoint (apps/api/src/routes/operation/pos.ts:47-77),
 *     so the FE can reuse the same row-rendering code on every tab.
 *
 * Auth: inline operation-only guard (same fast-403 pattern as pos.ts +
 * stock-alerts.ts). Forwarded user JWT → RLS still applies on
 * `purchase_orders` + `purchase_order_lines` + `suppliers`.
 */
const procurementTabsRouter = new Hono<AppEnv>();

// Inline operation-only guard — fast 403 before any Supabase round-trip.
procurementTabsRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

/** Mapping from slug → (supplierSlug, optional category prefix). */
function resolveSlugFilters(slug: ProcurementTabSlug): {
  supplierSlug: string;
  category: "sofa" | "bedframe" | null;
} {
  switch (slug) {
    case "nice-future":
      return { supplierSlug: "nice-future", category: null };
    case "hookka-sofa":
      return { supplierSlug: "hookka", category: "sofa" };
    case "hookka-bedframe":
      return { supplierSlug: "hookka", category: "bedframe" };
  }
}

type PoRow = {
  id: string;
  so: number | null;
  so_refs: number[] | null;
  [k: string]: unknown;
};

type OrderEnrichment = {
  so: number;
  customer_name: string;
  delivery_date: string | null;
};

type PoUrgency = "critical" | "urgent" | "normal" | null;

/**
 * 2026-05-18 (Loo C+D) — Per-PO Orders enrichment + worst-case urgency.
 *
 * Adds two fields to each PO row before returning:
 *   • `orders: [{ so, customer_name, delivery_date }]`
 *     One entry per source SO this PO serves (po.so for single, po.so_refs[]
 *     for bundle). Order rows live in the `orders` table; we do one batched
 *     SELECT after fetching POs so the FE can show "#1003 · Tan ML · 5-25"
 *     per source SO instead of just the bare numbers.
 *   • `urgency: 'critical' | 'urgent' | 'normal' | null`
 *     Worst-case across orders: smallest (delivery_date - today). <7d critical,
 *     7-14d urgent, >14d normal. NULL when no orders / all delivery_date NULL.
 *
 * Mirrors the supplier-side enrichment pattern from Phase 10 (supplier/pos.ts).
 * Operation role has full RLS read on `orders`, so a single .in('so', distinct)
 * query suffices.
 */
async function enrichPosWithOrders(
  sb: ReturnType<typeof userClient>,
  pos: PoRow[],
): Promise<Array<PoRow & { orders: OrderEnrichment[]; urgency: PoUrgency }>> {
  if (pos.length === 0) return [];

  // Collect distinct source SOs across all POs (union of po.so + po.so_refs).
  const distinctSos = new Set<number>();
  for (const p of pos) {
    if (typeof p.so === "number") distinctSos.add(p.so);
    for (const ref of p.so_refs ?? []) {
      if (typeof ref === "number") distinctSos.add(ref);
    }
  }

  // No source SOs (all stockpile POs) → short-circuit empty orders+null urgency.
  if (distinctSos.size === 0) {
    return pos.map((p) => ({ ...p, orders: [], urgency: null }));
  }

  // Batched lookup. Orders RLS for operation role admits all rows.
  const { data: orderRows, error } = await sb
    .from("orders")
    .select("so, customer_name, delivery_date")
    .in("so", [...distinctSos]);
  if (error) throw error;

  const orderBySo = new Map<number, OrderEnrichment>();
  for (const r of (orderRows ?? []) as Array<{
    so: number;
    customer_name: string;
    delivery_date: string | null;
  }>) {
    orderBySo.set(Number(r.so), {
      so: Number(r.so),
      customer_name: r.customer_name,
      delivery_date: r.delivery_date,
    });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  function computeUrgency(orders: OrderEnrichment[]): PoUrgency {
    let minDaysAhead: number | null = null;
    for (const o of orders) {
      if (!o.delivery_date) continue;
      const d = new Date(o.delivery_date + "T00:00:00Z");
      const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
      if (minDaysAhead === null || days < minDaysAhead) minDaysAhead = days;
    }
    if (minDaysAhead === null) return null;
    if (minDaysAhead < 7) return "critical";
    if (minDaysAhead < 14) return "urgent";
    return "normal";
  }

  return pos.map((p) => {
    const sosForPo: number[] = [];
    if (typeof p.so === "number") sosForPo.push(p.so);
    for (const ref of p.so_refs ?? []) {
      if (typeof ref === "number" && !sosForPo.includes(ref)) sosForPo.push(ref);
    }
    const orders = sosForPo
      .map((so) => orderBySo.get(so))
      .filter((o): o is OrderEnrichment => o !== undefined);
    return {
      ...p,
      orders,
      urgency: computeUrgency(orders),
    };
  });
}

procurementTabsRouter.get("/:slug", async (c) => {
  // 1. Validate slug against the shared whitelist. Anything outside
  //    PROCUREMENT_TAB_SLUGS → 422 before we touch Supabase.
  const rawSlug = c.req.param("slug");
  if (!(PROCUREMENT_TAB_SLUGS as readonly string[]).includes(rawSlug)) {
    return c.json(
      {
        error: "invalid_param",
        code: "invalid_slug",
        message: `slug must be one of: ${PROCUREMENT_TAB_SLUGS.join(", ")}`,
      },
      422,
    );
  }
  const slug = rawSlug as ProcurementTabSlug;
  const { supplierSlug, category } = resolveSlugFilters(slug);

  const sb = userClient(c.env, c.var.auth.jwt);

  // 2. Build the query. Same column set as GET /api/operation/pos so the FE
  //    can render either response with shared components. We add
  //    `suppliers!inner(slug, name)` for the supplier-slug filter so the
  //    parent rows narrow to the supplier this tab represents.
  //
  // T42-pass3-C4 — DO NOT use `purchase_order_lines!inner(...)` with an
  // embedded `.like()` filter to narrow by category. PostgREST applies the
  // embedded filter to the EMBEDDED ARRAY too, so a mixed-category Hookka PO
  // (sofa + bedframe lines) would show in `hookka-sofa` but its embedded
  // lines array would be truncated to only sofa rows. Receive/Detail modals
  // would then operate on an incomplete PO.
  //
  // Two-pass query instead:
  //   Pass A — find parent PO IDs whose lines match category prefix
  //   Pass B — refetch full POs by id with the FULL embedded line array
  //   Pass C — enrich with per-source-SO orders + urgency (added 2026-05-18)
  let pos: PoRow[] = [];
  if (category !== null) {
    // Pass A: narrow ids via the lines table directly.
    const { data: lineRows, error: lineErr } = await sb
      .from("purchase_order_lines")
      .select(
        "po_id, purchase_orders!inner(suppliers!inner(slug))",
      )
      .like("sku", `${category}:%`)
      .eq("purchase_orders.suppliers.slug", supplierSlug);
    if (lineErr) {
      const m = mapPgError(lineErr);
      return c.json(m.body, m.status);
    }
    const matchedIds = Array.from(
      new Set(((lineRows ?? []) as Array<{ po_id: string }>).map((r) => r.po_id)),
    );
    if (matchedIds.length === 0) {
      return c.json({ pos: [] });
    }
    // Pass B: refetch parent rows by id with FULL line array (no embedded
    // filter) so Receive/Detail modals see every line on the PO.
    const { data, error } = await sb
      .from("purchase_orders")
      .select(
        "id, supplier_id, warehouse_id, status, sup_status, so, so_refs, eta_date, placed_at, suppliers!inner(slug, name), purchase_order_lines(id, sku, qty, received_qty, attrs)",
      )
      .in("id", matchedIds)
      .order("placed_at", { ascending: false })
      .limit(200);
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    pos = (data ?? []) as PoRow[];
  } else {
    // 3. No category filter — single-pass query. Embed lines without inner so
    //    POs with zero lines still surface.
    const { data, error } = await sb
      .from("purchase_orders")
      .select(
        "id, supplier_id, warehouse_id, status, sup_status, so, so_refs, eta_date, placed_at, suppliers!inner(slug, name), purchase_order_lines(id, sku, qty, received_qty, attrs)",
      )
      .eq("suppliers.slug", supplierSlug)
      .order("placed_at", { ascending: false })
      .limit(200);
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    pos = (data ?? []) as PoRow[];
  }

  // Pass C — enrich with per-source-SO orders + worst-case urgency.
  try {
    const enriched = await enrichPosWithOrders(sb, pos);
    return c.json({ pos: enriched });
  } catch (err) {
    const m = mapPgError(err as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }
});

export default procurementTabsRouter;
