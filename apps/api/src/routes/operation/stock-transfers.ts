import { Hono } from "hono";
import {
  arriveStockTransferInput,
  cancelStockTransferInput,
  collectStockTransferInput,
  docNumber,
  requestStockTransferInput,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { todayIsoMYT } from "../../lib/delivery-order-issue";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * WAREHOUSE TRANSFERS — the cross-site custody journey (0365; Warehouse
 * Blueprint item 8 slice 1, card 2026-08-19).
 *
 *   GET  /             — the register rows: every Transfer with the facts its
 *                        columns print AND the events its state is derived from.
 *   POST /             — Request transfer: exact units, both sites, purpose,
 *                        expected date. Moves nothing.
 *   POST /:id/collect  — Confirm collection: the goods leave, the units go
 *                        In transit.
 *   POST /:id/arrive   — Confirm arrival: the destination receives.
 *   POST /:id/cancel   — Cancel transfer: pre-collection only, with its reason.
 *
 * Every door is the RPC's caller, never its replacement: the database owns the
 * refusals (role, ordering, held units, reserved units, cancel-after-collection)
 * because a rule inside one route is a rule one call walks around (0299's
 * lesson). Status is NOT computed here either — `stockTransferStateOf` in
 * packages/shared is the ONE arithmetic (Law D) and the web runs it over the
 * events this route returns.
 */
const stockTransfersRouter = new Hono<AppEnv>();

/** The register's rows. A register finds documents; it computes no work. */
stockTransfersRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: transfers, error } = await sb
    .from("ops_stock_transfers")
    .select(
      "id, transfer_no, from_warehouse_id, to_warehouse_id, purpose, sales_order_ref, expected_date, note, requested_at",
    )
    .order("requested_at", { ascending: false })
    .limit(500);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const ids = (transfers ?? []).map((t) => t.id);
  if (ids.length === 0) {
    return c.json({ transfers: [], events: [], units: [], warehouses: [] });
  }

  const [{ data: events, error: eErr }, { data: units, error: uErr }, { data: whs, error: wErr }] =
    await Promise.all([
      sb
        .from("ops_stock_transfer_events")
        .select("transfer_id, kind, carrier, handover_to, received_by_name, reason, recorded_at")
        .in("transfer_id", ids),
      sb.from("ops_stock_transfer_units").select("transfer_id, stock_item_id").in("transfer_id", ids),
      sb.from("warehouses").select("id, name"),
    ]);
  for (const err of [eErr, uErr, wErr]) {
    if (err) {
      const m = mapPgError(err);
      return c.json(m.body, m.status);
    }
  }

  return c.json({
    transfers: transfers ?? [],
    events: events ?? [],
    units: units ?? [],
    warehouses: whs ?? [],
  });
});

/**
 * Request transfer.
 *
 * The number is minted HERE, under the locked `docNumber()` scheme — SQL cannot
 * import the one implementation. The transfer's own id seeds the tail, so the
 * number is derived from the row rather than counted, and a reprint matches
 * forever. A same-day tail collision is astronomically unlikely but not
 * impossible, so a fresh id (and therefore a fresh tail) is drawn rather than
 * appending an amendment letter, which would read as a revision of a document
 * that never existed.
 */
stockTransfersRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const parsed = requestStockTransferInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" },
      400,
    );
  }
  const input = parsed.data;

  const today = todayIsoMYT();
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = crypto.randomUUID();
    const transferNo = docNumber({ prefix: "TR", date: today, seed: id, digits: 4 });

    const { data, error } = await sb.rpc("ops_stock_transfer_request", {
      p_id: id,
      p_transfer_no: transferNo,
      p_from: input.fromWarehouseId,
      p_to: input.toWarehouseId,
      p_unit_ids: input.unitIds,
      p_purpose: input.purpose,
      p_expected_date: input.expectedDate,
      p_sales_order_ref: input.salesOrderRef ?? null,
      p_note: input.note ?? null,
    });
    if (!error) return c.json({ transfer: data }, 201);

    // 23505 = the number is taken. Draw a new seed and try again; every other
    // error is the caller's or the law's and is returned as it stands.
    if (error.code === "23505" && attempt < 3) continue;
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { error: "number_unavailable", code: "number_unavailable", message: "Could not mint a transfer number" },
    503,
  );
});

/** Confirm collection — the goods physically leave. */
stockTransfersRouter.post("/:id/collect", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const parsed = collectStockTransferInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" },
      400,
    );
  }
  const { data, error } = await sb.rpc("ops_stock_transfer_collect", {
    p_transfer_id: c.req.param("id"),
    p_carrier: parsed.data.carrier ?? null,
    p_handover_to: parsed.data.handoverTo ?? null,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ event: data }, 201);
});

/** Confirm arrival — only now do the goods enter the destination's stock. */
stockTransfersRouter.post("/:id/arrive", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const parsed = arriveStockTransferInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" },
      400,
    );
  }
  const { data, error } = await sb.rpc("ops_stock_transfer_arrive", {
    p_transfer_id: c.req.param("id"),
    p_received_by_name: parsed.data.receivedByName,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ event: data }, 201);
});

/** Cancel transfer — refused once the goods have been collected. */
stockTransfersRouter.post("/:id/cancel", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const parsed = cancelStockTransferInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_input", message: parsed.error.issues[0]?.message ?? "invalid input" },
      400,
    );
  }
  const { data, error } = await sb.rpc("ops_stock_transfer_cancel", {
    p_transfer_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ event: data }, 201);
});

export default stockTransfersRouter;
