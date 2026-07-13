import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockReserveInputSchema,
  opsStockReserveItemInputSchema,
  opsStockReleaseInputSchema,
  opsStockReassignInputSchema,
  opsStockTakeoutInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockRefurbishInputSchema,
  opsStockRefurbishCompleteInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockCreateInputSchema,
  opsStockImportInputSchema,
  reconcileStockImport,
  type StockUnitKeyParts,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Per-unit stock register (migration 0137) — Carres Klang scope.
 *
 * GET endpoints (4 list views the operation panel renders):
 *   /ready      — status='free' AND condition∈('new','exhibition') AND !needs_repair
 *   /reserved   — status='reserved'
 *   /repair     — needs_repair=true OR condition∈('old','damaged')
 *   /inventory  — everything (master grid)
 *
 * POST endpoints (5 actions, each calls a SECURITY DEFINER RPC):
 *   /reserve, /release, /reassign, /takeout, /flag-repair
 *
 * All endpoints gated to operation/principal via requireOperationOrPrincipal.
 */

const opsStockRouter = new Hono<AppEnv>();

// =====================================================================
// GET list views
// =====================================================================

opsStockRouter.get("/ready", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .eq("status", "free")
    .in("condition", ["new", "exhibition", "old", "refurbished"])
    .eq("needs_repair", false)
    .order("date_in", { ascending: true, nullsFirst: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/reserved", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .eq("status", "reserved")
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/repair", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .or("needs_repair.eq.true,condition.in.(damaged)")
    .order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

opsStockRouter.get("/inventory", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .order("sku", { ascending: true })
    .order("status", { ascending: true });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ items: shape(data ?? []), total: (data ?? []).length });
});

// =====================================================================
// POST actions — thin wrappers over the SECURITY DEFINER RPCs.
// =====================================================================

opsStockRouter.post("/reserve", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReserveInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_reserve", {
    p_sku: parsed.sku,
    p_ref: parsed.ref,
    p_condition: parsed.condition ?? null,
    p_wh: parsed.warehouseId ?? null,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "No matching free unit available for this SKU",
    });
  }
  // 0212 — stamp WHY the ready-pool unit was pulled (urgent vs exchange).
  // Best-effort under write_internal RLS: the reserve itself already succeeded,
  // so a reason-stamp hiccup must not surface as a false reserve failure.
  if (parsed.reason) {
    await sb
      .from("ops_stock_items")
      .update({ reserve_reason: parsed.reason })
      .eq("id", data as string);
  }
  return c.json({ itemId: data });
});

// /reserve-item — reserve ONE specific free unit to a customer ref (the
// order-drawer Ready picker, Jess 2026-06-30). The operator picked the exact
// unit (matched to the order line via normalizeSkuKey on the client), so we
// target by id and flip free→reserved directly under RLS — mirroring the
// /condition PATCH + the "+ Add stock" insert (no RPC; reserve writes no
// rollup, same as ops_stock_reserve). The status='free' guard makes it a
// no-op-safe claim: a unit grabbed by someone else returns 409, not a silent
// over-reserve.
opsStockRouter.post("/reserve-item", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReserveItemInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .update({
      status: "reserved",
      reserved_ref: parsed.ref,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.itemId)
    .eq("status", "free")
    .eq("needs_repair", false)
    .select("id")
    .maybeSingle();
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(409, {
      message: "Unit is no longer free (already reserved / sold / flagged)",
    });
  }
  return c.json({ itemId: (data as { id: string }).id });
});

opsStockRouter.post("/release", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReleaseInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_release", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or not in reserved status",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.post("/reassign", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReassignInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_reassign", {
    p_item_id: parsed.itemId,
    p_new_ref: parsed.newRef,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or not in reserved status",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.post("/takeout", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockTakeoutInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_takeout", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "Item not found or already sold/transferred",
    });
  }
  return c.json({ itemId: data });
});

opsStockRouter.patch("/:itemId/condition", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockUpdateConditionInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb
    .from("ops_stock_items")
    .update({ condition: parsed.condition, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw mapErr(error);
  return c.json({ itemId });
});

opsStockRouter.post("/flag-repair", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockFlagRepairInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_flag_repair", {
    p_item_id: parsed.itemId,
    p_flag: parsed.flag,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, { message: "Item not found" });
  }
  return c.json({ itemId: data });
});

