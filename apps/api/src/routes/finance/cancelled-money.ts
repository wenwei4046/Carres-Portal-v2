import { Hono } from "hono";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Finance · cancelled orders that still hold customer money (migration 0729).
 *
 * Mounted at `/api/finance/cancelled-money`, above the `/finance` catch-all.
 * READ ONLY: one definer function checks the caller; there is no write route,
 * because refund versus move is not decided (payment MASTER §13).
 */
const financeCancelledMoneyRouter = new Hono<AppEnv>();

financeCancelledMoneyRouter.get("/", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("finance_cancelled_orders_holding_money");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? []);
});

export default financeCancelledMoneyRouter;
