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

/**
 * 2026-05-16 (Loo screenshot + migration 0114) — bucket membership is
 * derived from per-thread state for thread-linked POs; sup_status is only
 * a fallback for stockpile / forecast POs (no threads). A single PO can
 * therefore appear in BOTH the `po` and `ready` columns when partially
 * ticked — the supplier still has work to do on some SOs (showing in `po`)
 * AND has ready SOs waiting for the partner to come pick up (showing in
 * `ready`). Same card, different column subset.
 *
 * Stockpile fallback retained for legacy / no-thread POs (forecast / stock
 * replenishment): the supplier still needs the 3-column kanban to work
 * without a linked customer-leg thread.
 */
const STOCKPILE_FALLBACK = {
  po: ["pending", "acknowledged", "in_production"] as const,
  ready: [
    "ready_for_pickup",
    "ready_confirm_sent",
    "partner_confirmed",
    "pickup_assigned",
    "pickup_accepted",
    "partially_shipped",
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
  // 2026-05-16 (migration 0114) — `supplier_ready_at` + `pickup_event_id`
  // join the threads embed so we can compute thread_state_counts and derive
  // bucket membership without a sup_status filter. We pull all POs the
  // supplier owns (RLS already scopes via app_supplier_id()), then partition
  // them in JS — same PO can land in two buckets when partial. Total row
  // count is bounded by `purchase_orders` per supplier, which Loo has stated
  // is well under 100 active POs per supplier; no pagination needed.
  // 2026-05-16 (Loo screenshot + migration 0116) — orders is no longer
  // nested into the threads embed. Under orders_scoped_read RLS the
  // supplier role can't read orders directly, so the nested embed
  // returned null and urgency/customer_eta_min never rendered. Bulk
  // enrichment now goes through supplier_orders_for_threads RPC after
  // the main SELECT.
  const q = sb
    .from("purchase_orders")
    .select(
      "*, " +
        "lines:purchase_order_lines(id, sku, qty, received_qty, attrs), " +
        "warehouses(id, name, address, kind, owning_partner_id, owner:delivery_partners(id, name, contact)), " +
        "threads:order_supplier_threads(id, order_id, supplier_ready_at, pickup_event_id)",
    )
    .order("placed_at", { ascending: false });

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });

  // Enrich each thread.orders via SECURITY DEFINER RPC (0116). One round-trip
  // per request, scoped to this supplier internally.
  const orderIds: string[] = [];
  for (const po of ((data ?? []) as unknown as Array<Record<string, unknown>>)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (((po as any).threads ?? []) as any[])) {
      const oid = t?.order_id as string | null | undefined;
      if (oid) orderIds.push(oid);
    }
  }
  const orderInfo = new Map<string, { dl: number; customer_name: string; delivery_date: string | null }>();
  if (orderIds.length > 0) {
    const { data: oRows, error: oErr } = await sb.rpc("supplier_orders_for_threads", {
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
    // Splice RPC-fetched order info back onto each thread under `orders`
    // so the existing downstream shape (urgency / customer_eta_min / UI
    // rendering) stays unchanged.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const threads = (((po as any).threads ?? []) as any[]).map((t: any) => {
      const oid = t?.order_id as string | null | undefined;
      const info = oid ? orderInfo.get(oid) ?? null : null;
      return { ...t, orders: info };
    });
    const threadEtas: string[] = threads
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
    // 2026-05-16 — per-thread state buckets. `producing` = no supplier_ready
    // tick yet; `ready` = ticked but not picked; `picked` = partner pulled
    // it. UI subtitle ("3 of 4 still producing" / "1 of 4 ready") reads
    // these directly.
    let producing = 0;
    let ready = 0;
    let picked = 0;
    for (const t of threads) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tt = t as any;
      if (tt?.pickup_event_id) picked += 1;
      else if (tt?.supplier_ready_at) ready += 1;
      else producing += 1;
    }
    return {
      ...po,
      threads,
      customer_eta_min: customerEtaMin,
      urgency,
      behind_schedule: behindSchedule,
      sku_summary: skuSummary,
      thread_state_counts: { producing, ready, picked, total: threads.length },
    };
  });

  // Bucket categorization: thread-state-based for linked POs, sup_status
  // fallback for stockpile / forecast (no threads). Same PO can satisfy
  // multiple buckets — the caller filters by the active tab.
  function inBucket(po: typeof enriched[number], bucket: "po" | "ready" | "delivered"): boolean {
    const counts = po.thread_state_counts;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ss = (po as any).sup_status as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (po as any).status as string;
    // 2026-05-16 (Loo) — cancelled POs are out of the active kanban
    // entirely. Without this guard a cancelled stockpile PO sitting at
    // sup_status='ready_for_pickup' (legacy data, e.g. PO-2031) would
    // ghost-appear in the Ready column forever.
    if (status === "cancelled") return false;
    // Stockpile fallback — no threads on this PO, classify by sup_status.
    if (counts.total === 0) {
      return (STOCKPILE_FALLBACK[bucket] as readonly string[]).includes(ss);
    }
    // Terminal sup_status overrides thread state — a fully delivered PO
    // belongs nowhere except the `delivered` column even if some thread
    // states haven't been backfilled.
    if (ss === "delivered") return bucket === "delivered";
    if (bucket === "po") return counts.producing > 0;
    if (bucket === "ready") return counts.ready > 0;
    // bucket === "delivered" — every thread picked, none still in
    // production or ready.
    return counts.picked > 0 && counts.producing === 0 && counts.ready === 0;
  }

  const filtered = f.bucket
    ? enriched.filter((po) => inBucket(po, f.bucket as "po" | "ready" | "delivered"))
    : enriched;
  return c.json(filtered);
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
  // 2026-05-15 (Loo Phase 2 smoke) — switched to SECURITY DEFINER RPC because
  // the nested orders+order_lines join under supplier RLS triggered infinite
  // recursion (orders policy → threads → POs cycle). The RPC bypasses RLS,
  // gates internally on supplier_id = app_supplier_id().
  const { data, error } = await sb.rpc("supplier_threads_for_po", { p_po_id: poId });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? []);
});

