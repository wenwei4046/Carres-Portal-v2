import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  partnerAcceptRfdInput,
  partnerRejectRfdInput,
  receivePoWithDoInput,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import type { DoTemplateData } from "../../lib/pdf/types";

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
  // round-trip. 2026-05-11 (Loo migration 0090) — partner can now own a PO
  // via either procurement_partner_id (factory-pickup assignment) OR
  // warehouse.owning_partner_id (own_logistics + partner-owned WH sofa
  // flow). RLS partner_sees_own_po already permits both paths; remove the
  // narrow `.eq("procurement_partner_id", ...)` so the kanban surfaces both.
  // supplier.kind is now in the SELECT so the UI can branch button labels
  // (Accept Pickup vs Accept Receive) per Loo's sofa-acceptance flow.
  // 2026-05-15 (Task 6) — embed linked customer-leg threads + their orders'
  // delivery_date so the response can be enriched with customer_eta_min /
  // urgency / behind_schedule. Mirrors the supplier/pos enrichment.
  //
  // 2026-05-16 (Loo screenshot + migration 0115) — drop the nested
  // `orders(...)` embed from threads. The orders_scoped_read policy admits
  // partners only when `orders.delivery_partner_id = app_partner_id()` (the
  // customer-leg LP), but procurement-leg partners legitimately need to read
  // these orders before the customer-leg LP is assigned. We fetch the order
  // info via the partner_orders_for_threads SECURITY DEFINER RPC instead
  // (same pattern as supplier_threads_for_po, 0111).
  // 2026-05-17 (Loo screenshot) — embed po_pickup_events so the drawer can
  // resolve each thread.pickup_event_id to its DO# / picked-at timestamp for
  // the "In transit" thread group. RLS policy pickup_events_partner_read
  // (0107:494) admits the procurement-leg partner via procurement_partner_id.
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      `
      id, dl, supplier_id, warehouse_id, sup_status, status, eta_date, placed_at,
      procurement_partner_id,
      suppliers(name, contact, kind),
      warehouses(name, address, kind, owning_partner_id),
      lines:purchase_order_lines(id, sku, qty, received_qty, attrs),
      threads:order_supplier_threads(id, order_id, supplier_ready_at, pickup_event_id),
      pickup_events:po_pickup_events(id, do_number, picked_up_at, departed_at)
    `,
    )
    .order("placed_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // Collect every thread's order_id across all POs, then one RPC round-trip
  // fetches dl / customer_name / delivery_date for those orders (scoped to
  // this partner's POs internally).
  const orderIds: string[] = [];
  for (const po of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (((po as any).threads ?? []) as any[])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oid = (t as any)?.order_id as string | null | undefined;
      if (oid) orderIds.push(oid);
    }
  }
  const orderInfo = new Map<string, { dl: number; customer_name: string; delivery_date: string | null }>();
  if (orderIds.length > 0) {
    const { data: oRows, error: oErr } = await sb.rpc("partner_orders_for_threads", {
      p_order_ids: orderIds,
    });
    if (oErr) {
      const m = mapPgError(oErr);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((oRows ?? []) as any[])) {
      orderInfo.set(String(r.id), {
        dl: Number(r.dl),
        customer_name: String(r.customer_name ?? ""),
        delivery_date: (r.delivery_date as string | null) ?? null,
      });
    }
  }

  // 2026-05-15 (Task 6) — enrich each PO row with 4 computed fields. Same
  // block as in apps/api/src/routes/supplier/pos.ts (2 callsites; inlined
  // per spec rather than extracted to a helper).
  const now = new Date();
  const enriched = rows.map((po) => {
    // Splice the RPC-fetched order info back onto each thread under
    // `orders` so the existing UI shape stays unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadsArr = (((po as any).threads ?? []) as any[]).map((t: any) => {
      const oid = t?.order_id as string | null | undefined;
      const info = oid ? orderInfo.get(oid) ?? null : null;
      return { ...t, orders: info };
    });
    const threadEtas: string[] = threadsArr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => t?.orders?.delivery_date)
      .filter((d: unknown): d is string => typeof d === "string" && d.length > 0);
    const customerEtaMin = threadEtas.length > 0 ? [...threadEtas].sort()[0] : null;
    const daysUntilCustomer = customerEtaMin
      ? Math.floor((new Date(customerEtaMin).getTime() - now.getTime()) / 86_400_000)
      : null;
    const urgency = computePartnerUrgency(daysUntilCustomer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const etaDate = (po as any).eta_date as string | null | undefined;
    const behindSchedule = !!(customerEtaMin && etaDate && etaDate >= customerEtaMin);
    const skuMap = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of (((po as any).lines ?? []) as any[])) {
      const sku = String(l?.sku ?? "");
      if (!sku) continue;
      skuMap.set(sku, (skuMap.get(sku) ?? 0) + Number(l?.qty ?? 0));
    }
    const skuSummary = [...skuMap.entries()].map(([sku, qty]) => ({ sku, qty }));
    return {
      ...po,
      threads: threadsArr,
      customer_eta_min: customerEtaMin,
      urgency,
      behind_schedule: behindSchedule,
      sku_summary: skuSummary,
    };
  });
  return c.json(enriched);
});

