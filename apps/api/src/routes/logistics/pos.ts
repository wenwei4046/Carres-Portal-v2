import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  createPosBatchInput,
  listPurchaseOrdersQuery,
  reassignPoWarehouseInput,
  receivePoLineInput,
  type AwaitingStockShortageResponse,
} from "@carres/shared";
import { renderPoPdf } from "../../lib/pdf/render";
import type { PoTemplateData } from "../../lib/pdf/types";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/pos — Phase 4 backend procurement subsystem.
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
 * Pattern: matches apps/api/src/routes/logistics/orders.ts (multi-endpoint
 * router with role-only middleware + shared mapPgError/parseJsonBody from
 * lib/route-helpers + RPC wraps).
 */
const logisticsPosRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsPosRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

// ----- GET / list -----
logisticsPosRouter.get("/", async (c) => {
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
      "id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date, placed_at, purchase_order_lines(sku, qty, received_qty)",
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
// C5.3: SKU-level shortage feed for "Auto-fill from awaiting stock" button on
// CreatePOModal. Aggregates demand across every order currently sitting in
// `logistics_stage='awaiting_stock'`, compares against the cross-warehouse
// stock pool, and returns only SKUs where avail < need. The button replaces
// the modal's lines state with this list so logistics can issue one PO that
// covers the whole pending order book.
//
// Q1=B (server-side aggregation, no new RPC). Existing tables only:
//   - orders (logistics_stage filter — also fetches `dl` for v3-S2.1 join)
//   - purchase_orders (status='open' filter — v3-S2.1 covered-orders filter)
//   - order_lines (in-list by order_id)
//   - stock_balances (no filter — sum across all warehouses per Q2=A)
//
// v3-S2.1 (Bug 7 partial fix, defensive): before computing shortages, drop
// orders whose `dl` matches an OPEN PO's `dl` or appears in `dl_refs`. This
// stops repeated Auto-fill presses from re-suggesting orders that already
// have a procurement-in-flight. Without this, two logistics users pressing
// Auto-fill near-simultaneously would both see the same shortage list and
// both submit duplicate POs covering the same orders. Race-window protection
// (atomic SELECT FOR UPDATE on order_supplier_threads + concurrent_claim
// error) is deferred to v3-S4 — that needs a new table this phase doesn't
// have. Status discrimination: only `status='open'` POs gate orders. Done
// (`received`) or dead (`cancelled`) POs leave the order in play.
//
// RLS: the inline role guard above plus the user JWT covers this; no
// policy changes needed.
//
// Path is registered before `/:id/print` so the static segment wins over the
// :id pattern in Hono's matcher.
logisticsPosRouter.get("/awaiting-stock-shortage", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  // Step 1 — fetch awaiting_stock orders (id + dl for the PO-coverage join)
  // AND the set of OPEN POs (dl + dl_refs) in parallel. Same Promise.all
  // pattern as below; both queries are cheap and independent.
  const [ordersRes, posRes] = await Promise.all([
    sb.from("orders").select("id, dl").eq("logistics_stage", "awaiting_stock"),
    sb.from("purchase_orders").select("dl, dl_refs").eq("status", "open"),
  ]);
  if (ordersRes.error) {
    const m = mapPgError(ordersRes.error);
    return c.json(m.body, m.status);
  }
  if (posRes.error) {
    const m = mapPgError(posRes.error);
    return c.json(m.body, m.status);
  }

  // Build a Set of `dl` values that are already covered by an open PO. A PO
  // covers a dl if (po.dl = dl) OR (dl = ANY(po.dl_refs)). We flatten both
  // sides into one Set<number> for an O(1) per-order lookup.
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

  // Filter the awaiting_stock orders to only those NOT covered by an open
  // PO. Orders with a null `dl` (shouldn't happen in practice — dl is the
  // customer-facing order number — but be defensive) keep through, since
  // null can't be in a covered Set<number>.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderIds = ((ordersRes.data ?? []) as any[])
    .filter((o) => {
      const dl = o.dl;
      if (dl == null) return true;
      return !coveredDls.has(Number(dl));
    })
    .map((o) => o.id);

  // Short-circuit when no awaiting_stock orders need procurement — either
  // none exist OR all of them are already covered. Returns `{shortage: []}`.
  if (orderIds.length === 0) {
    const empty: AwaitingStockShortageResponse = { shortage: [] };
    return c.json(empty);
  }

  // Step 2 — fetch order_lines (for those order IDs) AND stock_balances (all
  // rows) in parallel. Same Promise.all pattern as orders.ts:164/212.
  const [linesRes, stockRes] = await Promise.all([
    sb.from("order_lines").select("sku, qty").in("order_id", orderIds),
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

  // Step 3 — TS aggregation. need = Σ qty per SKU; available = Σ (qty -
  // reserved) per SKU across every warehouse. Filter to shortage > 0.
  const needBySku = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (linesRes.data ?? []) as any[]) {
    const sku = String(l.sku);
    needBySku.set(sku, (needBySku.get(sku) ?? 0) + Number(l.qty));
  }

  const availBySku = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (stockRes.data ?? []) as any[]) {
    const sku = String(r.sku);
    const avail = Number(r.qty) - Number(r.reserved);
    availBySku.set(sku, (availBySku.get(sku) ?? 0) + avail);
  }

  const shortage: AwaitingStockShortageResponse["shortage"] = [];
  for (const [sku, need] of needBySku.entries()) {
    const available = availBySku.get(sku) ?? 0;
    if (available < need) {
      shortage.push({ sku, need, available, shortage: need - available });
    }
  }
  shortage.sort((a, b) => a.sku.localeCompare(b.sku));

  const response: AwaitingStockShortageResponse = { shortage };
  return c.json(response);
});

// ----- GET /:id/print -----
// Server-side PO PDF (spec §18.4 F6). Mirrors GET /orders/:id/print-do.
// Printable for any non-cancelled PO (open or received). The PDF is what
// logistics hands to the supplier as the procurement document.
//
// Note: the schema's `purchase_order_lines` table only stores (po_id, sku,
// qty, received_qty) — there is no per-line cost. Unit price comes from
// product_skus.price (our reference price, not supplier COGS). Same query
// also supplies the SKU description (variant text). When a line's SKU isn't
// found in product_skus (legacy PO), unit_price falls back to 0 and the SKU
// itself is used as the description — the PDF still renders.
logisticsPosRouter.get("/:id/print", async (c) => {
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
    .select("sku, qty, received_qty")
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

  const pdfLines = lineRows.map((l: { sku: string; qty: number; received_qty: number }) => {
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
    };
  });
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

  const pdfBytes = await renderPoPdf(templateData);
  // De-dupe filename prefix the same way /print-do does. po.id should
  // always start with 'PO-' (auto-generated as 'PO-' || sequence in
  // logistics_create_po / logistics_issue_pos_for_order), but tolerate
  // edge values without the prefix.
  const filenameBase = templateData.po_number.startsWith("PO-")
    ? templateData.po_number
    : `PO-${templateData.po_number}`;
  return c.body(pdfBytes.buffer as ArrayBuffer, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
    "Cache-Control": "no-store",
  });
});

