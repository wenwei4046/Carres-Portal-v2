import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  supplierMarkDeliveredInput,
  supplierPosListQuery,
} from "@carres/shared";
import { requireSupplier } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 — Supplier · Purchase Orders router.
 *
 * Spec: docs/superpowers/specs/2026-05-09-phase-6-supplier-spec.md §5.
 *
 * Mounted at `/api/supplier/pos`. Per-route `requireSupplier` guard keeps
 * the role gate at this router only — no blanket `use("*", ...)` (per
 * Phase 4.5 Chunk 2 carry-forward `route-mount-middleware-leak` fix
 * `cdc50fc`). RLS plus the cross-supplier guard inside each RPC provide
 * the second-layer scope check (po.supplier_id = app_supplier_id()).
 *
 * Routes:
 *   GET  /                              list this supplier's POs (RLS-scoped)
 *   GET  /:id                           get one PO (RLS-scoped)
 *   POST /:id/acknowledge               supplier_acknowledge (own_logistics)
 *   POST /:id/start-production          supplier_start_production
 *   POST /:id/ready-for-pickup          logistics_supplier_ready_confirm
 *                                       (existing 0034 RPC, supplier-callable)
 *   POST /:id/mark-delivered            supplier_mark_delivered (DO upload)
 */
const supplierPosRouter = new Hono<AppEnv>();

const PIPELINE_BUCKETS = {
  po: ["pending", "acknowledged", "in_production"] as const,
  ready: [
    "ready_for_pickup",
    // ready_confirm_sent is the actual post-press state for HoOKkA flows
    // (logistics_supplier_ready_confirm RPC, 0034:270) — it was missing from
    // the bucket which made the PO disappear from the supplier's view after
    // pressing "Mark Ready for Pickup". Surfaced 2026-05-09 by phase-6
    // E2E spec.
    "ready_confirm_sent",
    // partner_confirmed (0090 sofa flow) — partner WH owner accepted the
    // supplier-delivered goods; supplier now self-dispatches + marks
    // delivered. Without this entry the PO falls out of the supplier's
    // Ready-to-Pickup tab after partner accept, leaving HoOKkA with no
    // way to track it (Loo 2026-05-11 screenshot bug).
    "partner_confirmed",
    "pickup_assigned",
    "pickup_accepted",
    "shipped",
    "reassign_needed",
  ] as const,
  delivered: ["picked_up", "delivered"] as const,
} satisfies Record<"po" | "ready" | "delivered", readonly string[]>;

supplierPosRouter.get("/", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const parsed = supplierPosListQuery.safeParse(
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
  // 2026-05-10 (Loo) — embed purchase_order_lines so the supplier card can
  // render real SKU + qty + cascade attrs. Pre-fix this select was just `*`
  // and the legacy `purchase_orders.sku/.qty` columns it was reading were
  // dropped in migration 0017 when multi-line PO landed — every supplier
  // card showed blank UNITS and no SKU name.
  // 2026-05-11 (Loo) — embed destination warehouse + owning partner so the
  // supplier card can render "send to X (owned by partner Y)" — supplier
  // self-delivers and needs to know where the goods go. Two-level nested
  // select: warehouses.owning_partner_id → delivery_partners aliased
  // as `owner`. RLS via warehouses + delivery_partners read policies; both
  // already grant supplier-role read on rows referenced from PO they own.
  // 2026-05-15 (Task 6) — embed linked customer-leg threads + their orders'
  // delivery_date so the response can be enriched with customer_eta_min /
  // urgency / behind_schedule below. ost_supplier_read RLS (0033) admits
  // threads on POs the supplier owns.
  let q = sb
    .from("purchase_orders")
    .select(
      "*, " +
        "lines:purchase_order_lines(id, sku, qty, received_qty, attrs), " +
        "warehouses(id, name, address, kind, owning_partner_id, owner:delivery_partners(id, name, contact)), " +
        "threads:order_supplier_threads(id, order_id, orders(dl, delivery_date, customer_name))",
    )
    .order("placed_at", { ascending: false });
  if (f.bucket) {
    q = q.in("sup_status", PIPELINE_BUCKETS[f.bucket] as unknown as string[]);
  }

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });

  // 2026-05-15 (Task 6) — enrich each PO row with 4 computed fields:
  //   customer_eta_min — min(orders.delivery_date) across linked threads
  //   urgency          — bucket of days-until-customer-eta (<7 critical,
  //                      7-13 urgent, >=14 normal, null if no customer ETA)
  //   behind_schedule  — true when PO.eta_date is at/after the customer
  //                      promise (supplier won't make it in time)
  //   sku_summary      — deduped [{sku, qty}] from PO lines for tooltip /
  //                      mobile card display.
  // Inline (not extracted to helper) — same block lives in
  // apps/api/src/routes/partner/pickups.ts; abstracting at 2 callsites
  // would just shuffle complexity. Per Task 6 spec.
  const now = new Date();
  const rows = ((data ?? []) as unknown) as Array<Record<string, unknown>>;
  const enriched = rows.map((po) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threadEtas: string[] = (((po as any).threads ?? []) as any[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => t?.orders?.delivery_date)
      .filter((d: unknown): d is string => typeof d === "string" && d.length > 0);
    // ISO YYYY-MM-DD sorts lexicographically === chronologically.
    const customerEtaMin = threadEtas.length > 0 ? [...threadEtas].sort()[0] : null;
    const daysUntilCustomer = customerEtaMin
      ? Math.floor((new Date(customerEtaMin).getTime() - now.getTime()) / 86_400_000)
      : null;
    const urgency = computeUrgency(daysUntilCustomer);
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
      customer_eta_min: customerEtaMin,
      urgency,
      behind_schedule: behindSchedule,
      sku_summary: skuSummary,
    };
  });
  return c.json(enriched);
});

