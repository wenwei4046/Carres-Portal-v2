import { Hono, type Context } from "hono";
import {
  cardRouteInput,
  moneyAccountAddInput,
  moneyAccountUpdateInput,
  type CardRouteRow,
  type MoneyAccountRow,
} from "@carres/shared/money-accounts";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * FINANCE · MONEY ACCOUNTS — the one list of cash, bank and holding accounts
 * (migration 0512), kept on Finance → Settings.
 *
 * Mounted by `ledger.ts` at `/api/finance/ledger/money-accounts`: the list is
 * part of the chart, and `index.ts` is not this change's to edit.
 *
 *   GET    /          the list: code, name, kind, in use
 *   POST   /          add a bank or holding account → 201 { code }
 *   PATCH  /:code     rename, or take in or out of use → { code }
 *   GET    /card-routes   which bank each card holding account pays out to (0541)
 *   POST   /card-routes   set one route → the route
 *
 * Finance and principal, twice: `requireFinance` here, and each function's own
 * NULL-safe role check (42501). `userClient` forwards the caller's JWT, so
 * `auth.uid()` — who is recorded as having added or changed the account — is
 * the person who pressed. A database refusal keeps its own sentence.
 */
const financeMoneyAccountsRouter = new Hono<AppEnv>();

function fail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

financeMoneyAccountsRouter.get("/", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_money_accounts_list");
  if (error) return fail(c, error);
  return c.json((data ?? []) as MoneyAccountRow[]);
});

financeMoneyAccountsRouter.post("/", requireFinance, async (c) => {
  const body = await parseJsonBody(c, moneyAccountAddInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_money_account_add", { p_name: body.data.name, p_kind: body.data.kind });
  if (error) return fail(c, error);
  return c.json({ code: data as string }, 201);
});

financeMoneyAccountsRouter.get("/card-routes", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("card_settlement_routes").select("holding_code,channel,bank_code").order("holding_code");
  if (error) return fail(c, error);
  return c.json((data ?? []) as CardRouteRow[]);
});

financeMoneyAccountsRouter.post("/card-routes", requireFinance, async (c) => {
  const body = await parseJsonBody(c, cardRouteInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("card_settlement_route_set", {
    p_holding: body.data.holding_code,
    p_channel: body.data.channel,
    p_bank: body.data.bank_code,
  });
  if (error) return fail(c, error);
  return c.json(data as CardRouteRow);
});

financeMoneyAccountsRouter.patch("/:code", requireFinance, async (c) => {
  const code = c.req.param("code");
  if (!/^\d{4}$/.test(code)) {
    return c.json({ error: "not_found", code: "not_found", message: "That money account is not on the list." }, 404);
  }
  const body = await parseJsonBody(c, moneyAccountUpdateInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_money_account_update", {
    p_code: code,
    p_name: body.data.name,
    p_is_active: body.data.is_active,
  });
  if (error) return fail(c, error);
  return c.json({ code: data as string });
});

export default financeMoneyAccountsRouter;