/**
 * Task 13 (2026-05-15) — pickup history for a single PO. Returns every
 * `po_pickup_events` row tied to this PO, newest first, with a derived
 * `thread_count` counting the per-thread rows assigned to that event
 * (from `order_supplier_threads.pickup_event_id`).
 *
 * Powers the Pickup history section in the supplier PODrawer + the
 * Reprint DO button per row (the print payload itself is served from
 * `/api/pickup-events/:id/print`, browser-rendered). RLS via
 * `po_pickup_events_supplier_read` / `ost_supplier_read` (0107) — supplier
 * sees only events on POs they own.
 *
 * Two queries (events + linked threads) instead of a single nested select
 * because event rows have no native count column; pulling threads and
 * bucketing client-side keeps the response stable when a thread is later
 * re-pointed to a different event (Task 14 edge case).
 */
supplierPosRouter.get("/:poId/pickup-events", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const poId = c.req.param("poId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("po_pickup_events")
    .select("id, do_number, picked_up_at, ack_role")
    .eq("po_id", poId)
    .order("picked_up_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventIds = ((data ?? []) as any[]).map((r) => r.id as string);
  const counts = new Map<string, number>();
  if (eventIds.length > 0) {
    const { data: tcRows, error: e2 } = await sb
      .from("order_supplier_threads")
      .select("pickup_event_id")
      .in("pickup_event_id", eventIds);
    if (e2) {
      const m = mapPgError(e2);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of ((tcRows ?? []) as any[])) {
      const eid = t.pickup_event_id as string | null;
      if (!eid) continue;
      counts.set(eid, (counts.get(eid) ?? 0) + 1);
    }
  }
  return c.json(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data ?? []) as any[]).map((e) => ({
      ...e,
      thread_count: counts.get(e.id as string) ?? 0,
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
