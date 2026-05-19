import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import { mapPgError } from "../../lib/route-helpers";
import type { AppEnv } from "../../types";

/**
 * /api/bd/dealers — Phase 10 wakes BD's deferred Dealers + drill-down chain
 * from `reference/proto/bd-dealers.jsx` (Phase 8 only shipped Dashboard +
 * Inquiries). BD's role is `is_internal()` (per `is_internal` function in
 * migration 0002) so all reads against orders + dealers go through under
 * RLS without service_role. Routes mirror principal/dealers GET surface,
 * but never expose the POST invite/status routes (only principal mutates).
 *
 *   GET /                 — dealers list with PO+GMV+outstanding stats
 *   GET /:id              — single dealer + dealer's recent 30 orders
 *   GET /orders/:so       — single order detail (line items + addons)
 */
const bdDealersRouter = new Hono<AppEnv>();

bdDealersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "bd") {
    throw new HTTPException(403, { message: "BD only" });
  }
  await next();
});

// ---------- GET / ----------
bdDealersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealers_with_stats_list");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dealers = (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    region: d.region,
    contact: d.contact,
    status: d.status,
    joinedDate: d.joined_date,
    orderCount: Number(d.order_count ?? 0),
    gmv: Number(d.gmv ?? 0),
    outstanding: Number(d.outstanding ?? 0),
  }));
  return c.json({ dealers });
});

// ---------- GET /:id ----------
bdDealersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const dealerRes = await sb.rpc("dealer_with_stats", { p_id: id });
  if (dealerRes.error) {
    const m = mapPgError(dealerRes.error);
    return c.json(m.body, m.status);
  }
  if (
    !dealerRes.data ||
    (Array.isArray(dealerRes.data) && dealerRes.data.length === 0)
  ) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Dealer not found" },
      404,
    );
  }
  const dealer = Array.isArray(dealerRes.data) ? dealerRes.data[0] : dealerRes.data;

  // Pull recent 50 orders for the BD's drill-down table. We grab
  // `operation_stage` too so the FE can bucket them into Place / Process /
  // Delivery sections without a second round-trip.
  const ordersRes = await sb
    .from("orders")
    .select(
      "id, so, status, operation_stage, customer_name, paid, placed_at, delivery_date, order_lines(unit_price, qty), order_addons(unit_price, qty)",
    )
    .eq("dealer_id", id)
    .order("placed_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (ordersRes.error) {
    const m = mapPgError(ordersRes.error);
    return c.json(m.body, m.status);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = (ordersRes.data ?? []).map((o: any) => {
    const lineTotal = (o.order_lines ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, l: any) => s + Number(l.unit_price) * Number(l.qty),
      0,
    );
    const addonTotal = (o.order_addons ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, a: any) => s + Number(a.unit_price) * Number(a.qty),
      0,
    );
    const qtyTotal = (o.order_lines ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: number, l: any) => s + Number(l.qty),
      0,
    );
    return {
      id: o.id,
      so: o.so,
      status: o.status,
      operationStage: o.operation_stage,
      customerName: o.customer_name,
      paid: Number(o.paid ?? 0),
      total: lineTotal + addonTotal,
      qtyTotal,
      placedAt: o.placed_at,
      deliveryDate: o.delivery_date,
    };
  });

  return c.json({ dealer, orders });
});

// ---------- GET /activity — recent dealer-touching audit events ----------
bdDealersRouter.get("/activity", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "12", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 12, 1), 50);

  const auditRes = await sb
    .from("audit_log")
    .select("id, role, actor_text, action, dealer_id, ref, occurred_at")
    .not("dealer_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (auditRes.error) {
    const m = mapPgError(auditRes.error);
    return c.json(m.body, m.status);
  }

  const dealerIds = Array.from(
    new Set((auditRes.data ?? []).map((a) => a.dealer_id).filter(Boolean) as string[]),
  );
  const dealerMap = new Map<string, string>();
  if (dealerIds.length) {
    const dRes = await sb.from("dealers").select("id, name").in("id", dealerIds);
    (dRes.data ?? []).forEach((d) => dealerMap.set(d.id, d.name));
  }

  const rows = (auditRes.data ?? []).map((a) => ({
    id: a.id,
    role: a.role,
    actor: a.actor_text,
    action: a.action,
    dealerId: a.dealer_id,
    dealerName: a.dealer_id ? dealerMap.get(a.dealer_id) ?? null : null,
    occurredAt: a.occurred_at,
  }));
  return c.json({ rows });
});

// ---------- GET /orders/:so ----------
bdDealersRouter.get("/orders/:so", async (c) => {
  const soNum = Number.parseInt(c.req.param("so"), 10);
  if (!Number.isFinite(soNum)) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "Invalid SO" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, so, dealer_id, status, customer_name, customer_phone, customer_address, paid, placed_at, delivery_date, " +
        "order_lines(id, sku, attrs, qty, unit_price), " +
        "order_addons(id, kind, qty, unit_price), " +
        "order_history(id, kind, text, at, occurred_at, role, actor_text)",
    )
    .eq("so", soNum)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Order not found" },
      404,
    );
  }

  // Resolve dealer name for the header.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = data as any;
  let dealerName: string | null = null;
  if (order.dealer_id) {
    const dRes = await sb
      .from("dealers")
      .select("name")
      .eq("id", order.dealer_id)
      .maybeSingle();
    dealerName = dRes.data?.name ?? null;
  }

  const lineTotal = (order.order_lines ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, l: any) => s + Number(l.unit_price) * Number(l.qty),
    0,
  );
  const addonTotal = (order.order_addons ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: number, a: any) => s + Number(a.unit_price) * Number(a.qty),
    0,
  );

  return c.json({
    order: {
      id: order.id,
      so: order.so,
      dealerId: order.dealer_id,
      dealerName,
      status: order.status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerAddress: order.customer_address,
      paid: Number(order.paid ?? 0),
      total: lineTotal + addonTotal,
      lineTotal,
      addonTotal,
      placedAt: order.placed_at,
      deliveryDate: order.delivery_date,
      lines: order.order_lines ?? [],
      addons: order.order_addons ?? [],
      history: order.order_history ?? [],
    },
  });
});

export default bdDealersRouter;
