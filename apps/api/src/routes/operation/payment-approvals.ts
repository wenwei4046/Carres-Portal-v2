import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  paymentApprovalDecideInput,
  paymentApprovalRequestInput,
} from "@carres/shared";
import { attemptDeliveryOrderIssue } from "../../lib/delivery-order-issue";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE DELIVERY PAYMENT APPROVAL — the black-and-white door that opens the
 * money gate (owner ruling 2026-08-19, `docs/orders/MASTER.md` §8, 0362;
 * beside the Finance exception it mirrors, `finance/exceptions.ts`).
 *
 * Mounted at `/api/operation/payment-approvals`.
 *
 *   GET  /:orderId       the requests + decisions on one order (any internal reader)
 *   POST /:orderId       Operation / the salesperson raises a request, with its reason
 *   POST /:id/decide     the configured approver decides — approved | refused, with reason
 *
 * TWO GUARDS, NOT ONE — the RPCs are what make the law true: the request door
 * refuses any role outside operation / salesperson / principal, and the decide
 * door runs `delivery_payment_approver_gate()` (principal — Jess, today the
 * only approver — or the `delivery_payment_approver` duty, which is DATA, so
 * managers join later without a code change). No middleware guard is invented
 * here beyond authentication: the database refusal is the boundary, and the
 * route only translates it.
 *
 * RAISING CHANGES NOTHING ELSE (card §2). A raised request opens no gate.
 * An APPROVAL may complete the DO's requirement set, so — exactly like the
 * finance-clear door — the decide door lets the SYSTEM attempt the issue,
 * fail-soft, on the admin client: the approver's word opens the gate, but the
 * system, not the approver, writes the document.
 */
const paymentApprovalsRouter = new Hono<AppEnv>();

/** Every request/decision on one order, newest first. Read-only, any internal role. */
paymentApprovalsRouter.get("/:orderId", async (c) => {
  const auth = c.var.auth;
  const orderId = c.req.param("orderId");

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_delivery_payment_approvals")
    .select("*")
    .eq("order_id", orderId)
    .order("requested_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

/** Operation or the salesperson asks. Reason required — schema, RPC and table. */
paymentApprovalsRouter.post("/:orderId", async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, paymentApprovalRequestInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("delivery_payment_approval_request", {
    p_order_id: c.req.param("orderId"),
    p_reason: body.data.reason,
  });

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

/**
 * The approver's word. `approved` authorises COD on the owner's exact terms —
 * full balance by online transfer BEFORE unloading, no cash; `refused` keeps
 * the gate shut. One decision, forever; the reason is required in the schema,
 * the RPC and the table constraint.
 */
paymentApprovalsRouter.post("/:id/decide", async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, paymentApprovalDecideInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("delivery_payment_approval_decide", {
    p_id: c.req.param("id"),
    p_decision: body.data.decision,
    p_reason: body.data.reason,
  });

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // An APPROVAL may have been the LAST open requirement, and the ruling says
  // the SYSTEM issues the document the moment they all hold (§8: no Release
  // button, no manual bypass). Admin client, fail-soft — the same shape as the
  // finance-clear hook, for the same reason.
  const decided = data as { order_id?: string; status?: string } | null;
  if (decided?.status === "approved" && decided.order_id) {
    try {
      await attemptDeliveryOrderIssue(adminClient(c.env), decided.order_id);
    } catch {
      // Not issued yet — the facts persist; the next door or the manual
      // backstop issues it.
    }
  }

  return c.json(data);
});

export default paymentApprovalsRouter;