/**
 * Urgency bucket from days-until-customer-promise:
 *   null     → no customer ETA (stockpile / forecast PO)
 *   critical → < 7 days (red)
 *   urgent   → 7-13 days (amber)
 *   normal   → >= 14 days (green)
 *
 * Per Task 6 spec (docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md).
 */
function computeUrgency(
  daysUntil: number | null,
): "critical" | "urgent" | "normal" | null {
  if (daysUntil == null) return null;
  if (daysUntil < 7) return "critical";
  if (daysUntil < 14) return "urgent";
  return "normal";
}

supplierPosRouter.get("/:id", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select("*, lines:purchase_order_lines(id, sku, qty, received_qty, attrs)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "PO not found" }, 404);
  }
  return c.json(data);
});

/**
 * Task 10 (2026-05-15) — per-thread checklist source for the supplier
 * PODrawer. Returns one row per `order_supplier_threads` linked to this PO,
 * each row carrying its parent order's `dl` + customer + delivery date +
 * the per-order SKU lines (so the supplier sees what to build for each
 * customer). RLS via `ost_supplier_read` (0033) — supplier sees only
 * threads on POs they own.
 *
 * `supplier_ready_at` (0107) — non-null once supplier has marked thread
 * ready for pickup. `pickup_event_id` (0107) — non-null once the thread
 * has been picked up; thread becomes immutable from supplier's side at
 * that point (UI disables the checkbox).
 *
 * Two queries (threads + lines) instead of a single deep nested select
 * because order_lines is on `orders`, not `order_supplier_threads`; the
 * join would be 3 levels deep and Postgrest's nesting performance drops
 * sharply past 2 levels.
 */
supplierPosRouter.get("/:poId/threads", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const poId = c.req.param("poId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_supplier_threads")
    .select(
      "id, order_id, supplier_ready_at, pickup_event_id, orders(dl, customer_name, delivery_date)",
    )
    .eq("po_id", poId);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const orderIds = rows.map((r) => r.order_id).filter((id: unknown): id is string => typeof id === "string");
  const linesByOrder = new Map<string, Array<{ sku: string; qty: number }>>();
  if (orderIds.length > 0) {
    const { data: lines, error: e2 } = await sb
      .from("order_lines")
      .select("order_id, sku, qty")
      .in("order_id", orderIds);
    if (e2) {
      const m = mapPgError(e2);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of ((lines ?? []) as any[])) {
      const list = linesByOrder.get(l.order_id) ?? [];
      list.push({ sku: l.sku, qty: l.qty });
      linesByOrder.set(l.order_id, list);
    }
  }
  return c.json(
    rows.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      order_dl: r.orders?.dl ?? null,
      customer_name: r.orders?.customer_name ?? null,
      customer_delivery_date: r.orders?.delivery_date ?? null,
      supplier_ready_at: r.supplier_ready_at,
      pickup_event_id: r.pickup_event_id,
      sku_lines: linesByOrder.get(r.order_id) ?? [],
    })),
  );
});

supplierPosRouter.post("/:id/acknowledge", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_acknowledge", { p_po_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/start-production", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_start_production", {
    p_po_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/ready-for-pickup", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_supplier_ready_confirm", {
    p_po_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierPosRouter.post("/:id/mark-delivered", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const body = await parseJsonBody(c, supplierMarkDeliveredInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("supplier_mark_delivered", {
    p_po_id: id,
    p_do_number: body.data.doNumber,
    p_do_file_path: body.data.doFilePath,
    p_do_note: body.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default supplierPosRouter;
