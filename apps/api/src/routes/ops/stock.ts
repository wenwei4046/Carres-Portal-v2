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
  opsReorderPointInputSchema,
  opsReserveLevelInputSchema,
  reconcileStockImport,
  computeReorderRows,
  reorderAlertCount,
  reorderUnsetCount,
  computeReserveLevelRows,
  summarisePoolUsage,
  POOL_USE_REASON_LABEL,
  isStockPlanner,
  type StockUnitKeyParts,
  type PlanStockUnit,
  type PoolUsageEntry,
  type PoolUseReason,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { myDuties } from "../../lib/duties";
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
 * Reorder points — K1 (migration 0286):
 *   GET  /reorder — current · reorder point · incoming, per watched SKU
 *   PUT  /reorder — set one point (COO duty / principal, re-gated in SQL)
 *
 * Pool usage + reserve levels — K4 (migration 0292):
 *   GET  /usage         — a month's draws, split by reason, + the levels
 *   PUT  /reserve-level — set one SKU's floor (COO duty, re-gated in SQL)
 *   /reserve and /reserve-item now go through `ops_stock_pool_draw`, which
 *   takes the unit AND writes the reason in ONE transaction. 0213's
 *   best-effort stamp-after-the-fact is gone: a draw either happens with a
 *   reason or does not happen.
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
// Reorder points — Ready Stock K1 (migration 0286)
// =====================================================================

/**
 * GET /reorder — `current · reorder point · incoming` per watched SKU, plus
 * the `Reorder stock` alert count.
 *
 * The whole judgement is made HERE, by the shared pure engine, so the browser
 * and any future consumer (the dashboard tile, a cron) can never disagree
 * about what "below the point" means — the HR-P5 one-engine lesson.
 */
opsStockRouter.get("/reorder", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [stockRes, pointsRes] = await Promise.all([
    sb.from("ops_stock_items").select("sku,status,qty"),
    sb.from("ops_reorder_points").select("sku,reorder_point,lead_days,note"),
  ]);
  if (stockRes.error) throw new HTTPException(500, { message: stockRes.error.message });
  if (pointsRes.error) throw new HTTPException(500, { message: pointsRes.error.message });

  const rows = computeReorderRows(
    (stockRes.data ?? []) as { sku: string; status: string; qty: number | null }[],
    ((pointsRes.data ?? []) as {
      sku: string;
      reorder_point: number;
      lead_days: number | null;
      note: string | null;
    }[]).map((p) => ({
      sku: p.sku,
      reorderPoint: p.reorder_point,
      leadDays: p.lead_days,
      note: p.note,
    })),
  );

  return c.json({
    rows,
    alertCount: reorderAlertCount(rows),
    unsetCount: reorderUnsetCount(rows),
    // A client-supplied duty is never trusted for the write (the RPC re-gates
    // in SQL); this only decides whether the pencil renders.
    canEdit: isStockPlanner(c.var.auth.role, c.var.auth.email, await myDuties(c)),
  });
});

/** PUT /reorder — set (or switch off, with 0) one SKU's reorder point. */
opsStockRouter.put("/reorder", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsReorderPointInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_set_reorder_point", {
    p_sku: parsed.sku,
    p_point: parsed.reorderPoint,
    p_lead_days: parsed.leadDays ?? null,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ sku: parsed.sku, reorderPoint: parsed.reorderPoint });
});

// =====================================================================
// Pool usage + reserve levels — Ready Stock K4 (migration 0292)
// =====================================================================

/**
 * GET /usage?period=YYYY-MM — where the ready stock went that month, and how
 * low each SKU is allowed to go.
 *
 * The month is sliced HERE (Asia/Kuala_Lumpur, the only calendar the warehouse
 * lives in) and every number is decided by the shared pure engine, so the
 * browser and any later consumer can never disagree about what a share means.
 */
