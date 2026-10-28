import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  openingAccountsInput,
  openingDepositsInput,
  openingPartyInput,
  openingPostInput,
  openingRemoveInput,
  openingReverseInput,
  openingStockInput,
} from "@carres/shared/opening-balances";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * FINANCE · OPENING BALANCES (migration 0705; Chew 2026-10-21/22,
 * docs/finance/MASTER.md §3.5 "Opening balances").
 *
 * Mounted at `/api/finance/opening-balances`, above the `/finance` catch-all.
 * Every call is ONE definer function that checks its caller; `requireFinance`
 * (and `requirePrincipal` on Post and Reverse) is the HTTP mirror, and
 * `userClient` forwards the caller's JWT so the database sees who pressed.
 *
 *   GET  /                    the whole draft, with its choices
 *   GET  /state               posted or not: the reports' `Brought forward`
 *   PUT  /accounts            the Accounts tab, whole        { lines, was }
 *   POST /parties             one party and its open items  { id?, …, was }
 *   POST /parties/:id/remove  one party off the list        { was }
 *   PUT  /stock               the Stock tab, whole           { rows, was }
 *   PUT  /deposits            the Customer deposits tab      { rows, was }
 *   POST /post                Post (principal)               { was }
 *   POST /reverse             Reverse (principal)            { reason }
 *
 * `was` is the draft's `updated_at` as read; a stale one is refused 409 and
 * the page reads again. The database's refusals are sentences a person can
 * act on (P0001 → 422, 40001 → 409, 42501 → 403) and are passed on as they are.
 */
const financeOpeningBalancesRouter = new Hono<AppEnv>();
const uuid = z.string().uuid();

const POST_FORBIDDEN = "Only the principal may post or reverse the opening balances.";

const requirePrincipal: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.auth?.role !== "principal") {
    return c.json({ error: "forbidden", code: "opening_forbidden", message: POST_FORBIDDEN }, 403);
  }
  await next();
};

function fail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  // A refusal keeps the database's own reason code, so the page can tell a
  // stale draft (opening_changed) from any other answer.
  if (error.details && m.status !== 500) return c.json({ ...m.body, code: error.details }, m.status);
  if (m.status === 500) return c.json({ ...m.body, message: "The opening balances could not be saved. Try again." }, 500);
  return c.json(m.body, m.status);
}

financeOpeningBalancesRouter.get("/", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_read");
  if (error) {
    const m = mapPgError(error);
    return c.json({ ...m.body, message: m.status === 403 ? m.body.message : "The opening balances could not be loaded. Try again." },
      m.status === 403 ? 403 : 500);
  }
  return c.json(data);
});

financeOpeningBalancesRouter.get("/state", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_state");
  if (error) return fail(c, error);
  return c.json(data);
});

financeOpeningBalancesRouter.put("/accounts", requireFinance, async (c) => {
  const body = await parseJsonBody(c, openingAccountsInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_accounts_save", {
    p_lines: body.data.lines.map((l) => ({ account_code: l.account_code, debit: l.debit ?? null, credit: l.credit ?? null })),
    p_was: body.data.was,
  });
  if (error) return fail(c, error);
  return c.json({ updated_at: data as string });
});

financeOpeningBalancesRouter.post("/parties", requireFinance, async (c) => {
  const body = await parseJsonBody(c, openingPartyInput);
  if (!body.ok) return c.json(body.body, body.status);
  const p = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_party_save", {
    p_row_id: p.id,
    p_party_type: p.party_type,
    p_party_id: p.party_id,
    p_account_code: p.account_code,
    p_total: p.total,
    p_items: p.items,
    p_was: p.was,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

financeOpeningBalancesRouter.post("/parties/:id/remove", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) {
    return c.json({ error: "not_found", code: "opening_row_missing", message: "That row is no longer on the list. Reload to see it." }, 404);
  }
  const body = await parseJsonBody(c, openingRemoveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_party_remove", { p_row_id: id, p_was: body.data.was });
  if (error) return fail(c, error);
  return c.json({ updated_at: data as string });
});

financeOpeningBalancesRouter.put("/stock", requireFinance, async (c) => {
  const body = await parseJsonBody(c, openingStockInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_stock_save", { p_rows: body.data.rows, p_was: body.data.was });
  if (error) return fail(c, error);
  return c.json(data);
});

financeOpeningBalancesRouter.put("/deposits", requireFinance, async (c) => {
  const body = await parseJsonBody(c, openingDepositsInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_deposits_save", {
    p_rows: body.data.rows.map((r) => ({ order_ref: r.order_ref, customer_ref: r.customer_ref ?? null, amount: r.amount })),
    p_was: body.data.was,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

financeOpeningBalancesRouter.post("/post", requireFinance, requirePrincipal, async (c) => {
  const body = await parseJsonBody(c, openingPostInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("fin_opening_post", { p_was: body.data.was });
  if (error) return fail(c, error);
  const id = typeof data === "string" ? data : null;
  const read = id ? await sb.from("gl_entries").select("entry_no").eq("id", id).maybeSingle() : null;
  const entryNo = read && !read.error ? ((read.data as { entry_no?: string | null } | null)?.entry_no ?? null) : null;
  return c.json({ id, entry_no: entryNo }, 201);
});

financeOpeningBalancesRouter.post("/reverse", requireFinance, requirePrincipal, async (c) => {
  const body = await parseJsonBody(c, openingReverseInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("fin_opening_reverse", { p_reason: body.data.reason });
  if (error) return fail(c, error);
  return c.json({ id: data as string });
});

export default financeOpeningBalancesRouter;
