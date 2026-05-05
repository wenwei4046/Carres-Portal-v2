import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/skus/:sku/recent-cost — Phase 4.5 Chunk 2 Sprint E Task 27.
 *
 * Returns the most-recent purchase_order_lines.cost for the given SKU drawn
 * from a fully-received PO (`purchase_orders.status = 'received'`). Used by
 * `CogsLineEditor` (T28) to auto-fill the cost input when the user picks
 * `cost_source = prev_po`. Also seeds the `system_suggested` heuristic
 * (110% of prev_po) downstream.
 *
 * Response shape:
 *   { cost: number | null, lastPoId: string | null, lastReceivedAt: string | null }
 *
 * All-three-null = "no historical cost recorded for this SKU" — the FE shows
 * "no historical data, please hand-enter" in that case.
 *
 * Implementation choice — direct supabase query, NOT an RPC:
 *   • Single read with no business logic worth encapsulating (cf. T28 design
 *     spec §6.3 — front-end picks which heuristic to apply)
 *   • RLS on `purchase_order_lines` + `purchase_orders` already covers access
 *     control (logistics + principal can SELECT both tables)
 *   • No migration churn — 0055/0055b are committed, adding 0055c just for
 *     a SELECT would be over-engineering
 *
 * Filter contract — what counts as "received" for cost lookup:
 *   `purchase_orders.status = 'received'` (po_status enum). This is a terminal
 *   state set by `logistics_receive_po_with_do` (0045/0053) when every line
 *   is fully received (received_qty = qty). Partial receipts (status='open',
 *   sup_status='delivered') are NOT considered "historical cost" yet — the
 *   PO can still get more lines/quantities adjusted before close-out. Once
 *   the PO flips to status='received' the cost is locked in for COGS purposes.
 *
 *   `cost is not null` is also enforced — legacy rows from 0019/0025-era PO
 *   creates predate migration 0055 and have NULL cost (CQ3 — backfill NULL,
 *   do not invent). Skipping NULLs means we walk past legacy POs to find a
 *   real recorded cost.
 *
 * Ordering proxy:
 *   `purchase_orders.updated_at DESC` — there is no dedicated `received_at`
 *   column on the PO table (po_receipts.received_at exists but is per-line
 *   delivery, not PO-level close-out). `updated_at` is touched by the
 *   receive RPC at the moment the PO flips to status='received' (0045:792,
 *   0053:599), so it's the most accurate proxy available without a schema
 *   change. Carry-forward `phase-4.5-chunk-2-recent-cost-received-at`
 *   tracks adding a dedicated `purchase_orders.received_at` column.
 *
 * Role gate: logistics only — matches T18 stock-alerts + T19 thresholds
 * pattern (Sprint D sibling routes). Inline guard fires before any Supabase
 * round-trip for fast 403.
 *
 * Path validation: `:sku` must be non-empty after URL decode.
 *
 * Errors map via `mapPgError` (42501 → 403 fallback, others → 500).
 */
const recentCostRouter = new Hono<AppEnv>();

recentCostRouter.get("/:sku/recent-cost", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const sku = c.req.param("sku");
  if (!sku || sku.length === 0) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "sku must be non-empty" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);

  // T42-C6 — query `purchase_orders` (parent) with `!inner` embed of the
  // matching child line, NOT `purchase_order_lines` with foreignTable order.
  //
  // The previous shape — `from('purchase_order_lines').order(..., {
  // foreignTable: 'purchase_orders' })` — is a known PostgREST gotcha:
  // `foreignTable` only orders the EMBEDDED relation (which is 1:1 here so
  // it's a no-op anyway), NOT the parent rows. The top-level `.limit(1)`
  // therefore picked an arbitrary row from `purchase_order_lines` filtered
  // by sku + the inner-join, which silently returned the WRONG cost when a
  // SKU had multiple historical received POs (codex re-review T42).
  //
  // The corrected query: SELECT id, updated_at, purchase_order_lines!inner(...)
  // FROM purchase_orders po JOIN purchase_order_lines pol ON pol.po_id = po.id
  // WHERE po.status = 'received' AND pol.sku = $1 AND pol.cost IS NOT NULL
  // ORDER BY po.updated_at DESC LIMIT 1.
  // The top-level ORDER + LIMIT now sit on the parent (`purchase_orders`),
  // so they actually pick the most recently received PO for this SKU.
  const { data, error } = await sb
    .from("purchase_orders")
    .select("id, updated_at, purchase_order_lines!inner(cost, sku)")
    .eq("status", "received")
    .eq("purchase_order_lines.sku", sku)
    .not("purchase_order_lines.cost", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  if (!data) {
    return c.json({ cost: null, lastPoId: null, lastReceivedAt: null });
  }

  // PostgREST returns the embedded `purchase_order_lines` as an array
  // (1-to-many fk). Filtered by sku + cost-not-null, so element 0 carries the
  // cost we want. Defensively handle the 1:1-normalized object shape too in
  // case supabase-js's normalization changes; either way pluck `cost`.
  const lines = data.purchase_order_lines as
    | { cost: number | string | null; sku: string }
    | { cost: number | string | null; sku: string }[]
    | null;
  const firstLine = Array.isArray(lines) ? (lines[0] ?? null) : lines;
  const rawCost = firstLine?.cost ?? null;

  return c.json({
    cost: typeof rawCost === "number" ? rawCost : rawCost == null ? null : Number(rawCost),
    lastPoId: data.id ?? null,
    lastReceivedAt: data.updated_at ?? null,
  });
});

export default recentCostRouter;
