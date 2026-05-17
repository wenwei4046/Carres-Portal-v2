import { Hono } from "hono";
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  createPosBatchInput,
  listPurchaseOrdersQuery,
  reassignPoWarehouseInput,
  receivePoWithDoInput,
  type AwaitingStockShortageResponse,
} from "@carres/shared";
// renderPoPdf moved to apps/web/src/lib/pdf/render.ts (Workers WASM ban).
import type { PoTemplateData } from "../../lib/pdf/types";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/pos — Phase 4 backend procurement subsystem.
 *
 * Endpoints:
 *   GET    /                          — list with status/supplier filters (M3)
 *   POST   /                          — create PO (M3)
 *   POST   /:id/receive               — receive line (M3)
 *   POST   /:id/cancel                — cancel (M3)
 *   POST   /:id/assign-pickup-partner — F1.A assign pickup (M3)
 *   POST   /:id/reassign-warehouse    — F1.A reassign WH (M3)
 *   GET    /:id/print                 — server-side PO PDF (M4 / spec §18.4 F6)
 *
 * Auth: every route guards with `requireOperation` per-route — NOT a blanket
 * `use("*", ...)` middleware. The blanket pattern leaks across sibling sub-
 * routers mounted at the same path (`lpInboundRouter`,
 * `dispatchCustomerLegRouter`) and silently 403's traffic those siblings
 * intend to admit (principal, partner). See `lib/auth-guards.ts` docstring
 * + carry-forward `phase-4.5-chunk-2-route-mount-middleware-leak` for the
 * full rationale.
 *
 * Pattern: matches apps/api/src/routes/operation/orders.ts (multi-endpoint
 * router with per-route role guard + shared mapPgError/parseJsonBody from
 * lib/route-helpers + RPC wraps).
 */
const operationPosRouter = new Hono<AppEnv>();

// ----- GET / list -----
operationPosRouter.get("/", requireOperation, async (c) => {
  const parsed = listPurchaseOrdersQuery.safeParse({
    status: c.req.query("status") ?? undefined,
    supplierId: c.req.query("supplierId") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { status, supplierId } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date, placed_at, purchase_order_lines(sku, qty, received_qty, attrs)",
    );

  if (status !== "all") q = q.eq("status", status);
  if (supplierId) q = q.eq("supplier_id", supplierId);

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ pos: data ?? [] });
});

