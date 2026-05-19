import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { setThresholdInput } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/operation/warehouses/:warehouseId/skus/:sku/threshold
 * — Phase 4.5 Chunk 2 Sprint D Task 19 + T42-C7 (race-retry).
 *
 * Inline-edit Save target on the `OperationWarehouse` page. Writes the
 * `low_threshold` + `high_threshold` pair on a single (sku, warehouse_id)
 * `stock_balances` row.
 *
 * Behavior — UPDATE-first, INSERT-on-miss, with 23505 race retry:
 *   1. UPDATE stock_balances SET low_threshold, high_threshold WHERE sku +
 *      warehouse_id match. `.select()` returns the touched rows.
 *   2. If 0 rows matched (the warehouse has never carried this SKU), INSERT
 *      a new row with `qty=0, reserved=0` and the supplied thresholds.
 *   3. T42-C7 — if the INSERT raises 23505 (unique_violation on the
 *      composite PK `(sku, warehouse_id)`), another writer slipped in
 *      between our UPDATE and INSERT. Retry the UPDATE: their INSERT
 *      created the row, our UPDATE now lands on it.
 *
 * Why not `.upsert()` with qty/reserved in payload? supabase-js upsert sends
 * the full payload to the SET clause on conflict — that would clobber an
 * existing row's qty/reserved back to 0. The UPDATE-first / INSERT-on-miss
 * pattern preserves stock counts (only qty/reserved RPCs in 0019/0024/
 * 0034/0045 mutate those columns).
 *
 * Race scenarios after the T42-C7 retry path:
 *   - Two concurrent threshold edits, row exists → both UPDATE; last writer
 *     wins on both threshold columns. Fine.
 *   - Two concurrent threshold edits, row missing → both UPDATE returns 0,
 *     both attempt INSERT. One wins (200). Loser hits 23505, falls back to
 *     UPDATE on the now-existing row, also returns 200. No 500 surfaces.
 *   - Concurrent stock movement RPC → it locks the row FOR UPDATE; our
 *     threshold UPDATE serializes after it on the same key, no clobber.
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
 * Role gate: operation only — the master plan T19 spec scopes this to
 * operation, mirroring T18's stock-alerts gate. Inline guard fires before
 * any Supabase round-trip.
 *
 * Errors map via `mapPgError` (42501 → 403, 23514 → 500 fallback for any
 * leftover CHECK violations the zod refinement didn't catch). 23505 is
 * specifically caught + retried before falling back to mapPgError.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const thresholdsRouter = new Hono<AppEnv>();

thresholdsRouter.post("/warehouses/:warehouseId/skus/:sku/threshold", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation") {
    throw new HTTPException(403, { message: "operation only" });
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
      // T42-C7 — race: another writer INSERTed the row between our Step 1
      // UPDATE and this INSERT. Postgres raises 23505 (unique_violation) on
      // the composite PK `(sku, warehouse_id)`. Recover by retrying the
      // UPDATE — the row now exists. Retry-once is sufficient: a third
      // writer's INSERT can't race us on UPDATE because the row exists from
      // here on out. If retry's UPDATE fails for any other reason, we
      // surface that error (don't loop further).
      const insertCode = (insertRes.error as { code?: string }).code;
      if (insertCode === "23505") {
        const retryRes = await sb
          .from("stock_balances")
          .update({
            low_threshold: parsed.data.low,
            high_threshold: parsed.data.high,
          })
          .eq("sku", sku)
          .eq("warehouse_id", warehouseId);
        if (retryRes.error) {
          const m = mapPgError(retryRes.error);
          return c.json(m.body, m.status);
        }
        // Retry UPDATE succeeded — fall through to the 200 response below.
      } else {
        const m = mapPgError(insertRes.error);
        return c.json(m.body, m.status);
      }
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
