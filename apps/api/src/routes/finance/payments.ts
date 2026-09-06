import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { paymentRegisterQuery } from "@carres/shared/payment-register";
import { APP_USERS, ORDER_PAYMENTS } from "@carres/shared/tables";
import {
  financePoPayInput,
  financePoScheduleInput,
  financeRecordReceiptInput,
  financeTopupApproveInput,
  paymentsListQuery,
} from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 5 Chunk A — Finance · Payments router.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.1.
 *
 * Mounted at `/api/finance/payments`. Per-route `requireFinance` guard
 * keeps the role gate at this router only — no blanket `use("*", ...)`
 * (per Phase 4.5 Chunk 2 carry-forward `route-mount-middleware-leak`
 * fix). The guard admits both `finance` and `principal` roles, mirroring
 * the SQL gate inside every Phase 5 RPC.
 *
 * Routes:
 *   GET  /                  list payments (filters: orderId, dealerId,
 *                           direction, from, to, limit). RLS already
 *                           restricts to finance/principal — userClient
 *                           passes the JWT, no service_role here.
 *   POST /topup-approve     finance_topup_approve(approval_id, method, ...)
 *                           Q1=A wrapper: approves the top_up approval +
 *                           inserts payment + bumps deposit_balance in a
 *                           single tx. Returns the new payments row.
 *   POST /order-receipt     finance_record_receipt(order_id, amount, ...)
 *                           AR drawer "Record receipt" panel. Inserts
 *                           inbound payment + bumps orders.paid.
 *   POST /po-pay            finance_po_pay(po_id, amount, method, reference)
 *                           AP drawer "Mark paid" / "Release payment".
 *                           Inserts outbound payment + flips
 *                           purchase_orders.pay_status='paid'. Migration
 *                           0063.
 *   POST /po-schedule       finance_po_schedule(po_id, scheduled_for)
 *                           AP drawer "Schedule payment". Flips
 *                           pay_status='unpaid' -> 'scheduled'. Migration
 *                           0063.
 */
const financePaymentsRouter = new Hono<AppEnv>();

// A Payment Register reads the canonical ledger, never order progress or AP.
// Keep voids and allocation evidence; an absent source is not a zero balance.
financePaymentsRouter.get("/register", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "finance", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "You cannot view payments." });
  }
  const parsed = paymentRegisterQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ message: "Choose a valid payment range." }, 422);
  const { offset, limit } = parsed.data;
  const sb = userClient(c.env, auth.jwt);
  const { data, error, count } = await sb
    .from(ORDER_PAYMENTS)
    .select("id,order_id,amount,paid_on,method,kind,reference,receipt_no,receipt_url,note,recorded_by,created_at,voided_at,voided_by,void_reason,orders(id,so,customer_name),payment_allocations(id,order_id,amount,allocated_at,voided_at)", { count: "exact" })
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || count == null || data == null) {
    throw new HTTPException(500, { message: "Payments could not be loaded. Try again." });
  }
  const actorIds = [...new Set(data.map((r) => r.recorded_by).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const actors = await sb.from(APP_USERS).select("id,name").in("id", actorIds);
    if (actors.error) throw new HTTPException(500, { message: "Payment history could not be loaded. Try again." });
    for (const actor of actors.data ?? []) names.set(actor.id, actor.name);
  }
  return c.json({ rows: data.map((row) => row.recorded_by
    ? { ...row, recorded_by_name: names.get(row.recorded_by) ?? null } : row), total: count });
});

financePaymentsRouter.get("/", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = paymentsListQuery.safeParse(
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
  let q = sb.from("payments").select("*").order("paid_at", { ascending: false });
  if (f.orderId)   q = q.eq("order_id", f.orderId);
  if (f.direction) q = q.eq("direction", f.direction);
  if (f.from)      q = q.gte("paid_at", f.from);
  if (f.to)        q = q.lte("paid_at", f.to);
  if (f.dealerId) {
    // payments doesn't have a dealer_id column — filter by joining orders.
    // Two-step: pull dealer's order ids first, then filter.
    const { data: ord, error: ordErr } = await sb
      .from("orders").select("id").eq("dealer_id", f.dealerId);
    if (ordErr) throw new HTTPException(500, { message: ordErr.message });
    const ids = (ord ?? []).map((r) => (r as { id: string }).id);
    if (ids.length === 0) return c.json([]);
    q = q.in("order_id", ids);
  }
  q = q.limit(f.limit ?? 200);

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

financePaymentsRouter.post("/topup-approve", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financeTopupApproveInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_topup_approve", {
    p_approval_id:  body.data.approvalId,
    p_method:       body.data.method,
    p_reference:    body.data.reference ?? null,
    p_receipt_url:  body.data.receiptUrl ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financePaymentsRouter.post("/order-receipt", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financeRecordReceiptInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_record_receipt", {
    p_order_id:  body.data.orderId,
    p_amount:    body.data.amount,
    p_method:    body.data.method,
    p_reference: body.data.reference ?? null,
    p_idempotency_key: body.data.idempotencyKey ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financePaymentsRouter.post("/po-pay", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financePoPayInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_po_pay", {
    p_po_id:     body.data.poId,
    p_amount:    body.data.amount,
    p_method:    body.data.method,
    p_reference: body.data.reference ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financePaymentsRouter.post("/po-schedule", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, financePoScheduleInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("finance_po_schedule", {
    p_po_id:         body.data.poId,
    p_scheduled_for: body.data.scheduledFor ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default financePaymentsRouter;
