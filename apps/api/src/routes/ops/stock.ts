import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  opsStockReserveInputSchema,
  opsStockReserveItemInputSchema,
  opsStockReleaseInputSchema,
  opsStockReassignInputSchema,
  opsStockTakeoutInputSchema,
  opsStockHoldUnitInputSchema,
  opsStockResolveUnitHoldInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockRefurbishInputSchema,
  opsStockRefurbishCompleteInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockSetSiteInputSchema,
  opsStockSetHolderInputSchema,
  opsStockSetOwnershipInputSchema,
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
  computeStockHealthRows,
  stockHealthCounts,
  stockHealthHeadline,
  computeSlowMovers,
  computePlanAccuracy,
  type StockRegisterUnit,
  type StockUnitKeyParts,
  type PlanSalesLine,
  type PlanStatus,
  type PlanStockUnit,
  type PoolUsageEntry,
  type PoolUseReason,
  unitAvailability,
  unitLifecycleOutcome,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { stockRegisterContext } from "../../lib/stock-register-context";
import { attemptDeliveryOrderIssue } from "../../lib/delivery-order-issue";
import { myDuties } from "../../lib/duties";
import { skuCategories } from "../../lib/sku-categories";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Per-unit stock register (migration 0137) — Carres Klang scope.
 *
 * GET endpoints (4 list views the operation panel renders):
 *   /ready      — status='free' AND condition∈('new','exhibition') AND !needs_repair
 *   /reserved   — status='reserved'
 *   /repair     — needs_repair=true OR condition∈('old','damaged')
 *   /inventory  — everything (master grid), each row carrying its CATALOG
 *                 category (D9). The other three do not ask, so their rows
 *                 carry no `category` key at all rather than a null that would
 *                 read as "the catalog has no row for this".
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
 *
 * Stock health + proposal accuracy — K5 (NO migration):
 *   GET  /health — the ladder, the slow-moving alert and per-month accuracy.
 *   Read-only: it asks K1's points, K4's levels and K2's cycles and adds no
 *   number of its own.
 *
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

/**
 * /inventory — the master grid, and the only list view that carries a CATEGORY.
 *
 * D9 (ERP-ARCHITECTURE §3.1): *"what kind of product is this?"* is the
 * CATALOG's answer and nobody else's. The category is resolved through
 * `sku → product_skus → product_models.category` by the ONE shared reader every
 * other gate already asks (`skuCategories`), so this screen can never disagree
 * with the earliest-sell floor or the goods gate about what a sofa is.
 *
 * **Nothing here reads the SKU TEXT.** The prefix/regex guessers that D9 was
 * raised against are wrong for every live SKU; a unit the catalog does not hold
 * comes back `category: null` and says so on screen.
 */
opsStockRouter.get("/inventory", requireOperationOrPrincipal, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("*")
    .order("sku", { ascending: true })
    .order("status", { ascending: true });
  if (error) throw new HTTPException(500, { message: error.message });
  const rows = (data ?? []) as RawRow[];
  const categories = await skuCategories(sb, rows.map((r) => r.sku));
  const items = shape(rows).map((item) => ({
    ...item,
    category: categories.get(item.sku) ?? null,
  }));
  return c.json({ items, total: rows.length });
});

// =====================================================================
// THE STOCK REGISTER — CARD-2026-08-20-stock-register
// =====================================================================

/**
 * GET /register — the one current listing of controlled Units.
 *
 * READ-ONLY, AND THAT IS THE DESIGN. Stock exposes no second reservation
 * editor: choosing, binding, substituting and releasing an exact Unit are the
 * Sales Order's decisions (Stock MASTER §4, Card §2). This endpoint therefore
 * has no sibling POST and the page it feeds has no row-level editor.
 *
 * It reads `stock_unit_register_v` (0373) — the Unit register plus the last
 * PHYSICAL event — and nothing else. It does NOT:
 *   · touch `ops_stock_items` directly (0366 left it with no write policy, and
 *     a register has no business reading around the governed view anyway);
 *   · read `stock_balances`, which since 0366 is a non-authoritative cache and
 *     may never answer whether goods can be offered;
 *   · re-derive availability. `availability` and `lifecycle_outcome` arrive
 *     already decided by the one arithmetic, and this route copies them across
 *     without an opinion (Law D).
 *
 * The whole current register is returned in one read and filtered in the
 * browser, exactly as `/inventory` has been: 136 Units today, and the rail has
 * to count every section (`Available 85`, `Not in catalog 87`) to draw itself,
 * which a server-side page of 50 cannot do without a second round trip per
 * chip. When the register outgrows one read, the counts move to
 * `stock_sku_availability` and the rows paginate — the shape that changes then
 * is this endpoint's, not the page's.
 */
