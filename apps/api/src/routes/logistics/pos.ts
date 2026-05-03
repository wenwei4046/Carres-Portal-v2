import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  listPurchaseOrdersQuery,
  reassignPoWarehouseInput,
  receivePoLineInput,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/pos — Phase 4 M3 backend procurement subsystem.
 *
 * Endpoints implemented in this task (M3 Task 1):
 *   GET / — list with status/supplier filters
 *
 * Future M3 tasks add: POST /, POST /:id/receive, POST /:id/cancel,
 * POST /:id/assign-pickup-partner, POST /:id/reassign-warehouse.
 *
 * Pattern: matches apps/api/src/routes/logistics/orders.ts (multi-endpoint
 * router with role-only middleware + shared mapPgError/parseJsonBody from
 * lib/route-helpers + RPC wraps).
 */
const logisticsPosRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsPosRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

// ----- GET / list -----
logisticsPosRouter.get("/", async (c) => {
  const parsed = listPurchaseOrdersQuery.safeParse({
    status: c.req.query("status") ?? undefined,
    supplierId: c.req.query("supplierId") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { status, supplierId } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date, placed_at, purchase_order_lines(sku, qty, received_qty)",
    );

  if (status !== "all") q = q.eq("status", status);
  if (supplierId) q = q.eq("supplier_id", supplierId);

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ pos: data ?? [] });
});

// ----- POST / create -----
logisticsPosRouter.post("/", async (c) => {
  const parsed = await parseJsonBody(c, createPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_create_po", {
    p_supplier_id: parsed.data.supplierId,
    p_warehouse_id: parsed.data.warehouseId,
    p_lines: parsed.data.lines,
    p_dl: parsed.data.dl ?? null,
    p_dl_refs: parsed.data.dlRefs ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/receive -----
logisticsPosRouter.post("/:id/receive", async (c) => {
  const parsed = await parseJsonBody(c, receivePoLineInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_receive_po_line", {
    p_po_id: c.req.param("id"),
    p_sku: parsed.data.sku,
    p_received_qty: parsed.data.receivedQty,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ----- POST /:id/cancel -----
logisticsPosRouter.post("/:id/cancel", async (c) => {
  const parsed = await parseJsonBody(c, cancelPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_cancel_po", {
    p_po_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/assign-pickup-partner -----
logisticsPosRouter.post("/:id/assign-pickup-partner", async (c) => {
  const parsed = await parseJsonBody(c, assignPickupPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_assign_pickup_partner", {
    p_po_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/reassign-warehouse -----
logisticsPosRouter.post("/:id/reassign-warehouse", async (c) => {
  const parsed = await parseJsonBody(c, reassignPoWarehouseInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_reassign_po_warehouse", {
    p_po_id: c.req.param("id"),
    p_new_warehouse_id: parsed.data.newWarehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

export default logisticsPosRouter;
