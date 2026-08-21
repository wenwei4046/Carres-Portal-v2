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
 * 0366 — Behavior: ONE governed door, `ops_stock_set_thresholds`.
 *
 * The old UPDATE-first / INSERT-on-miss / 23505-retry dance existed only
 * because this route wrote `stock_balances` directly and therefore had to
 * invent `qty=0, reserved=0` for a brand-new row — and had to be careful never
 * to clobber counts it did not own. Both problems are gone: the unit register
 * owns the totals, this table no longer carries a write policy, and the RPC
 * upserts the two Settings columns in one statement, so the race it was
 * guarding against cannot arise.
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
  if (auth.role !== "operation" && auth.role !== "principal") {
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

  // 0366 — one governed door, one statement. The three-step
  // UPDATE-then-INSERT-then-retry dance existed because the route wrote the
  // table directly and had to invent qty/reserved for a new row; the register
  // owns those now and the direct write policy is gone. The RPC upserts the
  // Settings columns and touches nothing else.
  const { error } = await sb.rpc("ops_stock_set_thresholds", {
    p_sku: sku,
    p_warehouse_id: warehouseId,
    p_low: parsed.data.low,
    p_high: parsed.data.high,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
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
