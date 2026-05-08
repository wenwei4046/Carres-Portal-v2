import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  cashflowSeriesQuery,
  monthlyPlQuery,
  topSkusQuery,
} from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 5 Chunk A — Finance · Reports router.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.5.
 *
 * Mounted at `/api/finance/reports`. The two endpoints below cover the
 * Chunk A acceptance:
 *   - dashboard-summary feeds the FinanceDashboard 4 KPIs + 12-week
 *     cashflow card + AR aging card.
 *   - ar-aging feeds the AR page table + filter pills (rows include
 *     settled rows so the page's status filter doesn't need a second
 *     round-trip).
 *
 * Both wrap STABLE SECURITY DEFINER RPCs from migration 0062. Caller
 * forwards JWT via `userClient` so the SQL `app_role()` gate inside the
 * RPC sees the right session role; the per-route `requireFinance` guard
 * is the HTTP-layer mirror.
 *
 * ap-aging added in migration 0063. cashflow / monthly-pl / top-skus
 * added in migration 0064 (Chunk B).
 */
const financeReportsRouter = new Hono<AppEnv>();

financeReportsRouter.get("/dashboard-summary", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_dashboard_summary");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

financeReportsRouter.get("/ar-aging", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_ar_aging");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

financeReportsRouter.get("/ap-aging", requireFinance, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_ap_aging");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

financeReportsRouter.get("/cashflow", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = cashflowSeriesQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_cashflow_series", {
    p_weeks: parsed.data.weeks ?? 12,
  });
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