// ----- GET /awaiting-stock-shortage -----
// C5.3 + v3-S4.6: SKU-level shortage feed for the "Auto-fill" button on
// CreatePOModal. Aggregates demand across every order currently sitting in a
// procurement-needed state, compares against the cross-warehouse stock pool,
// and returns only SKUs where avail < need.
//
// DUAL-PATH: the auto-fill target population is the union of two paths.
//
// 1. PRIMARY (v3-S4.6): order_supplier_threads where
//    operation_stage='awaiting_operation_action' AND po_id IS NULL. After
//    confirm_proceed_request_v3 (migration 0034) every order is split into
//    per-(supplier, category) threads; a thread with po_id NULL is the exact
//    "not yet covered by a PO" target. This filter is correct by construction
//    (no dl/dl_refs string matching against open POs), and the v3-S4 batch
//    RPC closes the race window with SELECT ... FOR UPDATE on the same rows.
//
// 2. LEGACY FALLBACK (v3-S2.1 dl/dl_refs filter): orders in
//    operation_stage='awaiting_operation_action' that have NO row in
//    order_supplier_threads — i.e. legacy/unsplit data, or orders where
//    confirm_proceed_request_v3 has not yet been called. For these we apply
//    the v3-S2.1 v2-style filter: drop orders whose `dl` matches an OPEN PO's
//    `dl` or appears in `dl_refs`. status='open' is the discriminator;
//    received/cancelled POs leave the order in play.
//
// The two order_id sets are union-ed (Set dedupes natively) before the
// order_lines fetch, so a row that surfaces in both paths contributes its
// `qty` to `need` exactly once. order_lines + stock_balances aggregation is
// unchanged from C5.3.
//
// Tables touched (one round-trip each, all in parallel):
//   - order_supplier_threads (no filter — TS narrows by stage + po_id)
//   - orders (.eq("operation_stage", "awaiting_operation_action"))
//   - purchase_orders (.eq("status", "open") for the legacy coverage filter)
//   - order_lines (.in("order_id", [...]) on the union set)
//   - stock_balances (no filter — sum across all warehouses per Q2=A)
//
// RLS: the inline role guard above plus the user JWT covers this; no policy
// changes needed.
//
// Optional `?dls=1003,1002` query — when present, scopes the shortage feed to
// the orders matching those dl numbers (used by CrossOrderBundleSheet so the
// modal pre-fills lines for the user's exact selection, not the global pool).
// Comma-separated positive integers. The orders fetch becomes dl-scoped and
// `primaryOrderIds` is intersected with that scope so threads-side rows can't
// leak orders the user didn't pick. Without this param, the endpoint returns
// global awaiting shortage as before.
//
// Path is registered before `/:id/print` so the static segment wins over the
// :id pattern in Hono's matcher.
operationPosRouter.get("/awaiting-stock-shortage", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  // Parse optional dls scope. Reject malformed input with 422 — silent
  // ignoring would let the operator submit a bundle PO with the wrong lines.
  const dlsParam = c.req.query("dls");
  let dlsFilter: number[] | null = null;
  if (dlsParam != null && dlsParam.length > 0) {
    const parts = dlsParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const parsed: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isInteger(n) || n <= 0) {
        return c.json(
          {
            error: "invalid_query",
            code: "invalid_param",
            message: `dls must be a comma-separated list of positive integers (got '${p}')`,
          },
          422,
        );
      }
      parsed.push(n);
    }
    if (parsed.length === 0) {
      const empty: AwaitingStockShortageResponse = { shortage: [], orders: [] };
      return c.json(empty);
    }
    dlsFilter = parsed;
  }

  // Step 1 — three parallel fetches: threads (primary path source), legacy
  // candidate orders (alias-aware), and open POs (for the legacy
  // dl/dl_refs filter). All independent; Promise.all is the same pattern as
  // the order_lines + stock_balances pair below. When dlsFilter is set, the
  // orders fetch narrows to those dls — `legacyOrderIds` then auto-scopes
  // through `ordersRes.data`, and `primaryOrderIds` (from threads, which
  // don't carry dl) is intersected with the same scope below.
  const ordersBuilder = sb
    .from("orders")
    .select("id, dl, delivery_date")
    .eq("operation_stage", "awaiting_operation_action");
  const ordersQuery = dlsFilter
    ? ordersBuilder.in("dl", dlsFilter)
    : ordersBuilder;
  const [threadsRes, ordersRes, posRes] = await Promise.all([
    sb.from("order_supplier_threads").select("order_id, operation_stage, po_id"),
    ordersQuery,
    sb.from("purchase_orders").select("dl, dl_refs").eq("status", "open"),
  ]);
  if (threadsRes.error) {
    const m = mapPgError(threadsRes.error);
    return c.json(m.body, m.status);
  }
  if (ordersRes.error) {
    const m = mapPgError(ordersRes.error);
    return c.json(m.body, m.status);
  }
  if (posRes.error) {
    const m = mapPgError(posRes.error);
    return c.json(m.body, m.status);
  }

  // Primary path: threads where stage='awaiting_operation_action' AND po_id
  // IS NULL. Each such thread maps its order_id into the union — multiple
  // threads on the same order (different supplier/category) collapse to one
  // entry in the Set, but their lines all show up later via order_lines (the
  // SKU split happens in the modal's grouping, not here).
  const primaryOrderIds = new Set<string>();
  // "Has any thread" gate for the legacy fallback — an order with at least
  // one thread row has been split, so it should NOT enter the legacy path
  // even if its orders.operation_stage is still awaiting_operation_action.
  const orderIdsWithAnyThread = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (threadsRes.data ?? []) as any[]) {
    const oid = String(t.order_id);
    orderIdsWithAnyThread.add(oid);
    if (t.operation_stage === "awaiting_operation_action" && t.po_id == null) {
      primaryOrderIds.add(oid);
    }
  }

  // Legacy fallback path: build the dl-coverage Set from open POs the same
  // way v3-S2.1 did. A PO covers a dl if (po.dl = dl) OR (dl = ANY(po.dl_refs)).
  const coveredDls = new Set<number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (posRes.data ?? []) as any[]) {
    if (p.dl != null) coveredDls.add(Number(p.dl));
    if (Array.isArray(p.dl_refs)) {
      for (const ref of p.dl_refs) {
        if (ref != null) coveredDls.add(Number(ref));
      }
    }
  }

  // Legacy candidate orders → keep only those that (a) have NO thread row
  // (i.e. unsplit / pre-v3) AND (b) are NOT covered by any open PO. The
  // null-`dl` defensive branch from v3-S2.1 is preserved.
  const legacyOrderIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (ordersRes.data ?? []) as any[]) {
    const oid = String(o.id);
    if (orderIdsWithAnyThread.has(oid)) continue; // split — handled by primary
    const dl = o.dl;
    if (dl != null && coveredDls.has(Number(dl))) continue; // already covered by an open PO
    legacyOrderIds.add(oid);
  }

  // When dlsFilter is set, threads-side primaryOrderIds may include orders
  // outside the user's selection (threads carry no dl). Intersect with the
  // dl-scoped orders set so the union honors the bundle scope.
  const inScopeOrderIds = dlsFilter
    ? new Set((ordersRes.data ?? []).map((o: { id: unknown }) => String(o.id)))
    : null;
  const scopedPrimaryOrderIds = inScopeOrderIds
    ? new Set([...primaryOrderIds].filter((id) => inScopeOrderIds.has(id)))
    : primaryOrderIds;

  // Union — Set semantics dedupe automatically. If a future invariant
  // violation surfaces the same order in both paths, its lines still
  // aggregate to `need` exactly once.
  const orderIdsUnion = new Set<string>([...scopedPrimaryOrderIds, ...legacyOrderIds]);
  const orderIds = [...orderIdsUnion];

  // Short-circuit when nothing needs procurement.
  if (orderIds.length === 0) {
    const empty: AwaitingStockShortageResponse = { shortage: [], orders: [] };
    return c.json(empty);
  }

  // Step 2 — fetch order_lines (for those order IDs) AND stock_balances (all
  // rows) in parallel. Same Promise.all pattern as orders.ts:164/212.
  // 0076 (Loo 2026-05-10): also pull `attrs` so the per-(sku, attrs)
  // aggregation below can preserve color/gap/fabric for CreatePOModal's
  // cascade pre-fill. attrs is jsonb; NULL stays NULL for mattress lines.
  const [linesRes, stockRes] = await Promise.all([
    sb.from("order_lines").select("sku, qty, attrs").in("order_id", orderIds),
    sb.from("stock_balances").select("sku, qty, reserved"),
  ]);
  if (linesRes.error) {
    const m = mapPgError(linesRes.error);
    return c.json(m.body, m.status);
  }
  if (stockRes.error) {
    const m = mapPgError(stockRes.error);
    return c.json(m.body, m.status);
  }

  // Step 3 — TS aggregation. Key is now (sku, attrs-canonical) so the same
  // SKU with different bedframe colors / sofa fabrics surfaces as separate
  // shortage rows. JSON.stringify with sorted keys keeps two semantically
  // identical attrs objects on the same bucket regardless of source key
  // order. `available` is still per-SKU (stock isn't variant-tracked) and
  // gets divided across variants in declaration order — first variant takes
  // available stock, later variants see 0. This is conservative (over-orders
  // stock if the operator didn't explicitly want it on the same variant)
  // but never under-orders. Matches the existing operation_calc_shortages
  // semantics for single-variant orders byte-for-byte.
  type ShortageRow = AwaitingStockShortageResponse["shortage"][number];
  type Attrs = ShortageRow["attrs"];

  const canonAttrs = (a: unknown): string => {
    if (a == null) return "";
    if (typeof a !== "object") return JSON.stringify(a);
    const obj = a as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const ordered: Record<string, unknown> = {};
    for (const k of keys) ordered[k] = obj[k];
    return JSON.stringify(ordered);
  };

  const needByKey = new Map<string, { sku: string; attrs: Attrs; need: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (linesRes.data ?? []) as any[]) {
    const sku = String(l.sku);
    const attrs = (l.attrs ?? null) as Attrs;
    const key = `${sku} ${canonAttrs(attrs)}`;
    const cur = needByKey.get(key);
    if (cur) cur.need += Number(l.qty);
    else needByKey.set(key, { sku, attrs, need: Number(l.qty) });
  }

  const availBySku = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (stockRes.data ?? []) as any[]) {
    const sku = String(r.sku);
    const avail = Number(r.qty) - Number(r.reserved);
    availBySku.set(sku, (availBySku.get(sku) ?? 0) + avail);
  }

  // Distribute SKU-level availability across variants in deterministic
  // (sku, attrs canonical) order. First variant absorbs available stock;
  // later variants see whatever's left.
  const shortage: ShortageRow[] = [];
  const remainingBySku = new Map(availBySku);
  const ordered = [...needByKey.values()].sort((a, b) => {
    const c = a.sku.localeCompare(b.sku);
    return c !== 0 ? c : canonAttrs(a.attrs).localeCompare(canonAttrs(b.attrs));
  });
  for (const row of ordered) {
    const remaining = remainingBySku.get(row.sku) ?? 0;
    const consumed = Math.min(remaining, row.need);
    remainingBySku.set(row.sku, remaining - consumed);
    if (consumed < row.need) {
      shortage.push({
        sku: row.sku,
        attrs: row.attrs,
        need: row.need,
        available: consumed,
        shortage: row.need - consumed,
      });
    }
  }

  // 2026-05-16 (Loo) — bundle-scope per-order list. Only populated when the
  // caller passed `?dls=...` (CreatePOModal bundle prefill). Global awaiting
  // calls return [] to avoid shipping the entire cohort.
  type OrderRow = AwaitingStockShortageResponse["orders"][number];
  const orders: OrderRow[] = [];
  if (dlsFilter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (ordersRes.data ?? []) as any[]) {
      if (o.dl == null) continue;
      orders.push({
        dl: Number(o.dl),
        deliveryDate: o.delivery_date ?? null,
      });
    }
    orders.sort((a, b) => a.dl - b.dl);
  }

  const response: AwaitingStockShortageResponse = { shortage, orders };
  return c.json(response);
});

