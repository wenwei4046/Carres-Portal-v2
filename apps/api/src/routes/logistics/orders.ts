import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  abandonOrderInput,
  assignPartnerInput,
  attachDoInput,
  listLogisticsOrdersQuery,
} from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/orders — Phase 4 M2 backend orders subsystem.
 *
 * Endpoints implemented in this task (M2 Task 2):
 *   GET / — list with stage/channel/search filters
 *
 * Future M2 tasks add: GET /:id, POST /:id/assign-partner, POST /:id/attach-do,
 * POST /:id/abandon, POST /:id/warehouse, POST /:id/recheck-stock.
 *
 * Pattern: matches apps/api/src/routes/principal/dealers.ts (multi-endpoint
 * router with role-only middleware + inline mapPgError).
 */
const logisticsOrdersRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsOrdersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

/** SQLSTATE -> HTTP body+status. Mirrors principal/dealers.ts inline mapper. */
function mapPgError(error: { code?: string; message?: string; details?: string }) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

// ----- GET / list -----
logisticsOrdersRouter.get("/", async (c) => {
  const parsed = listLogisticsOrdersQuery.safeParse({
    stage: c.req.query("stage") ?? undefined,
    channel: c.req.query("channel") ?? undefined,
    search: c.req.query("search") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { stage, channel, search } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, placed_at, delivery_date, delivery_partner_id, do_number, dispatched_at, delivered_at, showroom_id, dealer_id, dealers(name)",
    )
    .in("status", ["proceed_order", "delivered"]);

  if (stage !== "all") q = q.eq("logistics_stage", stage);
  if (channel === "dealers") q = q.eq("showroom_id", null);
  if (channel === "showrooms") q = q.not("showroom_id", "is", null);
  if (search) {
    const asInt = Number.parseInt(search, 10);
    if (Number.isFinite(asInt)) {
      q = q.or(`customer_name.ilike.%${search}%,dl.eq.${asInt}`);
    } else {
      q = q.ilike("customer_name", `%${search}%`);
    }
  }

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

// ----- GET /:id detail -----
logisticsOrdersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, customer_phone, customer_address, customer_address_unknown, delivery_date, delivery_date_tbd, placed_at, do_number, do_note, dispatched_at, delivered_at, delivery_partner_id, dealer_id, showroom_id, dealers(name), showrooms(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }

  const [linesRes, addonsRes, historyRes] = await Promise.all([
    sb.from("order_lines").select("sku, qty, unit_price").eq("order_id", id),
    sb.from("order_addons").select("sku, qty, unit_price").eq("order_id", id),
    sb.from("order_history").select("text, by_role, occurred_at").eq("order_id", id).order("occurred_at", { ascending: true }),
  ]);
  if (linesRes.error) { const m = mapPgError(linesRes.error); return c.json(m.body, m.status); }
  if (addonsRes.error) { const m = mapPgError(addonsRes.error); return c.json(m.body, m.status); }
  if (historyRes.error) { const m = mapPgError(historyRes.error); return c.json(m.body, m.status); }

  const lines = linesRes.data ?? [];
  const addons = addonsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = [...lines, ...addons].reduce((s: number, r: any) => s + Number(r.unit_price) * Number(r.qty), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warehouse: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockBalances: any[] = [];
  if (order.warehouse_id) {
    const { data: wh, error: e_wh } = await sb
      .from("warehouses")
      .select("id, name, address")
      .eq("id", order.warehouse_id)
      .maybeSingle();
    if (e_wh) { const m = mapPgError(e_wh); return c.json(m.body, m.status); }
    warehouse = wh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skus = lines.map((l: any) => l.sku);
    if (skus.length > 0) {
      const { data: sb_rows, error: e_sb } = await sb
        .from("stock_balances")
        .select("sku, warehouse_id, qty, reserved")
        .eq("warehouse_id", order.warehouse_id)
        .in("sku", skus);
      if (e_sb) { const m = mapPgError(e_sb); return c.json(m.body, m.status); }
      stockBalances = sb_rows ?? [];
    }
  }

  // Linked POs (own dl OR within dl_refs[]).
  const { data: pos, error: e_pos } = await sb
    .from("purchase_orders")
    .select("id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta")
    .or(`dl.eq.${order.dl},dl_refs.cs.{${order.dl}}`);
  if (e_pos) { const m = mapPgError(e_pos); return c.json(m.body, m.status); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poLinesByPo: Record<string, any[]> = {};
  if (pos && pos.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poIds = pos.map((p: any) => p.id);
    const { data: poLines, error: e_polines } = await sb
      .from("purchase_order_lines")
      .select("po_id, sku, qty, received_qty")
      .in("po_id", poIds);
    if (e_polines) { const m = mapPgError(e_polines); return c.json(m.body, m.status); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poLinesByPo = (poLines ?? []).reduce((acc: Record<string, any[]>, l: any) => {
      (acc[l.po_id] ??= []).push(l);
      return acc;
    }, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posWithLines = (pos ?? []).map((p: any) => ({ ...p, lines: poLinesByPo[p.id] ?? [] }));

  return c.json({
    order,
    lines,
    addons,
    total,
    warehouse,
    stockBalances,
    pos: posWithLines,
    history: historyRes.data ?? [],
  });
});

// ----- POST /:id/assign-partner -----
logisticsOrdersRouter.post("/:id/assign-partner", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = assignPartnerInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_assign_partner", {
    p_order_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/attach-do -----
logisticsOrdersRouter.post("/:id/attach-do", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = attachDoInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_attach_do_and_deliver", {
    p_order_id: c.req.param("id"),
    p_do_number: parsed.data.doNumber,
    p_do_note: parsed.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/abandon -----
logisticsOrdersRouter.post("/:id/abandon", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = abandonOrderInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_abandon_order", {
    p_order_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

export default logisticsOrdersRouter;