opsStockRouter.get("/register", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data, error } = await sb
    .from("stock_unit_register_v")
    .select(
      "id, unit_code, sku, category, warehouse_id, site_name, holder_party_id, " +
        "holder_name, ownership, supplier, po_no, status, condition, needs_repair, " +
        "hold_reason, reserved_ref, sold_order_id, qty, date_in, last_verified_at, " +
        "availability, lifecycle_outcome, last_event_at, last_event",
    )
    .order("unit_code", { ascending: true });
  if (error) throw mapErr(error);

  const units = (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      unitCode: row.unit_code as string,
      sku: row.sku as string,
      category: (row.category as string | null) ?? null,
      warehouseId: (row.warehouse_id as string | null) ?? null,
      siteName: (row.site_name as string | null) ?? null,
      holderPartyId: (row.holder_party_id as string | null) ?? null,
      holderName: (row.holder_name as string | null) ?? null,
      ownership: row.ownership as string,
      supplier: (row.supplier as string | null) ?? null,
      poNo: (row.po_no as string | null) ?? null,
      status: row.status as string,
      condition: row.condition as string,
      needsRepair: Boolean(row.needs_repair),
      holdReason: (row.hold_reason as string | null) ?? null,
      reservedRef: (row.reserved_ref as string | null) ?? null,
      soldOrderId: (row.sold_order_id as string | null) ?? null,
      qty: (row.qty as number | null) ?? 1,
      dateIn: (row.date_in as string | null) ?? null,
      lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
      availability: row.availability as StockRegisterUnit["availability"],
      lifecycleOutcome: row.lifecycle_outcome as string,
      lastEventAt: (row.last_event_at as string | null) ?? null,
      lastEvent: (row.last_event as string | null) ?? null,
    } satisfies StockRegisterUnit;
  });

  try {
    return c.json({ units: await stockRegisterContext(sb, units), total: units.length });
  } catch (error) {
    throw mapErr(error as { code?: string; message?: string });
  }
});

/**
 * GET /register/:unitCode — one Unit, for the Unit object page.
 *
 * Looked up by the PERMANENT Carres Unit ID, never by the row's uuid: the ID is
 * what is printed on the supplier's label and what an operator types, and it is
 * the thing 0366 promised never changes and is never reused. A Unit whose life
 * has ended still resolves here — Card §1 keeps ended Units out of the default
 * LIST, not out of history.
 *
 * `events` is the append-only physical lineage, newest first, ordered by `seq`
 * and never by `event_at` (0372: two events in one statement can share a clock
 * reading to the microsecond, and a lineage ordered by a tying key is not a
 * lineage).
 */
