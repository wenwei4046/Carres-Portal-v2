import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  refundCreateInput,
  refundPayInput,
  refundsListQuery,
} from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 5 Chunk A — Finance · Refunds router.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.3.
 *
 * Mounted at `/api/finance/refunds`. Three Chunk A routes (create / pay /
 * list); Chunk B/C will add /apply for credit-note application against
 * future orders.
 *
 * Q5=A locked: keep CN/RF distinction.
 *   - kind=credit  -> CN-{N} prefix; status='approved' immediately (no
 *                     gate). Used to reduce a customer's balance on a
 *                     future order.
 *   - kind=refund  -> RF-{N} prefix; status='pending' if amount > 1000
 *                     (also creates approvals row kind='refund'); status
 *                     ='approved' immediately if amount <= 1000.
 *
 * Routes:
 *   GET    /          list refunds (status, dealerId, from, to filters)
 *   POST   /create    insert refunds row + (optional) approval row
 *   POST   /:id/pay   call refund_pay RPC (mark paid + outbound payment)
 */
const financeRefundsRouter = new Hono<AppEnv>();

financeRefundsRouter.get("/", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = refundsListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_query",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid query",
      },
      422,
    );
  }
  const f = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  let q = sb.from("refunds").select("*").order("created_at", { ascending: false });
  if (f.dealerId) q = q.eq("dealer_id", f.dealerId);
  if (f.status && f.status !== "all" && f.status !== "issued" && f.status !== "applied") {
    q = q.eq("status", f.status);
  }
  q = q.limit(f.limit ?? 200);

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

financeRefundsRouter.post("/create", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, refundCreateInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);

  // Read the source order for dl + dealer_id (needed for refunds.dealer_id
  // and approvals.refers_to format `DL-{dl}`).
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("dl, dealer_id, customer_name")
    .eq("id", body.data.orderId)
    .single();
  if (ordErr || !order) {
    return c.json(
      { error: "order_not_found", code: "not_found", message: ordErr?.message ?? "order not found" },
      404,
    );
  }
  const ord = order as { dl: number; dealer_id: string; customer_name: string };

  // Decide approval gate:
  //   kind=refund AND amount > 1000  -> needs principal approval (status=pending)
  //   kind=refund AND amount <= 1000 -> direct (status=approved)
  //   kind=credit                    -> direct (status=approved); credit-note
  //                                     stays as a balance against the dealer
  const needsApproval = body.data.kind === "refund" && body.data.amount > 1000;
  const initialStatus: "pending" | "approved" = needsApproval ? "pending" : "approved";

  const { data: refund, error: refErr } = await sb
    .from("refunds")
    .insert({
      order_id:    body.data.orderId,
      dealer_id:   ord.dealer_id,
      amount:      body.data.amount,
      reason:      body.data.reason,
      status:      initialStatus,
      approved_at: needsApproval ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (refErr) {
    const m = mapPgError(refErr);
    return c.json(m.body, m.status);
  }

  // For refunds > RM 1000, also create an approvals row so principal can
  // see + decide it. The existing 0016 approval_decide kind=refund
  // side-effect will flip refunds.status when principal acts.
  if (needsApproval) {
    const { error: appErr } = await sb.from("approvals").insert({
      kind:       "refund",
      title:      `Refund · RM ${body.data.amount.toFixed(2)} · ${body.data.reason.slice(0, 80)}`,
      actor:      auth.email,
      refers_to:  `DL-${ord.dl}`,
      amount:     body.data.amount,
      dealer_id:  ord.dealer_id,
      reason:     body.data.reason,
      status:     "pending",
      created_by: auth.id,
    });
    if (appErr) {
      // Approval insert failed — refund row already created; surface error
      // but keep the refund pending without an approval. Phase 5 V1
      // accepts the inconsistency; an admin can manually attach an
      // approval later. Future: wrap in finance_create_refund RPC for
      // atomicity (TODO follow-up).
      throw new HTTPException(500, { message: `refund created but approval failed: ${appErr.message}` });
    }
  }

  // Audit log
  await sb.from("audit_log").insert({
    role:       auth.role,
    actor_text: auth.email,
    action:     `Refund created · ${body.data.kind} · RM ${body.data.amount.toFixed(2)} · ${body.data.reason.slice(0, 100)}`,
    dealer_id:  ord.dealer_id,
    ref:        `DL-${ord.dl}`,
  });

  return c.json({
    refund,
    needsApproval,
  });
});

financeRefundsRouter.post("/:id/pay", requireFinance, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "refund id must be a uuid" },
      422,
    );
  }

  const body = await parseJsonBody(c, refundPayInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("refund_pay", {
    p_refund_id: id,
    p_method:    body.data.method,
    p_reference: body.data.reference ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default financeRefundsRouter;