// ----- GET /:id/print -----
// Server-side PO PDF (spec §18.4 F6). Mirrors GET /orders/:id/print-do.
// Printable for any non-cancelled PO (open or received). The PDF is what
// operation hands to the supplier as the procurement document.
//
// Note: the schema's `purchase_order_lines` table only stores (po_id, sku,
// qty, received_qty) — there is no per-line cost. Unit price comes from
// product_skus.price (our reference price, not supplier COGS). Same query
// also supplies the SKU description (variant text). When a line's SKU isn't
// found in product_skus (legacy PO), unit_price falls back to 0 and the SKU
// itself is used as the description — the PDF still renders.
// 2026-05-12 (Loo): renamed `/print` → `/print-data`. Returns JSON;
// browser renders @react-pdf locally (Workers WASM ban — see render.ts
// note in apps/web/src/lib/pdf/).
operationPosRouter.get("/:id/print-data", requireOperation, async (c) => {
  const poId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // Fetch PO + supplier + warehouse via embedded resources. supplier and
  // warehouse are FK'd from purchase_orders so PostgREST auto-detects the
  // join. purchase_order_lines is FK'd by po_id, also auto-detected.
  // suppliers has no `address` column (0001_init.sql:89-97), only contact.
  const { data: po, error: e1 } = await sb
    .from("purchase_orders")
    .select(
      "id, status, sup_status, dl, dl_refs, eta_date, placed_at, supplier_id, warehouse_id, suppliers(name, contact), warehouses(name, address)",
    )
    .eq("id", poId)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!po) {
    return c.json({ error: "not_found", code: "not_found", message: "PO not found" }, 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poRow: any = po;
  // Status gate: only cancelled POs are unprintable. open + received are both
  // valid procurement records the supplier may want a PDF for. (po_status
  // enum is 'open' | 'received' | 'cancelled' — see 0001_init.sql:29.)
  if (poRow.status === "cancelled") {
    return c.json(
      { error: "rule_violation", code: "po_not_printable", message: "Cancelled POs cannot be printed" },
      422,
    );
  }

  // Lines.
  const { data: lines, error: e2 } = await sb
    .from("purchase_order_lines")
    .select("sku, qty, received_qty, attrs")
    .eq("po_id", poId);
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  const lineRows = lines ?? [];

  // SKU descriptions + reference prices. Same pattern as orders' /print-do —
  // purchase_order_lines.sku has no FK to product_skus, so a separate lookup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skus: string[] = lineRows.map((l: any) => l.sku);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skuMetaBySku: Record<string, { variant: string; price: number }> = {};
  if (skus.length > 0) {
    const { data: skuRows, error: e3 } = await sb
      .from("product_skus")
      .select("sku, variant, price")
      .in("sku", skus);
    if (e3) {
      const m = mapPgError(e3);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of skuRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any;
      skuMetaBySku[row.sku] = { variant: row.variant, price: Number(row.price) };
    }
  }

  // Build PoTemplateData. po.id IS the po_number (text PK like 'PO-2031');
  // there is no separate po_number column. issue_date prefers placed_at
  // (when the PO was issued) and falls back to today. ISO yyyy-mm-dd.
  const issueIso = poRow.placed_at ?? new Date().toISOString();
  const issueDate = String(issueIso).slice(0, 10);

  const supplierRow = poRow.suppliers ?? null;
  const warehouseRow = poRow.warehouses ?? null;

  const pdfLines = lineRows.map(
    (l: { sku: string; qty: number; received_qty: number; attrs?: Record<string, unknown> | null }) => {
      const meta = skuMetaBySku[l.sku];
      const qty = Number(l.qty);
      const unitPrice = meta?.price ?? 0;
      return {
        sku: String(l.sku),
        description: meta?.variant ?? String(l.sku),
        qty,
        unit: "pc",
        unit_price: unitPrice,
        line_total: qty * unitPrice,
        // 0076 / 0077: thread the cascade picker payload into the PDF so the
        // supplier sees "Walnut · gap 14"" right under the description and
        // doesn't have to guess which variant.
        attrs: l.attrs ?? null,
      };
    },
  );
  const grandTotal = pdfLines.reduce((s, ln) => s + ln.line_total, 0);

  const templateData: PoTemplateData = {
    // po.id is already in the canonical 'PO-NNNN' format, so it doubles as
    // the doc number on the PDF.
    po_number: String(poRow.id),
    issue_date: issueDate,
    po_id: String(poRow.id),
    supplier: {
      name: supplierRow?.name ?? "Supplier",
      // suppliers.address column does not exist in the schema; suppliers
      // ship from a known factory and we don't track that physical address
      // here. Pass null so the template hides the line.
      address: null,
      contact: supplierRow?.contact ?? null,
    },
    buyer: {
      // Buyer = Carres HQ side. Use the receiving warehouse name + address
      // as the ship-to block, so the supplier knows where to send the goods.
      name: warehouseRow?.name ?? "Carres HQ",
      contact: warehouseRow?.address ?? null,
    },
    lines: pdfLines,
    grand_total: grandTotal,
    currency: "MYR",
    // No `terms` column on purchase_orders — pass null. The template hides
    // the block when null.
    terms: null,
  };

  return c.json(templateData);
});

// ----- GET /:id/source-orders -----
//
// Loo 2026-05-16 — per-source-order delivery dates for the PO detail modal.
// The PO list embeds nothing from `orders` because the (PO ↔ orders) link is
// indirect (PO.dl_refs is an int[] of dealer-facing SO numbers, joined to
// orders.dl). The modal needs each SO's `delivery_date` so the operator can
// see customer ETAs alongside the PO-level ETA.
//
// Two PostgREST round-trips: fetch PO (RLS-scoped), then fetch orders by dl.
// Cheap (<5 rows typically), only fires when the modal opens.
operationPosRouter.get("/:id/source-orders", requireOperation, async (c) => {
  const poId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: po, error: e1 } = await sb
    .from("purchase_orders")
    .select("dl, dl_refs")
    .eq("id", poId)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!po) {
    return c.json(
      { error: "not_found", code: "not_found", message: "PO not found" },
      404,
    );
  }
  const poRow = po as { dl: number | null; dl_refs: number[] | null };
  const dls: number[] = [
    ...((poRow.dl_refs ?? []) as number[]),
    ...(poRow.dl != null ? [Number(poRow.dl)] : []),
  ];
  if (dls.length === 0) return c.json({ orders: [] });

  const { data, error } = await sb
    .from("orders")
    .select("dl, delivery_date")
    .in("dl", dls)
    .order("dl");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const orders = (data ?? []).map((r) => {
    const row = r as { dl: unknown; delivery_date: string | null };
    return { dl: Number(row.dl), deliveryDate: row.delivery_date };
  });
  return c.json({ orders });
});