opsStockRouter.get("/register/:unitCode", requireOperationOrPrincipal, async (c) => {
  const unitCode = c.req.param("unitCode");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data, error } = await sb
    .from("stock_unit_register_v")
    .select(
      "id, unit_code, sku, category, warehouse_id, site_name, holder_party_id, " +
        "holder_name, ownership, supplier, po_no, status, condition, needs_repair, " +
        "hold_reason, reserved_ref, sold_order_id, qty, date_in, last_verified_at, " +
        "availability, lifecycle_outcome, last_event_at, last_event",
    )
    .eq("unit_code", unitCode)
    .maybeSingle();
  if (error) throw mapErr(error);
  if (!data) throw new HTTPException(404, { message: "No Unit with that ID" });

  const row = data as unknown as Record<string, unknown>;
  const unit = {
    id: row.id as string,
    unitCode: row.unit_code as string,
    sku: row.sku as string,
    category: (row.category as string | null) ?? null,
    warehouseId: (row.warehouse_id as string | null) ?? null,
    siteName: (row.site_name as string | null) ?? null,
    holderPartyId: (row.holder_party_id as string | null) ?? null,
    holderName: (row.holder_name as string | null) ?? null,
    ownership: row.ownership as string,
    supplier: (row.supplier as string | null) ?? null,
    poNo: (row.po_no as string | null) ?? null,
    status: row.status as string,
    condition: row.condition as string,
    needsRepair: Boolean(row.needs_repair),
    holdReason: (row.hold_reason as string | null) ?? null,
    reservedRef: (row.reserved_ref as string | null) ?? null,
    soldOrderId: (row.sold_order_id as string | null) ?? null,
    qty: (row.qty as number | null) ?? 1,
    dateIn: (row.date_in as string | null) ?? null,
    lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
    availability: row.availability as StockRegisterUnit["availability"],
    lifecycleOutcome: row.lifecycle_outcome as string,
    lastEventAt: (row.last_event_at as string | null) ?? null,
    lastEvent: (row.last_event as string | null) ?? null,
  } satisfies StockRegisterUnit;

  const { data: evRows, error: evErr } = await sb
    .from("stock_unit_events")
    .select("id, event, from_value, to_value, note, event_at, seq")
    .eq("unit_id", unit.id)
    .order("seq", { ascending: false })
    .limit(200);
  if (evErr) throw mapErr(evErr);

  const events = (evRows ?? []).map((e) => {
    const ev = e as unknown as Record<string, unknown>;
    return {
      id: ev.id as string,
      event: ev.event as string,
      fromValue: (ev.from_value as string | null) ?? null,
      toValue: (ev.to_value as string | null) ?? null,
      note: (ev.note as string | null) ?? null,
      eventAt: ev.event_at as string,
    };
  });

  return c.json({ unit, events });
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

// =====================================================================
// Stock health + proposal accuracy — Ready Stock K5 (no migration)
// =====================================================================

/**
 * GET /health — the review layer, in one answer.
 *
 * "COO opens one tab and knows what needs attention today — without reading SKU
 * rows", so the headline sentence, the ladder counts, the slow-moving alert and
 * the per-month accuracy are all decided HERE by the shared pure engine.
 *
 * It READS ONLY. K5 mints no table, no duty and no number of its own: the
 * ladder asks K1's reorder points and K4's reserve levels, and the accuracy
 * asks K2's own cycles. There is no PUT on this endpoint because there is
 * nothing here a person sets.
 */
opsStockRouter.get("/health", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const asOf = todayMyt();

  // The plans decide how far back the sales window must reach: a month can only
  // be scored if its own sales were fetched. Read them first for that reason.
  const { data: planRows, error: planErr } = await sb
    .from("ops_stock_plans")
    .select("id,period,status")
    .eq("status", "approved");
  if (planErr) throw new HTTPException(500, { message: planErr.message });
  const plans = (planRows ?? []) as { id: string; period: string; status: PlanStatus }[];

  const oldestPlanMonth = plans
    .map((p) => String(p.period).slice(0, 7))
    .sort()[0];
  const windowStart = earliest(
    isoDaysAgo(HEALTH_SALES_LOOKBACK_DAYS, asOf),
    oldestPlanMonth ? `${oldestPlanMonth}-01` : null,
  );

  const [stockRes, pointRes, levelRes, salesRes, firstOrderRes, lineRes, propRes] =
    await Promise.all([
      sb.from("ops_stock_items").select("sku,status,qty"),
      sb.from("ops_reorder_points").select("sku,reorder_point"),
      sb.from("ops_stock_reserve_levels").select("sku,reserve_level"),
      sb
        .from("order_lines")
        .select("sku,qty,orders!inner(placed_at,status,source_system)")
        .gte("orders.placed_at", windowStart),
      // When the first REAL order was placed. `source_system` is NULL on every
      // native order and only the AutoCount archive fills it, so this has to be
      // an explicit `is null OR neq` — a plain `not.eq.autocount` drops NULLs
      // and would return no rows at all (measured on prod: 19 native orders,
      // all NULL).
      sb
        .from("orders")
        .select("placed_at")
        .or("source_system.is.null,source_system.neq.autocount")
        .order("placed_at", { ascending: true })
        .limit(1),
      plans.length > 0
        ? sb
            .from("ops_stock_plan_lines")
            .select("plan_id,sku,consolidated_qty,approved_qty")
            .in("plan_id", plans.map((p) => p.id))
        : Promise.resolve({ data: [], error: null }),
      plans.length > 0
        ? sb
            .from("ops_stock_plan_proposals")
            .select("plan_id,sku,qty,proposed_by")
            .in("plan_id", plans.map((p) => p.id))
        : Promise.resolve({ data: [], error: null }),
    ]);
  for (const r of [stockRes, pointRes, levelRes, salesRes, firstOrderRes, lineRes, propRes])
    if (r.error) throw new HTTPException(500, { message: r.error.message });

  const units = (stockRes.data ?? []) as PlanStockUnit[];
  const sales = toHealthSalesLines(
    (salesRes.data ?? []) as HealthSalesJoinRow[],
  );

  // The window is complete only from whichever is LATER: where we looked, and
  // when the first real order was placed. Claiming either alone is a lie in one
  // direction each — see `withSalesKnownFrom` in the shared engine.
  const firstOrderOn = (
    (firstOrderRes.data ?? []) as { placed_at: string | null }[]
  )[0]?.placed_at;
  const salesKnownFrom = firstOrderOn
    ? latest(windowStart, String(firstOrderOn).slice(0, 10))
    : null;

  const rows = computeStockHealthRows(
    units,
    ((pointRes.data ?? []) as { sku: string; reorder_point: number }[]).map((p) => ({
      sku: p.sku,
      reorderPoint: p.reorder_point,
    })),
    ((levelRes.data ?? []) as { sku: string; reserve_level: number }[]).map((l) => ({
      sku: l.sku,
      reserveLevel: l.reserve_level,
    })),
  );
  const counts = stockHealthCounts(rows);

  const slow = computeSlowMovers({ units, sales, asOf, salesKnownFrom });

  const linesByPlan = groupBy(
    (lineRes.data ?? []) as {
      plan_id: string;
      sku: string;
      consolidated_qty: number | null;
      approved_qty: number | null;
    }[],
    (l) => l.plan_id,
  );
  const propsByPlan = groupBy(
    (propRes.data ?? []) as {
      plan_id: string;
      sku: string;
      qty: number;
      proposed_by: string;
    }[],
    (p) => p.plan_id,
  );

  const accuracy = computePlanAccuracy({
    plans: plans.map((p) => ({
      period: String(p.period).slice(0, 7),
      status: p.status,
      lines: (linesByPlan.get(p.id) ?? []).map((l) => ({
        sku: l.sku,
        consolidatedQty: l.consolidated_qty,
        approvedQty: l.approved_qty,
      })),
      proposals: (propsByPlan.get(p.id) ?? []).map((pr) => ({
        sku: pr.sku,
        qty: pr.qty,
        proposedBy: pr.proposed_by,
      })),
    })),
    units,
    sales,
    asOf,
    salesKnownFrom,
  });

  return c.json({
    headline: stockHealthHeadline(counts),
    counts,
    rows,
    slowMovers: slow.rows,
    slowWindows: slow.windows,
    slowWithheldReason: slow.withheldReason,
    accuracy,
  });
});

