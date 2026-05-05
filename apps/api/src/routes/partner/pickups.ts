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
 * delivery_partner_id = auth.partnerId.
 *
 * SELECT shape (NO `qty` — that column does not exist on purchase_orders;
 * line-item quantities live on purchase_order_lines):
 *   id, dl, supplier_id, warehouse_id, sup_status,
 *   confirm_delivery_date, request_for_delivery_at,
 *   partner_accepted_at, partner_rejected_at,
 *   delivery_partners(name)
 */
const partnerPickupsRouter = new Hono<AppEnv>();

partnerPickupsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      `
      id, dl, supplier_id, warehouse_id, sup_status,
      confirm_delivery_date, request_for_delivery_at,
      partner_accepted_at, partner_rejected_at,
      delivery_partners(name)
    `,
    )
    .eq("delivery_partner_id", auth.partnerId)
    .order("placed_at", { ascending: false });

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
