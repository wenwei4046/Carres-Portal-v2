import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { monthlyPlQuery, topSkusQuery } from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Finance · Reports router, mounted at `/api/finance/reports`.
 *
 * Each route forwards the caller's JWT through `userClient`, so the role gate
 * inside the SQL function sees the real caller. `requireFinance` is the same
 * gate at the HTTP layer.
 *
 * What is NOT here any more: `/dashboard-summary` and `/cashflow`. They read
 * `finance_dashboard_summary` and `finance_cashflow_series` (migrations
 * 0062/0064), which were written before the money convergence and count
 * money owed their own way. The Finance Dashboard now reads the two
 * canonical figures instead — customer Outstanding from the invoice register
 * and supplier Unpaid from `/api/finance/payables/outstanding` — through
 * `apps/web/src/pages/finance/money-owed.ts`. The SQL functions stay in the
 * database as history; nothing calls them.
 */
const financeReportsRouter = new Hono<AppEnv>();

// No route in the web app reaches this any more (the AR page reads the
// invoice register); kept because FinancePayments/FinanceInvoices still import its hook.
financeReportsRouter.get("/ar-aging", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_ar_aging");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// No route in the web app reaches this any more (/finance/ap redirects to
// /finance/ap-outstanding); kept because FinanceAP/APDrawer still import its hook.
financeReportsRouter.get("/ap-aging", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_ap_aging");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

financeReportsRouter.get("/monthly-pl", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = monthlyPlQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_monthly_pl", {
    p_months: parsed.data.months ?? 6,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

financeReportsRouter.get("/top-skus", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = topSkusQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_top_skus", {
    p_limit: parsed.data.limit ?? 8,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

export default financeReportsRouter;
