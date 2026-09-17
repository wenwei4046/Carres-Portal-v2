import { Hono, type Context } from "hono";
import { z } from "zod";
import { moneyInCancelInput } from "@carres/shared/other-money-in";
import { moneyMoveInput } from "@carres/shared/money-moves";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Finance · money moves (migration 0529): bank transfers and card payouts.
 *
 * Mounted at `/api/finance/money-moves`, above the `/finance` catch-all. Each
 * call is ONE definer function that checks its caller; `requireFinance` is the
 * HTTP mirror, and `userClient` forwards the caller's JWT.
 *
 *   GET  /me              may this person approve? (the finance approver)
 *   GET  /                every move, newest first
 *   POST /                prepare one (posts nothing)
 *   POST /:id/approve     approve — posts it; not by the preparer
 *   POST /:id/reverse     a prepared move is cancelled, an approved one reversed
 *
 * A 403 keeps the database's reason code (preparer_cannot_approve …).
 */
const financeMoneyMovesRouter = new Hono<AppEnv>();
const uuid = z.string().uuid();

function fail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  if (m.status === 403 && error.details) return c.json({ ...m.body, code: error.details }, 403);
  return c.json(m.body, m.status);
}

function notFound(c: Context<AppEnv>) {
  return c.json({ error: "not_found", code: "not_found", message: "Money move not found." }, 404);
}

financeMoneyMovesRouter.get("/me", requireFinance, async (c) => {
  const auth = c.var.auth;
  const { data, error } = await userClient(c.env, auth.jwt).rpc("has_finance_approver", { p_user_id: auth.id });
  if (error) return fail(c, error);
  return c.json({ mayApprove: data === true });
});

financeMoneyMovesRouter.get("/", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("gl_money_move_list");
  if (error) return fail(c, error);
  return c.json(data ?? []);
});

financeMoneyMovesRouter.post("/", requireFinance, async (c) => {
  const body = await parseJsonBody(c, moneyMoveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const m = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("gl_money_move_create", {
    p_kind: m.kind,
    p_move_date: m.move_date,
    p_from_account_code: m.from_account_code,
    p_to_account_code: m.to_account_code,
    p_amount: m.amount,
    p_fee: m.fee,
    p_reference: m.reference?.trim() || null,
    p_note: m.note?.trim() || null,
    p_idempotency_key: m.idempotency_key,
  });
  if (error) return fail(c, error);
  return c.json({ id: data as string }, 201);
});

financeMoneyMovesRouter.post("/:id/approve", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("gl_money_move_approve", { p_move_id: id });
  if (error) return fail(c, error);
  return c.json({ id, entryId: data as string });
});

financeMoneyMovesRouter.post("/:id/reverse", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) return notFound(c);
  const body = await parseJsonBody(c, moneyInCancelInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await userClient(c.env, c.var.auth.jwt).rpc("gl_money_move_reverse", {
    p_move_id: id,
    p_reason: body.data.reason,
  });
  if (error) return fail(c, error);
  return c.json({ id });
});

export default financeMoneyMovesRouter;