opsStockRouter.get("/usage", requireOperationOrPrincipal, async (c) => {
  const period = monthParam(c.req.query("period"));
  const sb = userClient(c.env, c.var.auth.jwt);

  const [usageRes, stockRes, levelRes] = await Promise.all([
    sb
      .from("ops_stock_pool_usage")
      .select("id,sku,qty,reason,note,ref,taken_by,taken_at")
      .gte("taken_at", monthStartIso(period))
      .lt("taken_at", monthStartIso(nextMonth(period)))
      .order("taken_at", { ascending: false }),
    sb.from("ops_stock_items").select("sku,status,qty"),
    sb.from("ops_stock_reserve_levels").select("sku,reserve_level,note"),
  ]);
  if (usageRes.error) throw new HTTPException(500, { message: usageRes.error.message });
  if (stockRes.error) throw new HTTPException(500, { message: stockRes.error.message });
  if (levelRes.error) throw new HTTPException(500, { message: levelRes.error.message });

  const raw = (usageRes.data ?? []) as {
    id: string;
    sku: string;
    qty: number;
    reason: PoolUseReason;
    note: string | null;
    ref: string | null;
    taken_by: string;
    taken_at: string;
  }[];

  const names = await nameMap(sb, [...new Set(raw.map((r) => r.taken_by))]);
  const entries: PoolUsageEntry[] = raw.map((r) => ({
    id: r.id,
    sku: r.sku,
    qty: r.qty,
    reason: r.reason,
    note: r.note,
    ref: r.ref,
    takenByName: names.get(r.taken_by) ?? null,
    takenAt: r.taken_at,
  }));

  const summary = summarisePoolUsage(entries);
  const levels = computeReserveLevelRows(
    (stockRes.data ?? []) as PlanStockUnit[],
    ((levelRes.data ?? []) as {
      sku: string;
      reserve_level: number;
      note: string | null;
    }[]).map((l) => ({ sku: l.sku, reserveLevel: l.reserve_level, note: l.note })),
  );

  return c.json({
    period,
    totalUnits: summary.totalUnits,
    totalDraws: summary.totalDraws,
    byReason: summary.byReason,
    bySku: summary.bySku,
    entries: entries.map((e) => ({
      ...e,
      label: POOL_USE_REASON_LABEL[e.reason] ?? e.reason,
    })),
    levels,
    lowCount: levels.filter((l) => l.state === "low").length,
    // A client-supplied duty is never trusted for the write (the RPC re-gates
    // in SQL); this only decides whether the pencil renders.
    canEdit: isStockPlanner(c.var.auth.role, c.var.auth.email, await myDuties(c)),
  });
});

/** PUT /reserve-level — set (or switch off, with 0) one SKU's floor. */
opsStockRouter.put("/reserve-level", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsReserveLevelInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_set_reserve_level", {
    p_sku: parsed.sku,
    p_level: parsed.reserveLevel,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ sku: parsed.sku, reserveLevel: parsed.reserveLevel });
});

// =====================================================================
// POST actions — thin wrappers over the SECURITY DEFINER RPCs.
// =====================================================================

// /reserve — take the OLDEST free unit of a SKU (the On-hand box). K4 (0292):
// the pick rule is unchanged (FIFO, SKIP LOCKED, same warehouse default); what
// changed is that the reason is written in the same transaction, so the "no
// matching free unit" answer and the ledger can never disagree.
opsStockRouter.post("/reserve", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReserveInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_pool_draw", {
    p_ref: parsed.ref,
    p_reason: parsed.reason,
    p_note: parsed.note ?? null,
    p_item_id: null,
    p_sku: parsed.sku,
    p_condition: parsed.condition ?? null,
    p_wh: parsed.warehouseId ?? null,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(404, {
      message: "No matching free unit available for this SKU",
    });
  }
  return c.json({ itemId: data });
});

// /reserve-item — reserve ONE specific free unit to a customer ref (the
// order-drawer Ready picker, Jess 2026-06-30). The operator picked the exact
// unit (matched to the order line via normalizeSkuKey on the client), so we
// target by id. K4 (0292) moved the flip into `ops_stock_pool_draw` so the
// reason lands with it; the status='free' guard survives inside the RPC, so a
// unit grabbed by someone else still returns 409, not a silent over-reserve.
opsStockRouter.post("/reserve-item", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockReserveItemInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_pool_draw", {
    p_ref: parsed.ref,
    p_reason: parsed.reason,
    p_note: parsed.note ?? null,
    p_item_id: parsed.itemId,
    p_sku: null,
    p_condition: null,
    p_wh: null,
  });
  if (error) throw mapErr(error);
  if (!data) {
    throw new HTTPException(409, {
      message: "Unit is no longer free (already reserved / sold / flagged)",
    });
  }
  return c.json({ itemId: data });
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
  // K4 (0294) — a takeout straight off the FREE shelf is a pool draw and the
  // RPC refuses it without a reason. Whether it is one is decided in SQL from
  // the unit's locked row, never from what the browser believed its status was.
  const { data, error } = await sb.rpc("ops_stock_takeout", {
    p_item_id: parsed.itemId,
    p_reason: parsed.reason ?? null,
    p_note: parsed.note ?? null,
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

/** This month in Asia/Kuala_Lumpur — the only calendar the warehouse lives in. */
function thisMonthMyt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
}

/** A malformed `?period=` reads as "this month" rather than 500-ing: the
 *  screen's default question is always the current month anyway. */
function monthParam(raw: string | undefined): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : thisMonthMyt();
}

/** MYT midnight on the 1st, as an offset-carrying ISO string Postgres can
 *  compare against a timestamptz without guessing a zone. */
function monthStartIso(period: string): string {
  return `${period}-01T00:00:00+08:00`;
}

function nextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

async function nameMap(
  sb: ReturnType<typeof userClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await sb.from("app_users").select("id,name").in("id", ids);
  for (const u of (data ?? []) as { id: string; name: string | null }[]) {
    if (u.name) map.set(u.id, u.name);
  }
  return map;
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