// ----- POST / create -----
//
// T29 — reshape per-line `costSource` (camelCase wire) → `cost_source`
// (snake_case JSONB) before handing to the RPC. The RPC reads
// `(v_line->>'cost_source')::cost_source_enum` at migration 0055b, so the
// field name must match the snake_case DB convention. Same boundary-
// transform pattern as POST /batch below — the wire contract stays
// camelCase (parity with every other route), and the snake_case translation
// happens once at the DB edge.
operationPosRouter.post("/", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, createPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const linesForRpc = parsed.data.lines.map((l) => ({
    sku: l.sku,
    qty: l.qty,
    cost: l.cost,
    cost_source: l.costSource,
    attrs: l.attrs ?? null,
  }));
  const { data, error } = await sb.rpc("operation_create_po", {
    p_supplier_id: parsed.data.supplierId,
    p_warehouse_id: parsed.data.warehouseId,
    p_lines: linesForRpc,
    p_dl: parsed.data.dl ?? null,
    p_dl_refs: parsed.data.dlRefs ?? null,
    // 0079 (Loo 2026-05-10) — pre-assign the procurement-leg LP at PO
    // creation. Modal already validates that factory_pickup suppliers have
    // a partner picked; own_logistics suppliers omit the field and the RPC
    // accepts null.
    p_procurement_partner_id: parsed.data.procurementPartnerId ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // 0083 (Loo 2026-05-10) — `operation_create_po(uuid,uuid,jsonb,int,int[])`
  // hard-codes `p_eta_date := null` at 0055b:222 and adding a 6th param
  // would need a DROP+CREATE migration. Cheaper: post-RPC UPDATE. operation
  // role passes RLS `po_scoped_update` (0002:249); LP whitelist trigger
  // (0068) early-returns for non-partner roles, so this is safe.
  const poId = (data as { id?: string } | null)?.id;
  if (poId) {
    const { error: etaErr } = await sb
      .from("purchase_orders")
      .update({ eta_date: parsed.data.etaDate })
      .eq("id", poId);
    if (etaErr) {
      const m = mapPgError(etaErr);
      return c.json(m.body, m.status);
    }
  }
  return c.json({ po: data });
});

// ----- POST /batch create -----
// C5.2: per-PO warehouse picker. When the modal's supplier-grouping yields >1
// supplier, the FE submits a single batch payload here instead of N parallel
// POSTs to POST /. The RPC `operation_create_pos_batch` is atomic — any
// helper-raised error rolls back the whole batch.
//
// Error mapping (extends generic mapPgError so the FE can surface the
// pos_index for per-row UI feedback):
//   • 22023 + detail='invalid_batch_size'  → 422 code 'invalid_batch_size'
//   • 22023 + detail='warehouse_required'  → 422 code 'warehouse_required',
//                                            includes pos_index parsed from
//                                            the RPC's hint ("pos_index=N")
//   • 42501                                → 403
//   • Other PG errors                      → mapPgError fallback
operationPosRouter.post("/batch", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, createPosBatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Reshape camelCase pos[] entries into the snake_case shape expected by the
  // RPC's JSONB array argument. Done at the boundary, not in shared schemas,
  // so the wire contract stays camelCase like every other route. T29: each
  // line's `costSource` (camelCase wire) → `cost_source` (snake_case DB) per
  // migration 0055b RPC contract.
  const payload = parsed.data.pos.map((p) => ({
    supplier_id: p.supplierId,
    warehouse_id: p.warehouseId,
    // 0079 (Loo 2026-05-10) — per-PO procurement-leg LP. RPC reads
    // `procurement_partner_id` off each jsonb entry and forwards to inner.
    procurement_partner_id: p.procurementPartnerId ?? null,
    lines: p.lines.map((l) => ({
      sku: l.sku,
      qty: l.qty,
      cost: l.cost,
      cost_source: l.costSource,
      attrs: l.attrs ?? null,
    })),
    // 0083 (Loo 2026-05-10) — was hard-coded null. RPC reads `eta_date`
    // off each JSONB entry and casts to date (0055b:300-303); empty string
    // falls back to null but our zod (.date()) blocks empty.
    eta_date: p.etaDate,
    dl_refs: p.dlRefs ?? null,
    note: null as string | null,
  }));

  const { data, error } = await sb.rpc("operation_create_pos_batch", {
    p_pos: payload,
  });
  if (error) {
    const e = error as { code?: string; message?: string; details?: string; hint?: string };

    // 22023 invalid_batch_size — surface the detail code unchanged.
    if (e.code === "22023" && e.details === "invalid_batch_size") {
      return c.json(
        {
          error: "rule_violation",
          code: "invalid_batch_size",
          message: e.message ?? "invalid batch size",
        },
        422,
      );
    }

    // 22023 warehouse_required — annotate the offending entry index. RPC's
    // hint is "pos_index=N" (0-based); parse it for the FE so a single PO
    // group can be highlighted without string-matching on the UI side.
    if (e.code === "22023" && e.details === "warehouse_required") {
      const m = /pos_index=(\d+)/.exec(e.hint ?? "");
      const posIndex = m ? Number.parseInt(m[1], 10) : null;
      return c.json(
        {
          error: "rule_violation",
          code: "warehouse_required",
          message: e.message ?? "warehouse is required",
          pos_index: posIndex,
        },
        422,
      );
    }

    const mapped = mapPgError(e);
    return c.json(mapped.body, mapped.status);
  }

  // RPC returns { po_ids: ['PO-2031', ...] } — adapt to camelCase poIds for
  // wire consistency with the rest of the route surface.
  const out = data as { po_ids?: string[] } | null;
  return c.json({ poIds: out?.po_ids ?? [] });
});

