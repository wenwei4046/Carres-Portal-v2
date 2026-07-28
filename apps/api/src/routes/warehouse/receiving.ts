import { Hono } from "hono";
import { warehouseSubmitReceiptInput } from "@carres/shared";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/warehouse — R6 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27).
 *
 * The third-party warehouse's whole surface. Three routes, and that is the
 * point: what a warehouse login sees is POs coming to THEIR warehouse, the R1
 * receive form, and what became of what they filed. Prices, stock adjustments,
 * settings, deletes and every other warehouse are not filtered out of a view
 * they can reach — there is no view they can reach.
 *
 *   GET  /incoming  → open POs bound for this warehouse, with R1's four numbers
 *   GET  /receipts  → what this warehouse filed, and what became of it
 *   POST /receipts  → file a count (goods do NOT move; ops check-in does that)
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

/** What this warehouse has filed. Carries the claims each check-in opened —
 *  the card's third bullet ("their own open issues") — through the receipt
 *  link, so a warehouse never needs read access to `supplier_claims` itself. */
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
 * Nothing moves here. The submission is a QUEUED CALL to the receive engine:
 * `warehouse_submit_receipt` validates and stores the payload, and ops's
 * check-in replays it through `operation_receive_po_with_do`. That is why the
 * card can say "ops reviews" and mean it — there is no second receive path to
 * keep in step with the first.
 *
 * zod refuses obvious junk before the round-trip; the RULES (this PO is ours,
 * the line still owes these units, a damaged unit carries a photo, a wrong item
 * carries its kind) all live in the RPC, mirrored by `warehouseReceiptProblems`
 * on the form. The client is never trusted with the payload that gets stored:
 * the RPC rebuilds it from what the database read.
 */
warehouseReceivingRouter.post("/receipts", requireWarehouse, async (c) => {
  const parsed = await parseJsonBody(c, warehouseSubmitReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_submit_receipt", {
    p_po_id: body.poId,
    p_do_number: body.doNumber,
    p_do_file_path: body.doFilePath,
    p_note: body.note ?? null,
    p_lines: body.lines.map((l) => ({
      id: l.id,
      received_now: l.receivedNow ?? 0,
      damaged_qty: l.damagedQty ?? 0,
      wrong_item_qty: l.wrongItemQty ?? 0,
      wrong_item_claim_type: l.wrongItemClaimType ?? null,
      // Storage KEYS, as plain strings — `supplier_claim_photo_entries` (0288)
      // reads string elements and silently drops anything else, so wrapping
      // them in objects here would look tidier and file a photo-less claim.
      damaged_photos: l.damagedPhotos ?? [],
      wrong_item_photos: l.wrongItemPhotos ?? [],
    })),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

export default warehouseReceivingRouter;
