import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  listPurchaseOrdersQuery,
  reassignPoWarehouseInput,
  receivePoLineInput,
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
logisticsPosRouter.post("/:id/assign-pickup-partner", async (c) => {
  const parsed = await parseJsonBody(c, assignPickupPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
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