/**
 * How far back the health read fetches sales lines.
 *
 * 200 days covers the deepest slow-moving window (180) with room to spare. It
 * is a WINDOW, not a claim: `salesKnownFrom` tells the engine exactly where it
 * ends, so a shorter window can never be mistaken for a shorter history.
 */
const HEALTH_SALES_LOOKBACK_DAYS = 200;

interface HealthSalesJoinRow {
  sku: string | null;
  qty: number | null;
  orders:
    | { placed_at: string | null; status: string | null; source_system: string | null }
    | { placed_at: string | null; status: string | null; source_system: string | null }[]
    | null;
}

/** Same flattening + archive flagging K2's route does (0265's law). */
function toHealthSalesLines(rows: readonly HealthSalesJoinRow[]): PlanSalesLine[] {
  const out: PlanSalesLine[] = [];
  for (const r of rows) {
    const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    if (!o?.placed_at || !r.sku) continue;
    out.push({
      sku: r.sku,
      qty: r.qty ?? 0,
      soldOn: String(o.placed_at).slice(0, 10),
      fromArchive: o.source_system === "autocount",
      cancelled: o.status === "cancelled",
    });
  }
  return out;
}

function isoDaysAgo(days: number, asOf: string): string {
  const [y, m, d] = asOf.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function earliest(a: string, b: string | null): string {
  return b && b < a ? b : a;
}
function latest(a: string, b: string): string {
  return b > a ? b : a;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const arr = out.get(k) ?? out.set(k, []).get(k)!;
    arr.push(row);
  }
  return out;
}

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

