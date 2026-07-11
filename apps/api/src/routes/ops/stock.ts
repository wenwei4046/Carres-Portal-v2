import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockReserveInputSchema,
  opsStockReserveItemInputSchema,
  opsStockReleaseInputSchema,
  opsStockReassignInputSchema,
  opsStockTakeoutInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockCreateInputSchema,
  opsStockImportInputSchema,
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

// POST /import — bulk book-in from the "Klg Warehouse" ready-stock sheet
// (On Hand C+ P3). Add-only: each import row is expanded to `qty` units and
// inserted (same RLS insert as "+ Add stock", chunked for a large sheet). The
// client does the New-vs-duplicate preview + only sends the rows to add;
// snapshot-replace is intentionally NOT here (it would wipe reserved links —
// deferred to a guarded P3b). Defaults to Carres Klang.
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

  const units = parsed.rows.flatMap((r) =>
    Array.from({ length: r.qty }, () => ({
      sku: r.sku,
      warehouse_id: whId,
      condition: r.condition,
      status: r.status,
      reserved_ref: r.status === "reserved" ? r.reservedRef ?? null : null,
      supplier: r.supplier ?? null,
      po_no: r.poNo ?? null,
      source_ref: r.sourceRef ?? null,
      date_in: r.dateIn ?? null,
    })),
  );

  let created = 0;
  for (let i = 0; i < units.length; i += 500) {
    const { data, error } = await sb
      .from("ops_stock_items")
      .insert(units.slice(i, i + 500))
      .select("id");
    if (error) throw mapErr(error);
    created += (data ?? []).length;
  }
  return c.json({ created }, 201);
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
