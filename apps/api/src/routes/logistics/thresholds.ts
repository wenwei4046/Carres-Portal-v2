import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setThresholdInput } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/logistics/warehouses/:warehouseId/skus/:sku/threshold
 * — Phase 4.5 Chunk 2 Sprint D Task 19.
 *
 * Inline-edit Save target on the `LogisticsWarehouse` page. Writes the
 * `low_threshold` + `high_threshold` pair on a single (sku, warehouse_id)
 * `stock_balances` row.
 *
 * Behavior — UPDATE-first, INSERT-on-miss:
 *   1. UPDATE stock_balances SET low_threshold, high_threshold WHERE sku +
 *      warehouse_id match. `.select()` returns the touched rows.
 *   2. If 0 rows matched (the warehouse has never carried this SKU), INSERT
 *      a new row with `qty=0, reserved=0` and the supplied thresholds.
 *
 * Why not `.upsert()` with qty/reserved in payload? supabase-js upsert sends
 * the full payload to the SET clause on conflict — that would clobber an
 * existing row's qty/reserved back to 0. The two-step UPDATE-then-INSERT
 * preserves stock counts (only qty/reserved RPCs in 0019/0024/0034/0045
 * mutate those columns). Race window between the two steps is benign:
 *   - Two concurrent threshold edits → one wins, both end up with same final
 *     state for `low_threshold` + `high_threshold`.
 *   - Concurrent stock movement RPC → it locks the row FOR UPDATE; our
 *     UPDATE serializes after it on the same key, no count clobber.
 *
 * `null` is a valid value for either threshold — it clears the alert / the
 * replenishment ceiling. Per migration 0054 a NULL `low_threshold` means "no
 * alert configured" and a NULL `high_threshold` means "fall back to low * 2".
 *
 * Body validation: `setThresholdInput` zod schema enforces both >= 0 (or
 * NULL) AND `high >= low` when both are non-NULL — mirrors the SQL CHECKs
 * `stock_balances_threshold_order` and the per-column `>= 0` checks at the
 * API edge so we 422 at the boundary instead of bouncing off Postgres at
 * 500/SQLSTATE 23514.
 *
 * Path validation: `warehouseId` must be a uuid; `sku` must be non-empty.
 *
 * Role gate: logistics only — the master plan T19 spec scopes this to
 * logistics, mirroring T18's stock-alerts gate. Inline guard fires before
 * any Supabase round-trip.
 *
 * Errors map via `mapPgError` (42501 → 403, 23514 → 500 fallback for any
 * leftover CHECK violations the zod refinement didn't catch).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const thresholdsRouter = new Hono<AppEnv>();

thresholdsRouter.post("/warehouses/:warehouseId/skus/:sku/threshold", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const warehouseId = c.req.param("warehouseId");
  const sku = c.req.param("sku");
  if (!warehouseId || !UUID_RE.test(warehouseId)) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "warehouseId must be a uuid" },
      422,
    );
  }
  if (!sku || sku.length === 0) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "sku must be non-empty" },
      422,
    );
  }

  const parsed = await parseJsonBody(c, setThresholdInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);

  // Step 1: UPDATE existing row if present (preserves qty/reserved).
  const updateRes = await sb
    .from("stock_balances")
    .update({
      low_threshold: parsed.data.low,
      high_threshold: parsed.data.high,
    })
    .eq("sku", sku)
    .eq("warehouse_id", warehouseId)
    .select("sku");
  if (updateRes.error) {
    const m = mapPgError(updateRes.error);
    return c.json(m.body, m.status);
  }

  // Step 2: row didn't exist → INSERT with qty=0, reserved=0.
  if (!updateRes.data || updateRes.data.length === 0) {
    const insertRes = await sb.from("stock_balances").insert({
      sku,
      warehouse_id: warehouseId,
      qty: 0,
      reserved: 0,
      low_threshold: parsed.data.low,
      high_threshold: parsed.data.high,
    });
    if (insertRes.error) {
      const m = mapPgError(insertRes.error);
      return c.json(m.body, m.status);
    }
  }

  return c.json({
    ok: true,
    warehouseId,
    sku,
    low: parsed.data.low,
    high: parsed.data.high,
  });
});

export default thresholdsRouter;
