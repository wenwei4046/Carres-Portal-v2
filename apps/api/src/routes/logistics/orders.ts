import { Hono } from "hono";
import {
  abandonOrderInput,
  assignPartnerInput,
  attachDoInput,
  confirmProceedRequestInputSchema,
  issuePosForOrderInput,
  listLogisticsOrdersQuery,
  recheckStockInput,
  transferReadyInputSchema,
  warehousePickInput,
} from "@carres/shared";
// renderDoPdf moved to apps/web/src/lib/pdf/render.ts (Workers WASM ban).
import type { DoTemplateData } from "../../lib/pdf/types";
import { requireLogistics, requireLogisticsOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/orders — Phase 4 backend orders subsystem.
 *
 * M2 endpoints (list + drawer + actions):
 *   GET    /                       — list with stage/channel/search filters
 *   GET    /:id                    — drawer detail
 *   POST   /:id/assign-partner     — D1 dispatch step 1
 *   POST   /:id/attach-do          — D1 dispatch step 2 (logistics_attach_do_and_deliver)
 *   POST   /:id/abandon            — A6 post-proceed cancel
 *   POST   /:id/warehouse          — warehouse pick
 *   POST   /:id/recheck-stock      — E1 re-check stock
 *
 * M3 endpoint:
 *   POST   /:id/issue-pos          — auto-issue POs for shortages
 *
 * M4 endpoint:
 *   GET    /:id/print-do           — server-side DO PDF (E2 / spec §17.3)
 *
 * Auth: every route guards with `requireLogistics` per-route — NOT a blanket
 * `use("*", ...)` middleware. The blanket pattern leaks across sibling sub-
 * routers mounted at the same path (`resumeDispatchRouter`) and silently
 * 403's traffic the sibling intends to admit (principal). See
 * `lib/auth-guards.ts` docstring + carry-forward
 * `phase-4.5-chunk-2-route-mount-middleware-leak` for the full rationale.
 *
 * Pattern: matches apps/api/src/routes/principal/dealers.ts (multi-endpoint
 * router with per-route role guard + shared mapPgError/parseJsonBody from
 * lib/route-helpers).
 */
const logisticsOrdersRouter = new Hono<AppEnv>();

/**
 * Pipeline v2 error mapping. Wraps the generic `mapPgError` to expose the
 * 22023 detail code (`wrong_stage` / `warehouse_required`) and, for P0001
 * `insufficient_stock_for_reserve`, pass through the RPC's `hint`
 * ("sku=… warehouse_id=…") so the UI can name the offending pair.
 *
 * The default `mapPgError` collapses 22023 to a generic `invalid_param`
 * code; pipeline v2 contracts (spec §5, migration 0024:354-414) require the
 * actual detail value to surface so the FE can branch on it.
 */
function mapPipelineV2Error(error: { code?: string; message?: string; details?: string; hint?: string }) {
  if (error.code === "22023") {
    return {
      status: 422 as const,
      body: {
        error: "rule_violation",
        code: error.details ?? "invalid_param",
        message: error.message ?? "rule violation",
      },
    };
  }
  if (error.code === "P0001" && error.details === "insufficient_stock_for_reserve") {
    return {
      status: 422 as const,
      body: {
        error: "rule_violation",
        code: error.details,
        message: error.message ?? "insufficient stock to reserve",
        hint: error.hint ?? null,
      },
    };
  }
  return mapPgError(error);
}

// ----- GET / list -----
logisticsOrdersRouter.get("/", requireLogistics, async (c) => {
  const parsed = listLogisticsOrdersQuery.safeParse({
    stage: c.req.query("stage") ?? undefined,
    channel: c.req.query("channel") ?? undefined,
    search: c.req.query("search") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { stage, channel, search } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  // Phase 4.5 Chunk 2 (T9): customer-leg LP fields now live on
  // `order_supplier_threads` (migration 0049 added the columns; 0050 backfilled
  // them from PO). FE OrderCard reads `threads[].delivery_partner_id` instead
  // of order-level `delivery_partner_id` to surface the LP pill. Embedding via
  // PostgREST nested fetch keeps the round-trip count at 1; threads come back
  // as an array per order. The order-level `delivery_partner_id` is kept for
  // print-DO + legacy callers (no change here).
  let q = sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, placed_at, delivery_date, delivery_partner_id, do_number, dispatched_at, delivered_at, outlet_id, dealer_id, dealers(name), order_supplier_threads(id, supplier_id, category, logistics_stage, po_id, delivery_partner_id, confirm_delivery_date, request_for_delivery_at, partner_accepted_at, partner_rejected_at)",
    )
    // Pipeline v2 (C3): include `status='place'` rows so the FE kanban can
    // render the "Placed" column. proceed_order + delivered preserved as
    // before; existing M2 tests still pass.
    .in("status", ["place", "proceed_order", "delivered"]);

  if (stage === "placed") {
    // 'placed' is a synthetic stage derived from `status='place'` (pre-push
    // orders may have NULL logistics_stage or 'placed' depending on whether
    // they were seeded post-0024). Filter on status, not stage.
    q = q.eq("status", "place");
  } else if (stage !== "all") {
    q = q.eq("logistics_stage", stage);
  }
  // Public 'channel' enum kept as 'dealers'|'showrooms' per spec §18.3 (Loo-facing wording).
  // Internally maps to outlet_id IS [NOT] NULL — schema column is outlet_id, not showroom_id.
  if (channel === "dealers") q = q.is("outlet_id", null);
  if (channel === "showrooms") q = q.not("outlet_id", "is", null);
  if (search) {
    const asInt = Number.parseInt(search, 10);
    if (Number.isFinite(asInt)) {
      q = q.or(`customer_name.ilike.%${search}%,dl.eq.${asInt}`);
    } else {
      q = q.ilike("customer_name", `%${search}%`);
    }
  }

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

// ----- GET /:id detail -----
logisticsOrdersRouter.get("/:id", requireLogistics, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, customer_phone, customer_address, customer_address_unknown, delivery_date, delivery_date_tbd, placed_at, do_number, do_note, dispatched_at, delivered_at, delivery_partner_id, dealer_id, outlet_id, invoice_no, invoiced_at, paid, dealers(name), outlets(name)",
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

  // Phase 4.5 Chunk 2 (T9): fetch per-supplier threads for customer-leg LP
  // surfacing. Threads carry the customer-leg fields (`delivery_partner_id`,
  // `confirm_delivery_date`, `request_for_delivery_at`, `partner_accepted_at`,
  // `partner_rejected_at`) that previously lived on the PO. Drawer reads
  // `threads[].delivery_partner_id` for the partner-assignment hint.
  const [linesRes, addonsRes, historyRes, threadsRes] = await Promise.all([
    // 2026-05-10 (Loo) — also pull `attrs` so the OrderDetailDrawer's
    // "+ Issue POs" navigate-to-procurement flow can carry color/gap/fabric
    // into CreatePOModal's cascade picker without a second round-trip.
    sb.from("order_lines").select("sku, qty, unit_price, attrs").eq("order_id", id),
    sb.from("order_addons").select("addon_key, qty, unit_price").eq("order_id", id),
    sb.from("order_history").select("text, by_role, occurred_at").eq("order_id", id).order("occurred_at", { ascending: true }),
    sb
      .from("order_supplier_threads")
      .select(
        "id, supplier_id, category, logistics_stage, po_id, delivery_partner_id, confirm_delivery_date, request_for_delivery_at, partner_accepted_at, partner_rejected_at",
      )
      .eq("order_id", id),
  ]);
  if (linesRes.error) { const m = mapPgError(linesRes.error); return c.json(m.body, m.status); }
  if (addonsRes.error) { const m = mapPgError(addonsRes.error); return c.json(m.body, m.status); }
  if (historyRes.error) { const m = mapPgError(historyRes.error); return c.json(m.body, m.status); }
  if (threadsRes.error) { const m = mapPgError(threadsRes.error); return c.json(m.body, m.status); }

  const lines = linesRes.data ?? [];
  const addons = addonsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = [...lines, ...addons].reduce((s: number, r: any) => s + Number(r.unit_price) * Number(r.qty), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warehouse: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockBalances: any[] = [];
  if (order.warehouse_id) {
    const { data: wh, error: e_wh } = await sb
      .from("warehouses")
      .select("id, name, address")
      .eq("id", order.warehouse_id)
      .maybeSingle();
    if (e_wh) { const m = mapPgError(e_wh); return c.json(m.body, m.status); }
    warehouse = wh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skus = lines.map((l: any) => l.sku);
    if (skus.length > 0) {
      const { data: sb_rows, error: e_sb } = await sb
        .from("stock_balances")
        .select("sku, warehouse_id, qty, reserved")
        .eq("warehouse_id", order.warehouse_id)
        .in("sku", skus);
      if (e_sb) { const m = mapPgError(e_sb); return c.json(m.body, m.status); }
      stockBalances = sb_rows ?? [];
    }
  }

  // Linked POs (own dl OR within dl_refs[]).
  const { data: pos, error: e_pos } = await sb
    .from("purchase_orders")
    .select("id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date")
    .or(`dl.eq.${order.dl},dl_refs.cs.{${order.dl}}`);
  if (e_pos) { const m = mapPgError(e_pos); return c.json(m.body, m.status); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poLinesByPo: Record<string, any[]> = {};
  if (pos && pos.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poIds = pos.map((p: any) => p.id);
    const { data: poLines, error: e_polines } = await sb
      .from("purchase_order_lines")
      .select("id, po_id, sku, qty, received_qty, attrs")
      .in("po_id", poIds);
    if (e_polines) { const m = mapPgError(e_polines); return c.json(m.body, m.status); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poLinesByPo = (poLines ?? []).reduce((acc: Record<string, any[]>, l: any) => {
      (acc[l.po_id] ??= []).push(l);
      return acc;
    }, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posWithLines = (pos ?? []).map((p: any) => ({ ...p, lines: poLinesByPo[p.id] ?? [] }));

  return c.json({
    order,
    lines,
    addons,
    total,
    warehouse,
    stockBalances,
    pos: posWithLines,
    history: historyRes.data ?? [],
    threads: threadsRes.data ?? [],
  });
});

// ----- GET /:id/print-do -----
// Server-side DO PDF (E2 / spec §17.3). Only callable on delivered orders
// (those have a signed DO attached via logistics_attach_do_and_deliver).
// Returns application/pdf with attachment Content-Disposition.
// 2026-05-12 (Loo): renamed `/print-do` → `/print-do-data`. Returns JSON;
// browser renders @react-pdf locally (Workers WASM ban).
logisticsOrdersRouter.get("/:id/print-do-data", requireLogistics, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // Fetch order + dealer/warehouse/partner in one round-trip via embedded resources.
  // dealers / warehouses / delivery_partners are FK'd from orders, so PostgREST
  // auto-detects the embedding. order_lines.sku is NOT FK'd to product_skus —
  // SKU descriptions come from a separate query below.
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

  // 2026-05-13 (Loo) — DO printable from dispatched onward.
  // Pre-0098 the rule required status='delivered' (the legacy
  // logistics_attach_do_and_deliver flow set do_number only at delivery).
  // 0098's BEFORE-UPDATE trigger now auto-assigns do_number when an order
  // transitions to logistics_stage='dispatched' so LP drivers can print
  // the blank customer-DO at dispatch time and the customer signs it on
  // arrival. Only do_number is required; status may be 'place'/'proceed_order'/'received'
  // depending on which lifecycle column the kanban reads (logistics_stage is the truth).
  if (!order.do_number) {
    return c.json(
      { error: "rule_violation", code: "do_missing", message: "DO is only printable after dispatch (no DO number assigned yet)" },
      422,
    );
  }

  // Lines + SKU descriptions (separate queries — order_lines.sku has no FK to product_skus).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    for (const r of skuRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skuVariantBySku[(r as any).sku] = (r as any).variant;
    }
  }

  // Map DB rows → DoTemplateData. Currency values are MYR major units (per types.ts contract).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  // Issue date: prefer delivered_at (when DO was attached), fall back to placed_at. ISO yyyy-mm-dd.
  const issueIso = ord.delivered_at ?? ord.placed_at ?? new Date().toISOString();
  const issueDate = String(issueIso).slice(0, 10);

  const dealerRow = ord.dealers ?? null;
  const warehouseRow = ord.warehouses ?? null;
  const partnerRow = ord.delivery_partners ?? null;

  // customer_address may be null (customer_address_unknown=true on TBD/showroom orders);
  // template requires a string so coerce to "—" placeholder.
  const customerAddress: string = ord.customer_address ?? "—";

  // Dealer block: inject warehouse address line if present, since the DO ships
  // FROM the dealer-affiliated HQ warehouse — useful as a "ship from" hint
  // for the customer when there's no other origin shown.
  const dealerName: string = dealerRow?.name ?? "Carres";
  const dealerContactParts: string[] = [];
  if (dealerRow?.contact) dealerContactParts.push(String(dealerRow.contact));
  if (warehouseRow?.name) dealerContactParts.push(`Ship from: ${warehouseRow.name}`);
  const dealerContact: string | null = dealerContactParts.length > 0 ? dealerContactParts.join(" · ") : null;

  const templateData: DoTemplateData = {
    do_number: String(ord.do_number),
    issue_date: issueDate,
    order_id: String(ord.id),
    // Order code shown to dealer = `SO-${dl}` (matches existing UI conventions).
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

// ----- POST /:id/assign-partner -----
logisticsOrdersRouter.post("/:id/assign-partner", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, assignPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_assign_partner", {
    p_order_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/attach-do -----
logisticsOrdersRouter.post("/:id/attach-do", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, attachDoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_attach_do_and_deliver", {
    p_order_id: c.req.param("id"),
    p_do_number: parsed.data.doNumber,
    p_do_note: parsed.data.doNote ?? null,
    p_signed: parsed.data.signed,
    p_do_file_path: parsed.data.doFilePath,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/abandon -----
logisticsOrdersRouter.post("/:id/abandon", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, abandonOrderInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_abandon_order", {
    p_order_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/warehouse -----
logisticsOrdersRouter.post("/:id/warehouse", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, warehousePickInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_warehouse_pick", {
    p_order_id: c.req.param("id"),
    p_warehouse_id: parsed.data.warehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/confirm-proceed -----
// Phase 4.5a T4 (v3 swap): now calls `logistics_confirm_proceed_request_v3`
// (migrations 0034 + 0039). v3 takes ONLY `p_order_id` — the warehouse
// decision moved into the RPC body (auto-skip-from-stock picks an `own`
// warehouse, else threads stay at awaiting_logistics_action).
//
// `warehouseId` stays in the request schema for backward-compat with FE
// callers built against the v2 contract; the field is intentionally ignored
// at the RPC layer (Option A in the T4 plan). T5 (FE rename) may remove it
// from the schema once no caller forwards it.
//
// Error mapping (overrides the generic mapPgError for the 22023 cases that
// carry a meaningful detail code, since spec §5 / 0024:354-414 promises
// specific UI codes):
//   • 42501                → 403 forbidden
//   • 22023 wrong_stage    → 422 with code='wrong_stage'
//   • P0001 insufficient_stock_for_reserve → 422 with code +
//                            hint passthrough (sku=... warehouse_id=...) so
//                            the UI can name the offending pair.
//   • 40001                → 409 with code='concurrent_reserve' (v3 auto-skip
//                            FOR UPDATE race; mapPgError covers this)
//
// Phase 4.5a T5 (2026-05-05): the legacy 22023 `warehouse_required` mapping
// was dropped here. v3 RPC `logistics_confirm_proceed_request_v3` takes only
// `p_order_id` (auto-skip-from-stock picks an `own` warehouse internally), so
// the no-warehouse-supplied error path is no longer reachable from this
// endpoint. The orders.test.ts test that asserted the mapping has also been
// removed.
logisticsOrdersRouter.post("/:id/confirm-proceed", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, confirmProceedRequestInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_confirm_proceed_request_v3", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/transfer-ready -----
// Pipeline v2 (C2 / migration 0024). Wraps `logistics_warehouse_pick` whose
// source-stage guard now permits IN ('proceed_request', 'awaiting_logistics_action').
// Same error contract as /confirm-proceed. Note: warehouseId is REQUIRED here
// (the RPC raises 22023 `warehouse_required` on NULL). confirm-proceed
// accepts NULL via a different RPC; do not conflate.
logisticsOrdersRouter.post("/:id/transfer-ready", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, transferReadyInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_warehouse_pick", {
    p_order_id: c.req.param("id"),
    p_warehouse_id: parsed.data.warehouseId,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/recheck-stock -----
logisticsOrdersRouter.post("/:id/recheck-stock", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, recheckStockInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const orderId = c.req.param("id");

  const { data: wh, error: e1 } = await sb.rpc("logistics_pick_warehouse", { p_order_id: orderId });
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!wh) {
    return c.json({ warehouseId: null, shortages: [] });
  }
  const { data: shortages, error: e2 } = await sb.rpc("logistics_calc_shortages", { p_order_id: orderId, p_warehouse_id: wh });
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  return c.json({ warehouseId: wh, shortages: shortages ?? [] });
});

// ----- POST /:id/issue-pos -----
logisticsOrdersRouter.post("/:id/issue-pos", requireLogistics, async (c) => {
  const parsed = await parseJsonBody(c, issuePosForOrderInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_issue_pos_for_order", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ----- POST /:id/revert-proceed -----
// 2026-05-12 (Loo) — back-arrow from Proceed Request column → Placed column.
// No body; just the order id in the path. Both logistics and principal can
// trigger. Maps RPC's 22023 wrong_stage into a 422 invalid_param.
logisticsOrdersRouter.post(
  "/:id/revert-proceed",
  requireLogisticsOrPrincipal,
  async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc(
      "logistics_revert_order_proceed_to_placed",
      { p_order_id: c.req.param("id") },
    );
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

// ----- POST /:id/revert-dispatch -----
// 2026-05-12 (Loo) — back-arrow from Dispatched column → Ready to Dispatch.
// Clears every thread's partner assignment on this order. logistics or
// principal.
logisticsOrdersRouter.post(
  "/:id/revert-dispatch",
  requireLogisticsOrPrincipal,
  async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc(
      "logistics_revert_order_dispatched_to_ready",
      { p_order_id: c.req.param("id") },
    );
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

export default logisticsOrdersRouter;
