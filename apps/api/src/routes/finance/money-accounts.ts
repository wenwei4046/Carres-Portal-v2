import { Hono, type Context } from "hono";
import {
  cardRouteInput,
  moneyAccountAddInput,
  moneyAccountUpdateInput,
  type CardRouteRow,
  type MoneyAccountRow,
} from "@carres/shared/money-accounts";
import { ledgerAccountCodeShape } from "@carres/shared/finance-ledger";
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
 *   GET    /          the list: code, name, kind, in use, card account (0576)
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

/** 0576 `_card_payout_holdings()`'s card methods. The test pins this to the SQL. */
const CARD_PAYMENT_METHODS = ["card", "credit_card", "debit_card"] as const;

financeMoneyAccountsRouter.get("/", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  // 0576: a card account is an account a card method maps to, or a routed
  // holding. These are the two reads of `_card_payout_holdings()`, the list
  // gl_money_move_create refuses a card payout from.
  const [list, mapped, routed] = await Promise.all([
    sb.rpc("gl_money_accounts_list"),
    sb.from("gl_payment_account_map").select("account_code").in("method", [...CARD_PAYMENT_METHODS]),
    sb.from("card_settlement_routes").select("holding_code"),
  ]);
  const error = list.error ?? mapped.error ?? routed.error;
  if (error) return fail(c, error);
  const card = new Set<string>([
    ...((mapped.data ?? []) as { account_code: string }[]).map((r) => r.account_code),
    ...((routed.data ?? []) as { holding_code: string }[]).map((r) => r.holding_code),
  ]);
  const rows = (list.data ?? []) as Omit<MoneyAccountRow, "is_card_account">[];
  return c.json(rows.map((r): MoneyAccountRow => ({ ...r, is_card_account: card.has(r.code) })));
});

financeMoneyAccountsRouter.post("/", requireFinance, async (c) => {
  const body = await parseJsonBody(c, moneyAccountAddInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  // 0577: a typed number goes up; none means the next free one under the heading.
  const { data, error } = await sb.rpc("gl_money_account_add", {
    p_name: body.data.name,
    p_kind: body.data.kind,
    p_code: body.data.code ?? null,
  });
  // The tag (code_needed, code_shape, code_exists) goes up as `code`, so the
  // form can show the Number field when the database asks for one.
  if (error) {
    const m = mapPgError(error);
    if (error.details && m.status !== 500) return c.json({ ...m.body, code: error.details }, m.status);
    return c.json(m.body, m.status);
  }
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
  if (!ledgerAccountCodeShape.test(code)) {
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
