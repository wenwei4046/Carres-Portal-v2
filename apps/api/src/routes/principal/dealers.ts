import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  inviteDealerInput,
  setDealerStatusInput,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/principal/dealers — Principal dealer admin (list + detail + mutations).
 *
 * GET / — list with rolled-up stats (order_count, gmv, outstanding) via
 *   `dealers_with_stats_list` RPC. RPC is SECURITY DEFINER + manual
 *   `is_principal()` check; we belt-and-brace with a same-role guard for
 *   fast 403s without a Supabase round-trip.
 *
 * GET /:id — dealer detail + last 8 orders. Recent orders are computed
 *   client-side from embedded `order_lines/order_addons` (no extra RPC).
 *
 * POST /invite — idempotent dealer creation + new_dealer approval.
 * POST /:id/status — suspend/reactivate (active|suspended only).
 *
 * Error contract mirrors approvals.ts: SQLSTATE → HTTP status with stable
 * `code` in the body the frontend can branch on. Shared mapPgError +
 * parseJsonBody come from lib/route-helpers (Pre-M4 B1 extract).
 */
const principalDealersRouter = new Hono<AppEnv>();

// Inline principal-only guard (matches dashboard.ts/approvals.ts pattern).
principalDealersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  await next();
});

// ----- GET / list -----
principalDealersRouter.get("/", async (c) => {
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
    creditLimit: Number(d.credit_limit ?? 0),
    paymentTerms: d.payment_terms ?? "NET 30",
    depositBalance: Number(d.deposit_balance ?? 0),
    orderCount: Number(d.order_count ?? 0),
    gmv: Number(d.gmv ?? 0),
    outstanding: Number(d.outstanding ?? 0),
  }));
  return c.json({ dealers });
});

// ----- GET /:id detail -----
principalDealersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // 1. Fetch dealer (basic record).
  const { data: dealerRows, error: e1 } = await sb.rpc("dealer_with_stats", { p_id: id });
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!dealerRows || (Array.isArray(dealerRows) && dealerRows.length === 0)) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Dealer not found" },
      404,
    );
  }
  const dealer = Array.isArray(dealerRows) ? dealerRows[0] : dealerRows;

  // 2. Fetch last 8 orders with line/addon for total computation.
  const { data: ordRows, error: e2 } = await sb
    .from("orders")
    .select(
      "id, dl, status, customer_name, paid, placed_at, order_lines(unit_price, qty), order_addons(unit_price, qty)",
    )
    .eq("dealer_id", id)
    .order("placed_at", { ascending: false })
    .limit(8);
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentOrders = (ordRows ?? []).map((o: any) => {
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
    return {
      id: o.id,
      dl: o.dl,
      status: o.status,
      customerName: o.customer_name,
      paid: Number(o.paid ?? 0),
      total: lineTotal + addonTotal,
    };
  });

  return c.json({ dealer, recentOrders });
});

// ----- POST /invite -----
principalDealersRouter.post("/invite", async (c) => {
  const parsed = await parseJsonBody(c, inviteDealerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealer_invite", {
    p_name: parsed.data.name,
    p_region: parsed.data.region,
    p_contact: parsed.data.contact,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data); // { dealer, approval, idempotent }
});

// ----- POST /:id/status -----
principalDealersRouter.post("/:id/status", async (c) => {
  const parsed = await parseJsonBody(c, setDealerStatusInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("dealer_set_status", {
    p_dealer_id: c.req.param("id"),
    p_new_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ dealer: data });
});

export default principalDealersRouter;
