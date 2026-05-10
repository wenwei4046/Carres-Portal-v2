import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { partnerAcceptRfdInput, partnerRejectRfdInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/partner/pickups — Phase 4.5 Chunk 1 (Task 24).
 *
 * Returns the full list of purchase orders assigned to the authenticated
 * Logistics Partner (LP). Sorted by placed_at desc (newest first).
 *
 * Read path uses `userClient` (forwards caller JWT) so RLS on `purchase_orders`
 * applies. Migration 0046 LP-role RLS restricts to rows where
 * procurement_partner_id = auth.partnerId (column renamed from
 * `delivery_partner_id` in migration 0052; PO holds procurement-leg LP only).
 *
 * Phase 4.5 Chunk 2 Sprint C (migrations 0052/0053): the 4 customer-leg
 * columns (`confirm_delivery_date`, `request_for_delivery_at`,
 * `partner_accepted_at`, `partner_rejected_at`) were dropped from
 * `purchase_orders` — they now live on `order_supplier_threads` (added by
 * 0049, backfilled by 0050). The partner role is procurement-leg only;
 * customer-leg RFD UI for partners must source state from threads via
 * dedicated endpoints, not from this PO row.
 *
 * SELECT shape (NO `qty` — that column does not exist on purchase_orders;
 * line-item quantities live on purchase_order_lines):
 *   id, dl, supplier_id, warehouse_id, sup_status,
 *   delivery_partners(name)
 */
const partnerPickupsRouter = new Hono<AppEnv>();

partnerPickupsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  // 2026-05-10 (Loo) — embed lines + supplier + warehouse so the partner
  // detail drawer can render the full pickup brief without a second
  // round-trip. delivery_partners join was the legacy customer-leg join;
  // suppliers + warehouses are the actual procurement-leg context.
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      `
      id, dl, supplier_id, warehouse_id, sup_status, status, eta_date, placed_at,
      suppliers(name, contact),
      warehouses(name, address),
      lines:purchase_order_lines(id, sku, qty, attrs)
    `,
    )
    .eq("procurement_partner_id", auth.partnerId)
    .order("placed_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

// 2026-05-10 (Loo) — partner state-progression endpoints. Both wrap RPCs
// from migration 0080. ready_confirm_sent → pickup_accepted → picked_up,
// then the warehouse-side receive flow takes over.
partnerPickupsRouter.post("/:id/accept", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_accept_pickup", {
    p_po_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

partnerPickupsRouter.post("/:id/mark-picked-up", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_mark_picked_up", {
    p_po_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// 2026-05-10 (Loo) — third partner-side state transition. picked_up →
// delivered (sup_status only; status stays 'open' so the warehouse-side
// receive flow still has work to do). Wraps migration 0082 RPC.
partnerPickupsRouter.post("/:id/arrived", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_arrived_at_warehouse", {
    p_po_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * GET /api/partner/pickups/rfd-pending — carry-forward
 * `phase-4.5-chunk-2-partner-rfd-page-rebuild`.
 *
 * Lists customer-leg threads where Logistics has raised an RFD against this
 * partner and the partner has not yet accepted or rejected. Wraps the
 * SECURITY DEFINER RPC `logistics_partner_rfd_pending` (migration 0059)
 * which self-filters by `app_partner_id()` and joins `orders.customer_name`.
 *
 * Why an RPC and not a raw select: the existing `ost_partner_read` policy
 * on `order_supplier_threads` (0033:96-107) only admits rows on POs where
 * the partner is the procurement-leg LP (`purchase_orders.procurement_partner_id`).
 * A pure customer-leg LP cannot read their own threads via raw select —
 * the RPC is the one channel that surfaces them. See migration 0059
 * docstring for the full rationale.
 *
 * Returns array of:
 *   { thread_id, order_id, po_id, customer_name,
 *     request_for_delivery_at, confirm_delivery_date }
 *
 * Sort: most-recently-raised RFD first.
 *
 * Role guard: partner with partnerId only. Logistics / dealer / principal
 * receive 403.
 */
partnerPickupsRouter.get("/rfd-pending", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_partner_rfd_pending");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

/**
 * POST /api/partner/pickups/accept-rfd — Phase 4.5 Chunk 2 Sprint B (Task 7).
 *
 * LP accepts a Request-For-Delivery (RFD) raised by Logistics on an
 * `order_supplier_threads` row. Calls `logistics_partner_accept_rfd` RPC
 * (migration 0051) which:
 *   - Verifies caller is the assigned partner for the THREAD
 *     (thread.delivery_partner_id = auth.partnerId)
 *   - Verifies RFD is pending (request_for_delivery_at IS NOT NULL,
 *     no prior accept/reject stamp)
 *   - Stamps partner_accepted_at on the thread
 *   - Advances thread.logistics_stage to 'dispatched'
 *
 * Pivoted from Chunk 1's PO-scoped flow: the customer-leg RFD now lives on
 * the per-supplier thread row, not the PO. Body shape changes from
 * `{ confirm_delivery_date? }` (with :id = po_id path param) to `{ threadId }`.
 *
 * SQLSTATE → HTTP via shared mapPgError helper:
 *   42501 → 403 (LP not assigned to this thread)
 *   22023 → 422 (RFD not pending / wrong status)
 *   42P01 → 422 (thread not found)
 *   P0001 → 422 (rule violation; detail surfaces as code)
 */
/**
 * GET /api/partner/pickups/to-deliver — Phase 7 Sprint 1.
 *
 * Lists customer-leg threads where Logistics has dispatched and the partner
 * is now in transit / awaiting delivery. Sourced from
 * `order_supplier_threads` where:
 *   - delivery_partner_id = auth.app_partner_id() (RLS scopes per partner)
 *   - logistics_stage = 'dispatched'
 *
 * Used by PartnerPickupsPage to render the "In Transit" section + the
 * Mark Delivered button (POD upload flow).
 *
 * Joins orders.customer_name + orders.dl for display. RLS on
 * order_supplier_threads (`ost_partner_read` 0033:96) admits the partner
 * as procurement-leg owner; for customer-leg threads (delivery_partner_id =
 * me but procurement_partner_id may belong to a different partner), the
 * RPC pattern from rfd-pending is reused via a SECURITY DEFINER wrapper.
 */
partnerPickupsRouter.get("/to-deliver", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_threads_to_deliver");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

partnerPickupsRouter.post("/accept-rfd", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role only" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = partnerAcceptRfdInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_partner_accept_rfd", {
    p_thread_id: parsed.data.threadId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * POST /api/partner/pickups/reject-rfd — Phase 4.5 Chunk 2 Sprint B (Task 7).
 *
 * LP rejects a pending RFD on a thread. Calls `logistics_partner_reject_rfd`
 * (migration 0051) which clears request_for_delivery_at and stamps
 * partner_rejected_at on the thread. Per F9 invariant from Chunk 1, the LP
 * stays assigned (thread.delivery_partner_id is NOT cleared) so logistics
 * can re-RFD or relocate via DispatchPartnerDialog without a re-assignment
 * step. thread.logistics_stage stays at 'ready_to_dispatch'.
 *
 * Body shape: `{ threadId, reason? }`. Reason is audit-only (max 500 chars).
 */
partnerPickupsRouter.post("/reject-rfd", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role only" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = partnerRejectRfdInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_partner_reject_rfd", {
    p_thread_id: parsed.data.threadId,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default partnerPickupsRouter;