/**
 * SLICE 2 — reserving a unit to a Sales Order may have been the LAST open
 * requirement on its delivery-order gate, and the ruling says the SYSTEM
 * issues the document the moment every requirement holds
 * (`docs/orders/MASTER.md` §8: no Release button, no manual bypass).
 *
 * FAIL-SOFT and FIRE-AND-CHECK: an issuance hiccup must never undo or refuse
 * the reservation the operator just made — the facts persist, and the next
 * door (or the manual backstop) issues it. Only a `SO-{n}` ref can name an
 * order; every other ref (loans, partners) has no delivery-order gate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attemptIssueForReservedRef(sb: any, ref: string): Promise<void> {
  const m = /^SO-(\d+)$/.exec(ref.trim());
  if (!m) return;
  try {
    const { data: order } = await sb
      .from("orders")
      .select("id")
      .eq("so", Number(m[1]))
      .maybeSingle();
    if (order?.id) await attemptDeliveryOrderIssue(sb, order.id as string);
  } catch {
    // Not issued yet — the gate facts persist and the next door tries again.
  }
}

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
  await attemptIssueForReservedRef(sb, parsed.ref);
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
  await attemptIssueForReservedRef(sb, parsed.ref);
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

// CARD 2 (0341) — the inspection ENTRY door. A wrong / surplus / released /
// customer-rejected unit goes free|reserved → on_hold with a reason and NO
// supplier claim (claims are still born only at receiving). A reserved unit's
// ref moves into ref_history; the SO keeps owing through Card 1's truth.
opsStockRouter.post("/hold", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockHoldUnitInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_hold_unit", {
    p_item_id: parsed.itemId,
    p_reason: parsed.reason,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json(data);
});

// CARD 2 (0341) — the inspection EXIT door. A claimless hold ends
// back_to_stock (Available) or written_off; `returned` needs the claim door.
opsStockRouter.post("/hold-resolve", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockResolveUnitHoldInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_resolve_unit_hold", {
    p_item_id: parsed.itemId,
    p_outcome: parsed.outcome,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json(data);
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

// 0366 — every write below goes through a governed SECURITY DEFINER door.
// The register no longer carries a write policy at all, so a raw
// `.update()` here would simply be refused by RLS; these are not stylistic
// wrappers, they are the only way in.
opsStockRouter.patch("/:itemId/condition", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockUpdateConditionInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("ops_stock_set_condition", {
    p_item_id: itemId,
    p_condition: parsed.condition,
    p_note: null,
  });
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
  const { data, error } = await sb.rpc("ops_stock_refurbish", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

// POST /refurbish-complete — repair done: grade the unit up to 'refurbished'
// (sellable as new) and return it to the Free ready-stock pool. Guarded on
// needs_repair=true so completing a unit that isn't in repair 409s.
opsStockRouter.post("/refurbish-complete", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, opsStockRefurbishCompleteInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_refurbish_complete", {
    p_item_id: parsed.itemId,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

// =====================================================================
// 0366 · THE UNIT FACTS — one door each
//
// WHERE and WHO HAS IT are separate facts and move separately: a Unit can sit
// in the Klang warehouse while NETS Delivery is responsible for it, and it can
// change hands without changing Site (Stock MASTER §3). Ownership is
// Purchasing's answer to why Carres holds the goods. Every one of them leaves
// an append-only event behind it.
// =====================================================================

opsStockRouter.post("/:itemId/site", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockSetSiteInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_set_site", {
    p_item_id: itemId,
    p_warehouse_id: parsed.warehouseId,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

opsStockRouter.post("/:itemId/holder", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockSetHolderInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_set_holder", {
    p_item_id: itemId,
    p_party_code: parsed.partyCode,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

opsStockRouter.post("/:itemId/ownership", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const parsed = await parseBody(c, opsStockSetOwnershipInputSchema);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_set_ownership", {
    p_item_id: itemId,
    p_ownership: parsed.ownership,
    p_supplier: parsed.supplier ?? null,
    p_note: parsed.note ?? null,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

// A person physically confirmed this Unit. Never inferred from an edit — an
// operator opening a screen is not an operator looking at a sofa.
opsStockRouter.post("/:itemId/verify", requireOperationOrPrincipal, async (c) => {
  const itemId = c.req.param("itemId");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("ops_stock_verify_unit", {
    p_item_id: itemId,
  });
  if (error) throw mapErr(error);
  return c.json({ itemId: data as string });
});

// GET /parties — WHO HAS IT, as configured. NETS is a row here, never a Site
// and never a hard-coded name in this file.
opsStockRouter.get("/parties", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("stock_operating_parties")
    .select("id, code, name, kind, active")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) throw mapErr(error);
  return c.json({ parties: data ?? [] });
});

// 0366 — "+ Add stock" IS GONE. A Unit is BORN when a PO or Consignment
// Order is confirmed (Card §2), and inventory that appears without one is
// inventory nobody ordered. `POST /` had no browser caller; the endpoint
// itself was the last way to mint stock outside Purchasing.
//
// 0366 — `DELETE /:itemId` IS GONE too. A Unit ID must follow the physical
// item forever and is never reused after cancellation, delivery, supplier
// return, write-off or disposal. A mis-keyed row now ends its lifecycle
// (void / write-off) and keeps its identity; the database refuses the delete
// even if a client tries.

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
    condition: r.condition,
    status: r.status,
    qty: r.qty,
    reservedRef: r.status === "reserved" ? r.reservedRef ?? null : null,
    supplier: r.supplier ?? null,
    poNo: r.poNo ?? null,
    sourceRef: r.sourceRef ?? null,
    dateIn: r.dateIn ?? null,
  }));

  // 0366 — the one surviving book-in path, and it is a DOOR: the RPC mints an
  // identity per row, refuses a bulk sofa, stamps ownership and leaves the
  // lineage behind. The register itself no longer accepts a raw insert.
  let created = 0;
  for (let i = 0; i < units.length; i += 500) {
    const { data, error } = await sb.rpc("ops_stock_book_in_units", {
      p_rows: units.slice(i, i + 500),
      p_warehouse_id: whId,
    });
    if (error) throw mapErr(error);
    created += Number(data ?? 0);
  }
  return c.json(
    { created, alreadyIn: alreadyInCount, total: desiredCount },
    201,
  );
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
  // 0153 added 'incoming' (PO opened, not yet at WH) + 'voided' (PO cancelled);
  // 0299 added the R4 quarantine trio.
  status:
    | "incoming"
    | "free"
    | "reserved"
    | "sold"
    | "transferred"
    | "voided"
    | "on_hold"
    | "returned_to_supplier"
    | "written_off";
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
  // 0366 — the authoritative Unit facts. `hold_reason` joins them because the
  // availability arithmetic reads it; `ownership` and `holder_party_id` are
  // Carres-vs-consignment and WHO HAS IT, and `last_verified_at` is the last
  // time a person actually looked at the goods.
  hold_reason: string | null;
  ownership: "carres_owned" | "supplier_consignment";
  holder_party_id: string | null;
  last_verified_at: string | null;
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
    ownership: r.ownership ?? "carres_owned",
    holderPartyId: r.holder_party_id ?? null,
    lastVerifiedAt: r.last_verified_at ?? null,
    // 0366 — DERIVED here by the one arithmetic, and by the same arithmetic
    // the database uses. The browser never recomputes it from `status`.
    availability: unitAvailability({
      status: r.status,
      needsRepair: r.needs_repair,
      holdReason: r.hold_reason,
      // 0371 — condition is part of the arithmetic: a damaged unit released
      // back to `free` is controlled, not sellable.
      condition: r.condition,
    }),
    lifecycleOutcome: unitLifecycleOutcome(r.status),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** This month in Asia/Kuala_Lumpur — the only calendar the warehouse lives in. */
function thisMonthMyt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
}

/** Today in the same calendar. K5 dates everything from here. */
function todayMyt(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
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
  // 0366 — P0001 is how EVERY governed door on this router says no: the unit is
  // not free, it is not in repair, a bulk record cannot carry one customer's
  // promise, that Site does not exist, a total is derived and never written.
  // Those are the caller's mistakes, not the system breaking, and returning 500
  // for them sends an operator hunting for an outage that is not there while
  // burying the real 500s in the noise (the same finding `mapPgError` records
  // for P0002). The sentence the database wrote is already the right sentence,
  // so it is passed through unchanged.
  if (error.code === "P0001") return new HTTPException(422, { message: error.message ?? "rule violation" });
  // A missing row is a 404, for the same reason.
  if (error.code === "P0002" || error.code === "42P01") {
    return new HTTPException(404, { message: error.message ?? "not found" });
  }
  return new HTTPException(500, { message: error.message ?? "ops_stock RPC failed" });
}

export default opsStockRouter;