// POST /refurbish — send a Free unit (typically a Display / ex-exhibition
// piece) into repair. It leaves the ready-stock pool (needs_repair=true) until
// completed. Guarded direct update (mirrors /reserve-item): only a genuinely
// free, in-pool unit can enter repair, else 409 — no silent no-op.
opsStockRouter.post("/refurbish", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockRefurbishInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .update({ needs_repair: true, updated_at: new Date().toISOString() })
    .eq("id", parsed.itemId)
    .eq("status", "free")
    .eq("needs_repair", false)
    .select("id")
    .maybeSingle();
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(409, {
      message:
        "Unit is not a free in-pool unit (already reserved/sold, or already in repair)",
    });
  }
  return c.json({ itemId: (data as { id: string }).id });
});

// POST /refurbish-complete — repair done: grade the unit up to 'refurbished'
// (sellable as new) and return it to the Free ready-stock pool. Guarded on
// needs_repair=true so completing a unit that isn't in repair 409s.
opsStockRouter.post("/refurbish-complete", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockRefurbishCompleteInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .update({
      condition: "refurbished",
      needs_repair: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.itemId)
    .eq("needs_repair", true)
    .select("id")
    .maybeSingle();
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(409, { message: "Unit is not in repair" });
  }
  return c.json({ itemId: (data as { id: string }).id });
});

// POST / — "+ Add stock": book in a new unit (or N identical units) at the
// warehouse (GRN-in). Direct insert via the user session (RLS), mirroring the
// /condition PATCH; no RPC needed (Jess 2026-06-29). Defaults to Carres Klang.
opsStockRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockCreateInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);

  let whId = parsed.warehouseId ?? null;
  if (!whId) {
    const { data: wh } = await sb
      .from("warehouses")
      .select("id")
      .ilike("name", "%klang%")
      .limit(1)
      .maybeSingle();
    whId = (wh as { id: string } | null)?.id ?? null;
  }
  if (!whId) {
    throw new HTTPException(400, { message: "Carres Klang warehouse not found" });
  }

  const reservedRef = parsed.status === "reserved" ? parsed.reservedRef ?? null : null;
  const rows = Array.from({ length: parsed.qty }, () => ({
    sku: parsed.sku,
    warehouse_id: whId,
    condition: parsed.condition,
    status: parsed.status,
    reserved_ref: reservedRef,
    supplier: parsed.supplier ?? null,
    po_no: parsed.poNo ?? null,
    source_ref: parsed.sourceRef ?? null,
  }));

  const { data, error } = await sb.from("ops_stock_items").insert(rows).select("id");
  if (error) throw mapErr(error);
  return c.json({ created: (data ?? []).length }, 201);
});

