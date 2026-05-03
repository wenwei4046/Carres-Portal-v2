import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  inviteDealerInput,
  setDealerStatusInput,
} from "@carres/shared";
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
 * `code` in the body the frontend can branch on. The inline `mapPgError`
 * is duplicated from approvals.ts intentionally — extracting to a shared
 * helper is a separate cleanup commit.
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

/** SQLSTATE -> HTTP body+status. Mirrors approvals.ts inline mapper. */
function mapPgError(error: { code?: string; message?: string }) {
  switch (error.code) {
    case "42501":
      return {
        status: 403 as const,
        body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" },
      };
    case "42P01":
      return {
        status: 404 as const,
        body: { error: "not_found", code: "not_found", message: error.message ?? "not found" },
      };
    case "22023":
      return {
        status: 422 as const,
        body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" },
      };
    default:
      return {
        status: 500 as const,
        body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" },
      };
  }
}

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
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = inviteDealerInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
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
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = setDealerStatusInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
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
