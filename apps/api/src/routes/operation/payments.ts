import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Payments / collection panel (Jess — the Master Sheet "Balance" tab). Lists
 * every active order with its payment overlay from ops_order_control (balance
 * owing, payment_status, storage-fee start/override) + the item lines so the FE
 * can compute the storage fee (MS/BF RM150/month, SOF RM200/2 weeks) accruing
 * from the order ETA. Read-only here; edits reuse the existing sparse upsert
 * PUT /api/operation/orders/:id/control.
 *
 *   GET /api/operation/payments — list (active + delivered-but-owing orders)
 *
 * Mounted at /operation/payments in apps/api/src/index.ts.
 */
const paymentsRouter = new Hono<AppEnv>();

paymentsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("orders")
    // ops_order_control is a 1:1 overlay (its order_id PK FKs orders.id); the
    // PostgREST embed comes back as an array — the FE takes [0].
    // order_payments embed (0184) lets the FE net the ledger against the
    // balance + show what's been collected; the extra control cols carry the
    // due-date + storage-gate state for the overdue / collected badges.
    .select(
      "id, so, status, operation_stage, customer_name, customer_phone, customer_address, delivery_date, delivery_date_tbd, delivered_at, source_ref, order_lines(sku, qty), order_payments(amount, kind), ops_order_control(balance, payment_status, storage_from, storage_fee_override, balance_due_date, storage_collected_at, storage_waiver_status, extension_original_date, line_etas, line_stock_status, last_chased_at)",
    )
    .in("status", ["place", "proceed_order", "delivered"])
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ rows: data ?? [] });
});

export default paymentsRouter;
