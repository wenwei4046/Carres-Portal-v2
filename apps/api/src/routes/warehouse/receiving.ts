import { Hono } from "hono";
import { receivingSessionInputSchema } from "@carres/shared";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/warehouse — the Warehouse side of governed Receiving.
 *
 * The third-party warehouse's whole surface. Three routes, and that is the
 * point: what a warehouse login sees is POs coming to THEIR warehouse, the R1
 * receive form, and what became of what they filed. Prices, stock adjustments,
 * settings, deletes and every other warehouse are not filtered out of a view
 * they can reach — there is no view they can reach.
 *
 *   GET  /incoming  → open POs bound for this warehouse
 *   GET  /receipts  → what this warehouse filed, and what became of it
 *   POST /receipts  → save and send one count (goods do NOT move)
 *
 * Every route is a SECURITY DEFINER RPC gated on `app_role() = 'warehouse'` and
 * scoped by `app_warehouse_id()` (0302). Not one table policy names the role,
 * so this router cannot be walked around by talking to PostgREST directly — the
 * migration asserts that, and it is the strongest form of the card's "what it
 * can NEVER do".
 *
 * Per-route guards, never a blanket `use("*", ...)` — the Phase 4.5 Chunk 2
 * route-mount middleware leak.
 */
const warehouseReceivingRouter = new Hono<AppEnv>();

/** The incoming list. The RPC returns `{ warehouse, pos }` in one shape so the
 *  shell header and the list cannot disagree about which warehouse this is. */
warehouseReceivingRouter.get("/incoming", requireWarehouse, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_incoming_pos");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { warehouse: null, pos: [] });
});

/** What this warehouse has filed and what became of it. */
warehouseReceivingRouter.get("/receipts", requireWarehouse, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_my_receipts");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ receipts: data ?? [] });
});

/**
 * File a count.
 *
 * Nothing moves here. The same persistent Receiving Session is saved then sent
 * for GRN review. Only `post_receiving_session` can later post Goods Receipt,
 * allocate the stored GRN and change Stock.
 */
warehouseReceivingRouter.post("/receipts", requireWarehouse, async (c) => {
  const parsed = await parseJsonBody(c, receivingSessionInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const saved = await sb.rpc("save_receiving_session", {
    p_receipt_id: null,
    p_expected_version: 0,
    p_payload: parsed.data,
  });
  if (saved.error) {
    const m = mapPgError(saved.error);
    return c.json(m.body, m.status);
  }
  const row = (saved.data ?? {}) as Record<string, unknown>;
  const receiptId = String(row.receipt_id ?? row.id ?? "");
  const lockVersion = Number(row.lock_version ?? 1);
  const submitted = await sb.rpc("submit_receiving_session", {
    p_receipt_id: receiptId,
    p_expected_version: lockVersion,
  });
  if (submitted.error) {
    const m = mapPgError(submitted.error);
    return c.json(m.body, m.status);
  }
  return c.json(submitted.data ?? saved.data ?? {}, 201);
});

export default warehouseReceivingRouter;