// POST /import — bulk book-in from the "Klg Warehouse" ready-stock sheet.
// The sheet is LINE-based: one sheet line = one stock record carrying its `qty`
// (0218) — a bulk accessory line (e.g. 555 pillows) is ONE record, NOT 555
// serialized units. Idempotency is COUNT-BASED per stable physical-identity key
// and is server-authoritative: we fetch the current pool, reconcile against it,
// and insert only the deficit. Re-importing the same sheet adds nothing, while
// genuinely-identical units (same model, blank OLD REF/PO) are still all kept.
// Add-only: existing rows are never updated/removed (snapshot-replace deferred).
// Defaults to Carres Klang.
opsStockRouter.post("/import", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockImportInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);

  let whId = parsed.warehouseId ?? null;
  if (!whId) {
    const { data: wh } = await sb
      .from("warehouses")
      .select("id")
      .ilike("name", "%klang%")
      .limit(1)
      .maybeSingle();
    whId = (wh as { id: string } | null)?.id ?? null;
  }
  if (!whId) {
    throw new HTTPException(400, { message: "Carres Klang warehouse not found" });
  }

  // Server-authoritative reconcile: the client preview is advisory; the truth
  // is the current pool for THIS warehouse. Any status counts (a unit reserved
  // since the sheet was cut still counts against the sheet's line, so we don't
  // re-add it). Paginate — PostgREST caps a single select at 1000 rows, and the
  // pool can grow past that (scale target 1000+ units); a truncated read would
  // silently re-add duplicates.
  const existing: StockUnitKeyParts[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: exErr } = await sb
      .from("ops_stock_items")
      .select("sku, condition, po_no, source_ref, supplier")
      .eq("warehouse_id", whId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (exErr) throw mapErr(exErr);
    const rows = (page ?? []) as Array<{
      sku: string;
      condition: string;
      po_no: string | null;
      source_ref: string | null;
      supplier: string | null;
    }>;
    for (const r of rows) {
      existing.push({
        sku: r.sku,
        condition: r.condition,
        poNo: r.po_no,
        sourceRef: r.source_ref,
        supplier: r.supplier,
      });
    }
    if (rows.length < PAGE) break;
  }

  const { toInsert, alreadyInCount, desiredCount } = reconcileStockImport(
    parsed.rows,
    existing,
  );

  const units = toInsert.map((r) => ({
    sku: r.sku,
    warehouse_id: whId,
    condition: r.condition,
    status: r.status,
    qty: r.qty,
    reserved_ref: r.status === "reserved" ? r.reservedRef ?? null : null,
    supplier: r.supplier ?? null,
    po_no: r.poNo ?? null,
    source_ref: r.sourceRef ?? null,
    date_in: r.dateIn ?? null,
  }));

  let created = 0;
  for (let i = 0; i < units.length; i += 500) {
    const { data, error } = await sb
      .from("ops_stock_items")
      .insert(units.slice(i, i + 500))
      .select("id");
    if (error) throw mapErr(error);
    created += (data ?? []).length;
  }
  return c.json(
    { created, alreadyIn: alreadyInCount, total: desiredCount },
    201,
  );
});

// DELETE /:itemId — remove a mis-keyed unit (hard delete). For fixing a wrong
// entry; selling/transferring goes through /takeout, not this.
opsStockRouter.delete("/:itemId", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from("ops_stock_items").delete().eq("id", itemId);
  if (error) throw mapErr(error);
  return c.json({ itemId });
});

// =====================================================================
// Helpers
// =====================================================================

interface RawRow {
  id: string;
  // 0153 — forced per-unit serial (id-abc123456), minted at PO-open.
  unit_code: string | null;
  sku: string;
  warehouse_id: string;
  condition: "new" | "exhibition" | "old" | "refurbished" | "damaged";
  // 0153 added 'incoming' (PO opened, not yet at WH) + 'voided' (PO cancelled).
  status: "incoming" | "free" | "reserved" | "sold" | "transferred" | "voided";
  reserved_ref: string | null;
  ref_history: string[];
  needs_repair: boolean;
  // 0218 — units represented by this record (1 for serialized furniture).
  qty: number;
  supplier: string | null;
  po_no: string | null;
  source_ref: string | null;
  date_in: string | null;
  // 0212 — why a ready-pool unit was pulled: 'urgent' | 'exchange' | null.
  reserve_reason: string | null;
  // 0153 — sale linkage set on delivery.
  sold_at: string | null;
  sold_order_id: string | null;
  created_at: string;
  updated_at: string;
}

function shape(rows: RawRow[]) {
  return rows.map((r) => ({
    id: r.id,
    unitCode: r.unit_code,
    sku: r.sku,
    warehouseId: r.warehouse_id,
    condition: r.condition,
    status: r.status,
    reservedRef: r.reserved_ref,
    refHistory: r.ref_history ?? [],
    needsRepair: r.needs_repair,
    qty: r.qty ?? 1,
    supplier: r.supplier,
    poNo: r.po_no,
    sourceRef: r.source_ref,
    dateIn: r.date_in,
    reserveReason: r.reserve_reason ?? null,
    soldAt: r.sold_at,
    soldOrderId: r.sold_order_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid input: " + parsed.error.issues[0]?.message,
    });
  }
  return parsed.data;
}

function mapErr(error: { code?: string; message?: string }): HTTPException {
  if (error.code === "42501") return new HTTPException(403, { message: error.message ?? "Forbidden" });
  if (error.code === "22023") return new HTTPException(400, { message: error.message ?? "Invalid" });
  return new HTTPException(500, { message: error.message ?? "ops_stock RPC failed" });
}

export default opsStockRouter;