/**
 * Urgency bucket from days-until-customer-promise (Task 6, mirrors supplier).
 */
function computePartnerUrgency(
  daysUntil: number | null,
): "critical" | "urgent" | "normal" | null {
  if (daysUntil == null) return null;
  if (daysUntil < 7) return "critical";
  if (daysUntil < 14) return "urgent";
  return "normal";
}

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

// 2026-05-11 (Loo) — Sofa-acceptance flow (own_logistics suppliers shipping
// straight to a partner-owned warehouse). Migration 0090 reactivates
// partner_confirm_receive (was dropped by 0060) + extends ownership to
// include warehouse.owning_partner_id so partner WH owners get accept/reject
// rights at sup_status='ready_confirm_sent'.
//
//   accept → partner_confirmed → supplier dispatches
//   reject → customer_rejected → Logistics relocates warehouse
partnerPickupsRouter.post("/:id/confirm-receive", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_confirm_receive", {
    p_po_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

partnerPickupsRouter.post("/:id/reject-receive", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const reason = typeof raw?.reason === "string" ? raw.reason : "";
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_reject_customer", {
    p_po_id: c.req.param("id"),
    p_reason: reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * POST /api/partner/pickups/events/:eventId/collect — Loo 2026-05-17.
 *
 * Stamps `po_pickup_events.departed_at = now()` for the per-thread pickup
 * flow. Splits the legacy "Pickup Selected = booked + departed" collapse into
 * proto's 3 partner phases: SCHEDULED (DO booked) → IN TRANSIT (collected,
 * driving) → DELIVERED (arrived at WH).
 *
 * Wraps `partner_mark_pickup_collected` (migration 0119) which enforces the
 * procurement_partner_id cross-tenant gate inside SECURITY DEFINER.
 */
partnerPickupsRouter.post("/events/:eventId/collect", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_mark_pickup_collected", {
    p_event_id: c.req.param("eventId"),
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
//
// Kept around for the rare case where a partner driver wants to flag arrival
// without simultaneously filing the DO + counts. The new POST /:id/receive
// (Loo 2026-05-11) is the happy-path replacement that goes straight to
// status='received'.
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
 * POST /api/partner/pickups/:id/receive — Loo 2026-05-11
 *
 * Collapses the old two-step "Arrived at WH" → "Logistics Receive" flow into
 * one. Partner driver at the warehouse uploads the signed DO + ticks per-line
 * received_qty; the PO flips straight to status='received' (atomic).
 *
 * Wraps the same `logistics_receive_po_with_do` RPC the Logistics route uses
 * (migration 0076). The RPC's role gate already admits partners and verifies
 * `purchase_orders.procurement_partner_id = auth.app_partner_id()` — so a
 * cross-partner call returns 42501 → 403, matching the cross-partner guard
 * on /accept, /mark-picked-up, /arrived.
 *
 * Body shape: receivePoWithDoInput (camelCase, same as the logistics route)
 * — { doNumber, doFilePath, lines: [{ id, receivedQty }] }. Reshaped to
 * snake_case for the RPC's `p_lines` jsonb at the boundary.
 *
 * Logistics still has /api/logistics/pos/:id/receive (different auth gate)
 * for the Direct-receive escape hatch when DO arrives via supplier or
 * warehouse-direct channels (skipping the partner entirely).
 */
partnerPickupsRouter.post("/:id/receive", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }
  const parsed = await parseJsonBody(c, receivePoWithDoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_receive_po_with_do", {
    p_po_id: c.req.param("id"),
    p_do_file_path: parsed.data.doFilePath,
    p_do_number: parsed.data.doNumber,
    p_lines: parsed.data.lines.map((l) => ({
      id: l.id,
      received_qty: l.receivedQty,
    })),
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

/**
 * GET /api/partner/deliveries/:id/print-do-data — Loo 2026-05-13.
 *
 * Customer-facing DO data for the LP to print + take on the delivery run.
 * Mirrors GET /api/logistics/orders/:id/print-do-data shape but admits the
 * partner role and lets RLS narrow.
 *
 * Required state: order has do_number (set by 0098 trigger when status
 * transitions to dispatched). The driver prints the blank-but-numbered DO,
 * has the customer sign, then uploads the signed copy via the existing
 * POD attach flow.
 *
 * RLS check: the partner can read this order if they own the destination
 * warehouse OR they're the customer-leg delivery_partner_id on the
 * corresponding thread. The orders SELECT below uses userClient — RLS
 * narrows; if zero rows returned, return 404 instead of 403 to avoid
 * leaking enumeration.
 */
partnerPickupsRouter.get("/deliveries/:id/print-do-data", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Partner role only" });
  }
  const id = c.req.param("id");
  // 2026-05-13 (Loo) — orders_scoped_read RLS (0002:185) only admits a
  // partner via orders.delivery_partner_id, AND ost_partner_read (0033)
  // only admits via purchase_orders.procurement_partner_id. For sofa
  // direct-ship the customer-leg LP lives on order_supplier_threads.
  // delivery_partner_id (set by partner_confirm_receive/0096) — neither
  // policy admits this case. Same gap that 0071's SECURITY DEFINER RPC
  // works around. Use adminClient for the ownership check too; the
  // intrinsic WHERE delivery_partner_id = auth.partnerId is the gate.
  const sb = adminClient(c.env);
  const { data: ownThread, error: tErr } = await sb
    .from("order_supplier_threads")
    .select("id")
    .eq("order_id", id)
    .eq("delivery_partner_id", auth.partnerId)
    .maybeSingle();
  if (tErr) {
    const m = mapPgError(tErr);
    return c.json(m.body, m.status);
  }
  if (!ownThread) {
    // Either order doesn't exist, doesn't have a thread, or thread isn't
    // assigned to this partner. Same 404 either way — don't leak which.
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }

  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      "id, dl, status, do_number, do_note, customer_name, customer_phone, customer_address, dealer_id, warehouse_id, delivery_partner_id, placed_at, delivered_at, dealers(name, contact), warehouses(name, address), delivery_partners(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }
  if (!order.do_number) {
    return c.json(
      { error: "rule_violation", code: "do_missing", message: "DO is only printable after dispatch (no DO number assigned yet)" },
      422,
    );
  }

  const { data: lines, error: e2 } = await sb
    .from("order_lines")
    .select("sku, qty, unit_price")
    .eq("order_id", id);
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  const lineRows = lines ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skus: string[] = lineRows.map((l: any) => l.sku);
  const skuVariantBySku: Record<string, string> = {};
  if (skus.length > 0) {
    const { data: skuRows, error: e3 } = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    if (e3) {
      const m = mapPgError(e3);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (skuRows ?? []) as any[]) {
      skuVariantBySku[String(r.sku)] = String(r.variant);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  const issueIso = ord.delivered_at ?? ord.placed_at ?? new Date().toISOString();
  const issueDate = String(issueIso).slice(0, 10);

  const dealerRow = ord.dealers ?? null;
  const warehouseRow = ord.warehouses ?? null;
  const partnerRow = ord.delivery_partners ?? null;
  const customerAddress: string = ord.customer_address ?? "—";

  const dealerName: string = dealerRow?.name ?? "Carres";
  const dealerContactParts: string[] = [];
  if (dealerRow?.contact) dealerContactParts.push(String(dealerRow.contact));
  if (warehouseRow?.name) dealerContactParts.push(`Ship from: ${warehouseRow.name}`);
  const dealerContact: string | null = dealerContactParts.length > 0 ? dealerContactParts.join(" · ") : null;

  const templateData: DoTemplateData = {
    do_number: String(ord.do_number),
    issue_date: issueDate,
    order_id: String(ord.id),
    order_code: `SO-${ord.dl}`,
    customer: {
      name: String(ord.customer_name ?? ""),
      address: customerAddress,
      phone: ord.customer_phone ?? null,
    },
    dealer: {
      name: dealerName,
      contact: dealerContact,
    },
    partner: partnerRow?.name ? { name: String(partnerRow.name) } : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: lineRows.map((l: any) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      return {
        sku: String(l.sku),
        description: skuVariantBySku[l.sku] ?? String(l.sku),
        qty,
        unit: "pc",
        line_total: qty * unitPrice,
      };
    }),
    currency: "MYR",
  };

  return c.json(templateData);
});

export default partnerPickupsRouter;
