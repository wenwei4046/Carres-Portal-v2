import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
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
 * POST /api/partner/pickups/:id/accept-rfd — Phase 4.5 Chunk 1 (Task 27).
 *
 * LP accepts a Request-For-Delivery (RFD) raised by Logistics on a PO. Calls
 * `partner_accept_dispatch` RPC (migration 0045) which:
 *   - Verifies caller is the assigned partner for the PO (auth.partnerId match)
 *   - Stores optional confirm_delivery_date for downstream visibility
 *   - Stamps partner_accepted_at + clears request_for_delivery_at
 *   - Advances per-thread logistics_stage so order rollup transitions
 *
 * SQLSTATE → HTTP via shared mapPgError helper:
 *   42501 → 403 (LP not assigned to this PO)
 *   22023 → 422 (RFD not pending / wrong status)
 *   P0001 → 422 (rule violation; detail surfaces as code)
 */
const acceptRfdSchema = z.object({
  confirm_delivery_date: z.string().date().optional(),
});

partnerPickupsRouter.post("/:id/accept-rfd", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role only" });
  }
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = acceptRfdSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_accept_dispatch", {
    p_po_id: id,
    p_confirm_delivery_date: parsed.data.confirm_delivery_date ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * POST /api/partner/pickups/:id/reject-rfd — Phase 4.5 Chunk 1 (Task 27).
 *
 * LP rejects a pending RFD. Calls `partner_reject_dispatch` (migration 0045)
 * which clears request_for_delivery_at and stamps partner_rejected_at + reason.
 * Logistics will see the rejection on their dashboard and may reassign or
 * relocate via the warehouse-relocate flow (Tasks 31-32).
 */
const rejectRfdSchema = z.object({
  reason: z.string().max(500).optional(),
});

partnerPickupsRouter.post("/:id/reject-rfd", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role only" });
  }
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = rejectRfdSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_reject_dispatch", {
    p_po_id: id,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default partnerPickupsRouter;
