import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
 * ap-aging added in migration 0063. Chunk B still owes: cashflow
 * (per-week series), monthly-pl, top-skus.
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

export default financeReportsRouter;
