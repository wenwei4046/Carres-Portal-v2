import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import { mapPgError, fail } from "../../lib/route-helpers";
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
 *
 * BD sees DEALERS only (Loo 2026-07-25): every route here drops / 404s
 * Carres' own showroom-channel stores — BD's world is the external network.
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
  if (error) return fail(c, error);
  // Loo 2026-07-25 — BD sees DEALERS only: Carres' own showrooms are the
  // principal's world and stay entirely off the BD surface (this ONE list
  // feeds the BD board's store menu, the Accounts roster AND the POS
  // on-behalf picker). The stats RPC carries no `channel`, so pull it
  // alongside and DROP showroom rows. Fail closed: a broken channel read
  // must not silently leak showrooms in (or reclassify them as dealers).
  const chan = await sb.from("dealers").select("id, channel");
  if (chan.error) {
    const m = mapPgError(chan.error);
    return c.json(m.body, m.status);
  }
  const channelById = new Map<string, string>(
    (chan.data ?? []).map((r) => [r.id as string, (r.channel as string) ?? "dealer"]),
  );
  const dealers = (data ?? [])
    // Unknown id → 'dealer', matching the column's own DB default.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => channelById.get(d.id) !== "showroom")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      region: d.region,
      contact: d.contact,
      status: d.status,
      joinedDate: d.joined_date,
      orderCount: Number(d.order_count ?? 0),
      gmv: Number(d.gmv ?? 0),
      outstanding: Number(d.outstanding ?? 0),
      channel: "dealer",
    }));
  return c.json({ dealers });
});

// ---------- GET /activity — recent dealer-touching audit events ----------
// MUST register before /:id: Hono matches in registration order, and the
// param route would swallow the literal segment ("activity" → uuid cast 500 —
// exactly what happened from Phase 8 until 2026-07-18).
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
  const dealerMap = new Map<string, { name: string; channel: string | null }>();
  if (dealerIds.length) {
    // Channel rides along so showroom-touching events stay off the BD feed
    // (Loo 2026-07-25: BD sees dealers only). Fail closed on a broken read.
    const dRes = await sb.from("dealers").select("id, name, channel").in("id", dealerIds);
    if (dRes.error) {
      const m = mapPgError(dRes.error);
      return c.json(m.body, m.status);
    }
    (dRes.data ?? []).forEach((d) =>
      dealerMap.set(d.id, { name: d.name, channel: (d.channel as string) ?? "dealer" }),
    );
  }

  const rows = (auditRes.data ?? [])
    // Unknown id → treated as 'dealer' (the column default), same as the list.
    .filter((a) => !a.dealer_id || dealerMap.get(a.dealer_id)?.channel !== "showroom")
    .map((a) => ({
      id: a.id,
      role: a.role,
      actor: a.actor_text,
      action: a.action,
      dealerId: a.dealer_id,
      dealerName: a.dealer_id ? dealerMap.get(a.dealer_id)?.name ?? null : null,
      occurredAt: a.occurred_at,
    }));
  return c.json({ rows });
});

// ---------- GET /:id ----------
bdDealersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // A showroom id reads as not-found for BD (Loo 2026-07-25: BD sees dealers
  // only — the list never offers one, but the drill-down must not leak either).
  const chanRes = await sb.from("dealers").select("channel").eq("id", id).maybeSingle();
  if (chanRes.error) {
    const m = mapPgError(chanRes.error);
    return c.json(m.body, m.status);
  }
  if ((chanRes.data?.channel ?? "dealer") === "showroom") {
    return c.json(
      { error: "not_found", code: "not_found", message: "Dealer not found" },
      404,
    );
  }

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

export default bdDealersRouter;
