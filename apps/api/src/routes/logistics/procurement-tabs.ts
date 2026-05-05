import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { PROCUREMENT_TAB_SLUGS, type ProcurementTabSlug } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/procurement/:slug — Phase 4.5 Chunk 2 Sprint F Task 33.
 *
 * Per-tab PO listing for the tabbed procurement shell. The Logistics
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
 *     migration 0019 §17.2 D1 + apps/api/src/routes/logistics/movements.ts:97
 *     for the same pattern). For category filtering we therefore inner-join
 *     `purchase_order_lines` and apply `.like("sku", "<category>:%")` on the
 *     line's SKU. Any line in a hookka PO whose SKU matches the prefix flips
 *     the parent PO into the result set; this matches movements.ts behavior.
 *   • Response shape `{ pos: [...] }` matches the existing
 *     `GET /api/logistics/pos` list endpoint (apps/api/src/routes/logistics/pos.ts:47-77),
 *     so the FE can reuse the same row-rendering code on every tab.
 *
 * Auth: inline logistics-only guard (same fast-403 pattern as pos.ts +
 * stock-alerts.ts). Forwarded user JWT → RLS still applies on
 * `purchase_orders` + `purchase_order_lines` + `suppliers`.
 */
const procurementTabsRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
procurementTabsRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
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

  // 2. Build the query. Same column set as GET /api/logistics/pos so the FE
  //    can render either response with shared components. We add
  //    `suppliers!inner(slug, name)` for the supplier-slug filter and (for the
  //    hookka tabs) `purchase_order_lines!inner(...)` for the category
  //    prefix filter on the line's SKU. The lines column comes back inside
  //    the embedded shape regardless of the inner-filter.
  let q = sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date, placed_at, suppliers!inner(slug, name), purchase_order_lines!inner(sku, qty, received_qty)",
    )
    .eq("suppliers.slug", supplierSlug);

  // 3. For the two hookka tabs, narrow further by category via SKU prefix
  //    on the inner-joined line. This mirrors movements.ts:98 — the project
  //    SKU convention is `cat:model[:variant]`, so a `category:%` LIKE on
  //    the line SKU isolates the right channel.
  if (category !== null) {
    q = q.like("purchase_order_lines.sku", `${category}:%`);
  }

  q = q.order("placed_at", { ascending: false }).limit(200);

  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ pos: data ?? [] });
});

export default procurementTabsRouter;
