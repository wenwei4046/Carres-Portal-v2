import { Hono } from "hono";
import { claimPhotoWire, warehouseSubmitReceiptInput, warehouseConfirmReceiptInput } from "@carres/shared";
import { warehouseConfirmationReportToWire } from "@carres/shared/adapters";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import { rpcWithArrivalTime } from "../../lib/receiving-time";

/** Warehouse-owned incoming sources, physical reports and final confirmation.
 * The legacy count route remains available during the governed database rollout.
 * The new final-confirmation route requires its matching SQL engine and never
 * falls back to the legacy queue. Every route forwards the user's JWT; SQL owns
 * active individual, source, actual Site, evidence and posting authority.
 * Per-route guards avoid leaking middleware onto sibling routers.
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
  const { data, error } = await rpcWithArrivalTime((args) => sb.rpc("warehouse_submit_receipt", args), {
    p_po_id: body.poId,
    p_do_number: body.doNumber,
    p_do_file_path: body.doFilePath,
    p_note: body.note ?? null,
    // 0426 — arrival photo/video evidence and extra goods ride the count.
    p_arrival_evidence: body.arrivalEvidence ?? [],
    p_extra_lines: body.extraLines ?? [],
    p_lines: body.lines.map((l) => ({
      id: l.id,
      received_now: l.receivedNow ?? 0,
      damaged_qty: l.damagedQty ?? 0,
      wrong_item_qty: l.wrongItemQty ?? 0,
      wrong_item_claim_type: l.wrongItemClaimType ?? null,
      // Storage KEYS: a plain string files a claim-level photo; since 0614
      // `supplier_claim_photo_entries` also reads `{path, unit_code}` and keeps
      // the Unit the photo shows. Any other shape is still dropped.
      damaged_photos: (l.damagedPhotos ?? []).map(claimPhotoWire),
      wrong_item_photos: (l.wrongItemPhotos ?? []).map(claimPhotoWire),
      // 0426 — one physical result per governed expected Unit.
      units: (l.units ?? []).map((u) => ({
        unit_code: u.unitCode,
        outcome: u.outcome,
        issue_kind: u.issueKind ?? null,
        note: u.note ?? null,
      })),
    })),
  }, body.goodsReceivedTime);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {}, 201);
});

/** One final-confirmation RPC owns validation, preserved blockers and posting.
 * Never fall back to the legacy queue after a timeout or missing function: that
 * would silently change the promise made by the final confirmation control. */
warehouseReceivingRouter.post("/receipts/confirm", requireWarehouse, async (c) => {
  const parsed = await parseJsonBody(c, warehouseConfirmReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_confirm_receipt", {
    p_report: warehouseConfirmationReportToWire(body.report),
    p_save_key: body.saveKey,
    p_receipt_id: body.receiptId ?? null,
    p_revision: body.revision ?? null,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  if (!data) return c.json({ error: "Receipt confirmation returned no result" }, 502);
  return c.json(data, 200);
});

export default warehouseReceivingRouter;
