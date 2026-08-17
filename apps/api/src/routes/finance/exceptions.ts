import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { financeExceptionClearInput, financeExceptionOpenInput } from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { autoIssueDeliveryOrder } from "../operation/order-control";
import type { AppEnv } from "../../types";

/**
 * FINANCE · EXCEPTIONS — the one money blocker on a delivery order.
 *
 * Owner ruling 2026-08-16 ("decision A"), `docs/orders/MASTER.md` §8, built as
 * Slice 1 of `docs/cards/CARD-2026-08-16-money-gate-correction.md`:
 *
 * ```
 * outstanding money does not block the DO
 * an OPEN Finance exception is the ONLY money blocker
 * OPEN     blocks the DO gate
 * CLEARED  removes the block
 * ```
 *
 * Mounted at `/api/finance/exceptions`.
 *
 *   GET  /:orderId          the exceptions on one order (any internal reader)
 *   POST /open              Finance opens one
 *   POST /:id/clear         Finance lifts it, with evidence
 *
 * The two acts are NAMED rather than sharing a bare `POST /`, matching the
 * sibling finance routers (`/create`, `/issue`, `/topup-approve`). Two doors,
 * two names, and neither can be reached by accident.
 *
 * TWO GUARDS, NOT ONE. `requireFinance` refuses the request at the edge and the
 * RPC refuses it again in the database (`app_role() not in ('finance',
 * 'principal') → 42501`). The middleware is the good error message; the RPC is
 * what makes "Finance, and only Finance" actually true — a caller reaching the
 * database another way still cannot write.
 *
 * THE READ IS DELIBERATELY WIDER THAN THE WRITE. Sales Orders, Delivery and the
 * route canvas all have to show WHY a delivery is held, so any internal role may
 * read (RLS `is_internal()`); none of them may write (Law A / Law C — one owner,
 * one door).
 *
 * NOTHING HERE READS MONEY. No balance, no outstanding figure, no storage fee.
 * An exception is a Finance judgement; owing money is a fact. Deriving one from
 * the other would rebuild the gate this ruling retired, under a new name.
 *
 * ⚠️ WIRED TO NO GATE YET, ON PURPOSE. Slice 3 points the issue gate, the action
 * engine and the canvas at this record in ONE change, because a canvas that
 * counts requirements the server does not is the screen telling a lie
 * (Architecture Law D). Building the blocker first is what keeps the delivery
 * order from being briefly ungated in between.
 */
const financeExceptionsRouter = new Hono<AppEnv>();

/** Every exception on one order, newest first. Read-only, any internal role. */
financeExceptionsRouter.get("/:orderId", async (c) => {
  const auth = c.var.auth;
  const orderId = c.req.param("orderId");

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_finance_exceptions")
    .select("*")
    .eq("order_id", orderId)
    .order("opened_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

/** Finance opens the block. The reason is required by the schema, the RPC and the table. */
financeExceptionsRouter.post("/open", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financeExceptionOpenInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_exception_open", {
    p_order_id: body.data.orderId,
    p_reason: body.data.reason,
  });

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

/**
 * Finance lifts the block, and says what closed it.
 *
 * The evidence is mandatory in three places — this schema, the RPC body and a
 * table constraint. That is not belt-and-braces for its own sake: a state a
 * human can change without saying why is exactly the hand-keyed
 * `payment_status` defect this repository already retired once (0347).
 */
financeExceptionsRouter.post("/:id/clear", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financeExceptionClearInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_exception_clear", {
    p_id: c.req.param("id"),
    p_evidence: body.data.evidence,
  });

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // ⭐ SLICE 2 — clearing the one money blocker is a gate flip, so the SYSTEM
  // issues the delivery order here if everything else was already ready
  // (owner ruling 2026-08-16, rule 12). Finance's own session carries the
  // write: `orders_dealer_update` admits the finance role, and the helper is
  // fail-soft by contract — a miss never turns a successful clear into an
  // error, and the fallback door plus the Work engine still stand.
  const orderId = (data as { order_id?: string } | null)?.order_id ?? null;
  const autoDeliveryOrder = orderId ? await autoIssueDeliveryOrder(sb, orderId) : null;

  return c.json({ ...(data as Record<string, unknown>), autoDeliveryOrder });
});

export default financeExceptionsRouter;