// ----- POST / create -----
logisticsPosRouter.post("/", async (c) => {
  const parsed = await parseJsonBody(c, createPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_create_po", {
    p_supplier_id: parsed.data.supplierId,
    p_warehouse_id: parsed.data.warehouseId,
    p_lines: parsed.data.lines,
    p_dl: parsed.data.dl ?? null,
    p_dl_refs: parsed.data.dlRefs ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /batch create -----
// C5.2: per-PO warehouse picker. When the modal's supplier-grouping yields >1
// supplier, the FE submits a single batch payload here instead of N parallel
// POSTs to POST /. The RPC `logistics_create_pos_batch` is atomic — any
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
logisticsPosRouter.post("/batch", async (c) => {
  const parsed = await parseJsonBody(c, createPosBatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Reshape camelCase pos[] entries into the snake_case shape expected by the
  // RPC's JSONB array argument. Done at the boundary, not in shared schemas,
  // so the wire contract stays camelCase like every other route.
  const payload = parsed.data.pos.map((p) => ({
    supplier_id: p.supplierId,
    warehouse_id: p.warehouseId,
    lines: p.lines,
    eta_date: null as string | null,
    dl_refs: p.dlRefs ?? null,
    note: null as string | null,
  }));

  const { data, error } = await sb.rpc("logistics_create_pos_batch", {
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
logisticsPosRouter.post("/:id/receive", async (c) => {
  const parsed = await parseJsonBody(c, receivePoLineInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_receive_po_line", {
    p_po_id: c.req.param("id"),
    p_sku: parsed.data.sku,
    p_received_qty: parsed.data.receivedQty,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ----- POST /:id/cancel -----
logisticsPosRouter.post("/:id/cancel", async (c) => {
  const parsed = await parseJsonBody(c, cancelPoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_cancel_po", {
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
// Two paths through this route, gated by the body shape (zod `assignPickupPartnerInput`
// XOR refine):
//
//   1. partnerId path — registered delivery partner. Calls the existing
//      `logistics_assign_pickup_partner(po_id, partner_id)` RPC. Unchanged
//      from Phase 4. The `warehouseId` field is captured but NOT forwarded
//      to the 2-arg RPC; v3-S4 swaps both paths to the unified
//      `logistics_assign_partner_and_dispatch(... p_warehouse_override_id ...)`
//      RPC at which point warehouseId becomes load-bearing.
//
//   2. outsource path (v3-S3.4 / spec §8.2) — one-shot ad-hoc transporter.
//      No RPC exists for outsource yet (lands in v3-S4). This route does a
//      direct `purchase_orders` UPDATE under the user JWT (RLS allows the
//      logistics role to update POs — see `po_scoped_update` in 0002_rls.sql).
//      The DB CHECK constraint `po_outsource_xor_partner` (migration 0030 §3.6)
//      enforces XOR with delivery_partner_id at the storage layer (defense in
//      depth — zod is the primary gate).
logisticsPosRouter.post("/:id/assign-pickup-partner", async (c) => {
  const parsed = await parseJsonBody(c, assignPickupPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // v3-S2.4 — destination warehouse override:
  // `warehouseId` is captured here from the request body (and validated as a
  // UUID by the zod schema), but NOT yet forwarded to either path. v3-S4 will
  // swap both paths to `logistics_assign_partner_and_dispatch` which accepts
  // `p_warehouse_override_id`; at that point we'll thread `parsed.data.warehouseId`
  // through to the RPC call (and drop the direct-UPDATE outsource branch).
  const _warehouseId = parsed.data.warehouseId;
  void _warehouseId; // intentionally unused — wired to UI/API; RPC binding lands in v3-S4
  const sb = userClient(c.env, c.var.auth.jwt);

  // Outsource path — direct PO UPDATE (no RPC, RLS-bounded).
  if (parsed.data.outsourcePartnerName) {
    const { data, error } = await sb
      .from("purchase_orders")
      .update({
        outsource_partner_name: parsed.data.outsourcePartnerName,
        outsource_partner_contact: parsed.data.outsourcePartnerContact,
        outsource_partner_zones: parsed.data.outsourcePartnerZones ?? null,
        sup_status: "pickup_assigned",
      })
      .eq("id", c.req.param("id"))
      .select()
      .single();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ po: data });
  }

  // Partner path — existing RPC (unchanged from Phase 4).
  const { data, error } = await sb.rpc("logistics_assign_pickup_partner", {
    p_po_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

// ----- POST /:id/reassign-warehouse -----
logisticsPosRouter.post("/:id/reassign-warehouse", async (c) => {
  const parsed = await parseJsonBody(c, reassignPoWarehouseInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_reassign_po_warehouse", {
    p_po_id: c.req.param("id"),
    p_new_warehouse_id: parsed.data.newWarehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});

export default logisticsPosRouter;