// ----- POST /:id/receive -----
//
// Phase 4.5 Chunk 1 carry-forward `phase-4.5-chunk-1-receive-rpc-v3-swap` —
// the API now calls v3 batched RPC `operation_receive_po_with_do` (migration
// 0045:614) which persists the uploaded DO file path and DO number on the PO
// row in the same transaction as the per-line received_qty bumps. The legacy
// v2 `operation_receive_po_line` RPC is still in the DB but unused from this
// route — the Sofa Reject branch and thread/stock advancement live entirely
// inside the v3 RPC.
//
// Body shape: { doNumber, doFilePath, lines: [{sku, receivedQty}] }. The
// `receivedQty` field is the NEW TOTAL received_qty for that line (not a
// delta) — the modal reshapes existing.received_qty + recv[sku] before
// sending. The RPC computes delta internally and rejects decreases with
// P0001 detail='received_qty_decrease'.
//
// Reshape at the boundary: the wire schema is camelCase to match every other
// route, but `p_lines` jsonb expects snake_case `received_qty` (RPC reads
// `v_line->>'received_qty'` at 0045:688). Same pattern as POST /batch
// reshapes camelCase → snake_case for the RPC payload.
operationPosRouter.post("/:id/receive", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivePoWithDoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_receive_po_with_do", {
    p_po_id: c.req.param("id"),
    p_do_file_path: parsed.data.doFilePath,
    p_do_number: parsed.data.doNumber,
    p_lines: parsed.data.lines.map((l) => ({
      // 0076 (2026-05-10): RPC v3 keys WHERE/UPDATE on the line UUID `id`,
      // not (po_id, sku), so multi-variant lines with the same SKU are
      // disambiguated. Snake-case key matches the v_line->>'id' read in the
      // RPC body.
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

// ----- POST /:id/cancel -----
operationPosRouter.post("/:id/cancel", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, cancelPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_cancel_po", {
    p_po_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/assign-pickup-partner -----
//
// v3-S4.4 — both partner and outsource paths now go through the unified RPC
// `operation_assign_partner_and_dispatch` (migration 0034). The pre-v3-S4
// implementation had two paths:
//   1. partner — `operation_assign_pickup_partner(po_id, partner_id)` (v2)
//   2. outsource — direct `purchase_orders` UPDATE with outsource_* fields,
//      RLS-bounded but skipped po_history + audit_log writes + state guards.
//
// Both paths now hand the RPC the same 6-arg shape; the RPC validates XOR at
// the DB layer (raises 22023 detail='partner_or_outsource_xor' if both/neither
// of partner_id / outsource_name are set), writes po_history + audit_log,
// optionally overrides destination warehouse via `p_warehouse_override_id`
// (the FE sends this from AssignPickupDialog's warehouse picker), and returns
// the final PO row JSON.
//
// XOR is gated three ways for defense-in-depth:
//   • zod `assignPickupPartnerInput` refine (FE/Hono) — primary
//   • RPC re-check (DB) — catches direct RPC callers / tampered payloads
//   • CHECK constraint `po_outsource_xor_partner` (storage) — last line
//
// The RPC's 22023 detail='partner_or_outsource_xor' is intercepted here and
// surfaced as 422 with code='invalid_xor' so the FE can distinguish it from
// other 22023s (wrong_sup_status, warehouse_not_found, etc).
//
// Closes carry-forward `phase-4-v3-outsource-audit-gap`.
operationPosRouter.post("/:id/assign-pickup-partner", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, assignPickupPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Single-RPC dispatch. Either partner_id is set (registered partner path)
  // or outsource_name + outsource_contact are set (one-shot transporter
  // path) — never both, never neither (zod refine + RPC re-check + CHECK).
  // `p_warehouse_override_id` defaults to null when the FE didn't send a
  // picker selection; the RPC interprets null as "keep PO's current
  // warehouse_id".
  const { data, error } = await sb.rpc("operation_assign_partner_and_dispatch", {
    p_po_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId ?? null,
    p_outsource_name: parsed.data.outsourcePartnerName ?? null,
    p_outsource_contact: parsed.data.outsourcePartnerContact ?? null,
    p_outsource_zones: parsed.data.outsourcePartnerZones ?? null,
    p_warehouse_override_id: parsed.data.warehouseId ?? null,
  });
  if (error) {
    // Specialize the RPC's defense-in-depth XOR raise so the FE can show a
    // distinct error message. mapPgError otherwise collapses 22023 into
    // generic code='invalid_param'.
    const e = error as { code?: string; details?: string; message?: string };
    if (e.code === "22023" && e.details === "partner_or_outsource_xor") {
      return c.json(
        {
          error: "invalid_param",
          code: "invalid_xor",
          message:
            e.message ??
            "exactly one of partnerId / outsourcePartnerName must be set",
        },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/reassign-warehouse -----
operationPosRouter.post("/:id/reassign-warehouse", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, reassignPoWarehouseInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_reassign_po_warehouse", {
    p_po_id: c.req.param("id"),
    p_new_warehouse_id: parsed.data.newWarehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

export default operationPosRouter;
