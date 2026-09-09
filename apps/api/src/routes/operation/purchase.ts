import { Hono } from "hono";
import {
  buildPurchaseTodayReport,
  buildPurchaseChaseReceive,
  myHolidaySet,
  nextPoDayMYT,
  productionWorkingDaysFor,
  purchaseTodayResponseSchema,
  transitDaysFor,
  PURCHASING_CATEGORIES,
  workWeekOffDaysFor,
  type DemandLine,
  type ProductCategory,
  type PurchaseChase,
  type PurchaseLinkedOrder,
  type PurchasePoInput,
  type PurchaseReceive,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import {
  loadPurchasingNumbers,
  loadPurchasingSettings,
} from "../../lib/purchasing-settings";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase — the Procurement cockpit read model.
 *
 *   GET /today — assemble live demand + supply, run the pure net-requirements
 *                MRP engine (packages/shared/src/net-requirements.ts), and
 *                return the data the Purchase page's "① Place orders" section
 *                needs (delivery bundles to raise + a per-supplier buy list).
 *
 * READ-ONLY reporting. userClient / RLS is the security boundary (never
 * service_role); no order-write path, RLS policy, or migration is touched.
 * operation + principal only (mirrors requireOperation, which admits both).
 *
 * Mount via `api.route("/operation/purchase", purchaseRouter)` in
 * apps/api/src/index.ts.
 */
const purchaseRouter = new Hono<AppEnv>();

// P1 (0303) — every number this route used to hard-code is a SETTING now:
// production working days per supplier × category, the supplier work week,
// the order-by buffer and the PO days all come from `purchasing_settings`
// (Purchasing → Settings, manager-only). The constants that used to sit here
// are DELETED rather than kept as a fallback — a fallback is how a setting
// silently stops mattering, and this file is where the sofa's third
// contradictory number (10) lived.
const PROCURABLE: ReadonlyArray<ProductCategory> = [...PURCHASING_CATEGORIES];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ②③ read model — load every OPEN purchase order (+ its lines) and shape it into
 * the Chase / Receive lists via the pure `buildPurchaseChaseReceive`.
 *
 * Bounded read: filtered to `status='open'` (a small live slice, well under the
 * PostgREST row cap). Linked customer names come from a single batched `orders`
 * lookup over the distinct source SOs (`po.so` + `po.so_refs[]`). userClient /
 * RLS only — read-only, no write path.
 */
async function loadChaseReceive(
  sb: ReturnType<typeof userClient>,
): Promise<
  | { ok: true; chase: PurchaseChase[]; receive: PurchaseReceive[] }
  | { ok: false; err: { code?: string; message?: string; details?: string } }
> {
  const { data: poRows, error: poErr } = await sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, sup_status, status, expected_ready_date, eta_date, so, so_refs, purchase_order_lines(sku, qty, received_qty)",
    )
    .eq("status", "open");
  if (poErr) return { ok: false, err: poErr };
  const pos = poRows ?? [];

  // Distinct source SOs across every open PO (po.so + po.so_refs[]).
  const distinctSos = new Set<number>();
  for (const p of pos) {
    const so = (p as Record<string, unknown>).so as number | null;
    if (typeof so === "number") distinctSos.add(so);
    for (const ref of (((p as Record<string, unknown>).so_refs as number[] | null) ?? [])) {
      if (typeof ref === "number") distinctSos.add(ref);
    }
  }

  // Batched customer/deadline lookup by SO (any order — incl. autocount).
  const orderBySo = new Map<
    number,
    { customerName: string | null; deliveryDate: string | null }
  >();
  if (distinctSos.size > 0) {
    const { data: orderRows, error: orderErr } = await sb
      .from("orders")
      .select("so, customer_name, delivery_date")
      .in("so", [...distinctSos]);
    if (orderErr) return { ok: false, err: orderErr };
    for (const r of orderRows ?? []) {
      const so = Number((r as Record<string, unknown>).so);
      orderBySo.set(so, {
        customerName: ((r as Record<string, unknown>).customer_name as string | null) ?? null,
        deliveryDate: ((r as Record<string, unknown>).delivery_date as string | null) ?? null,
      });
    }
  }

  const inputs: PurchasePoInput[] = pos.map((p) => {
    const row = p as Record<string, unknown>;
    const so = row.so as number | null;
    const soRefs = (row.so_refs as number[] | null) ?? [];
    const sos: number[] = [];
    if (typeof so === "number") sos.push(so);
    for (const ref of soRefs) if (typeof ref === "number" && !sos.includes(ref)) sos.push(ref);

    const linkedOrders: PurchaseLinkedOrder[] = sos.map((n) => {
      const o = orderBySo.get(n);
      return {
        so: n,
        customerName: o?.customerName ?? null,
        deliveryDate: o?.deliveryDate ?? null,
      };
    });

    const lineRows = (row.purchase_order_lines as
      | Array<{ sku: string; qty: number | string; received_qty: number | string }>
      | null) ?? [];

    return {
      poId: row.id as string,
      supplierId: row.supplier_id as string,
      supStatus: row.sup_status as string,
      status: row.status as string,
      expectedReadyDate: (row.expected_ready_date as string | null) ?? null,
      etaDate: (row.eta_date as string | null) ?? null,
      lines: lineRows.map((l) => ({
        sku: l.sku,
        qty: Number(l.qty ?? 0),
        receivedQty: Number(l.received_qty ?? 0),
      })),
      linkedOrders,
    };
  });

  const { chase, receive } = buildPurchaseChaseReceive(inputs, {
    today: todayIso(),
    holidays: myHolidaySet(),
    // Jess 2026-07-23 · Carres suppliers work Mon–Fri (Ohana confirmed; the
    // rest match). Saturday counted as a working day used to inflate `daysLate`
    // on chase rows over long weekends. Passing offDays = [Sun, Sat] fixes it
    // without touching the shared engine default (which the sofa/bedframe
    // 6-day-week tests still assume).
    offDays: [0, 6],
  });
  return { ok: true, chase, receive };
}

purchaseRouter.get("/today", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // ── 0a. The numbers. Loaded FIRST and never defaulted: a plan built on
  // invented production times is a plan that looks exactly like a real one.
  let settings;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    return c.json(
      {
        error: "settings_unavailable",
        code: "settings_unavailable",
        message: (e as Error).message,
      },
      500,
    );
  }

  // ── 0. ②③ Chase / Receive — over the OPEN POs, independent of ① demand. ────
  const cr = await loadChaseReceive(sb);
  if (!cr.ok) {
    const m = mapPgError(cr.err);
    return c.json(m.body, m.status);
  }
  const chaseReceive = { chase: cr.chase, receive: cr.receive };

  // ── 1. Candidate orders: live (place / proceed_order), any source. ────────
  // Jess 2026-07-23 · Reversed the earlier AutoCount exclusion (portal-native
  // only). AutoCount-imported orders that are still `place` / `proceed_order`
  // are LIVE work that must feed procurement — they carry real delivery dates
  // + real customer commitments, and Jess is importing this-week / next-week
  // orders from AutoCount as her main flow. `.in("status", …)` already drops
  // anything past its lifecycle (delivered / cancelled), so no `source_system`
  // gate is needed to protect against archive noise.
  const { data: orderRows, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, source_ref, status, source_system, delivery_date, delivery_date_tbd, placed_at, created_at",
    )
    .in("status", ["place", "proceed_order"]);
  if (orderErr) {
    const m = mapPgError(orderErr);
    return c.json(m.body, m.status);
  }
  const orders = orderRows ?? [];
  const orderIds = orders.map((o) => o.id as string);
  const orderById = new Map(orders.map((o) => [o.id as string, o]));
  const soByOrderId = new Map<string, number>(
    orders.map((o) => [o.id as string, Number(o.so)]),
  );
  // Customer name per order — carried to the card's primary label (display only).
  const customerNameByOrderId: Record<string, string | null> = {};
  for (const o of orders) {
    customerNameByOrderId[o.id as string] =
      ((o.customer_name as string | null) ?? null) || null;
  }
  // Customer-facing REF per order — LEAD token of `orders.source_ref[]` (e.g.
  // "CR-2025-0812"). Suppliers key off this ref, not the SO number. Native
  // (POS) orders with no imported ref carry null; UI falls back to SO-N there.
  const refByOrderId: Record<string, string | null> = {};
  for (const o of orders) {
    const arr = (o as { source_ref?: unknown }).source_ref;
    const lead = Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string"
      ? (arr[0] as string)
      : null;
    refByOrderId[o.id as string] = lead;
  }

  // No live orders → nothing to buy. Short-circuit (skip the supply reads).
  if (orderIds.length === 0) {
    const empty = buildPurchaseTodayReport(
      [],
      {},
      {
        today: todayIso(),
        holidays: myHolidaySet(),
        reviewDaysBySupplier: {},
      },
      {},
      {},
      {},
      chaseReceive,
    );
    return c.json(purchaseTodayResponseSchema.parse(empty));
  }

  // ── 2. Demand lines: join to catalog for category + supplier. ─────────────
  // !inner drops custom/OTHERS lines whose sku isn't a catalog SKU (not
  // procurable). Category is filtered in JS (bounded by native-order lines).
  // NOTE: there is NO foreign key order_lines.sku → product_skus.sku (sku is
  // plain text), so a PostgREST embed `order_lines(...product_skus(...))` 500s in
  // prod ("Could not find a relationship"). Fetch lines, then resolve the catalog
  // facts by sku in a second query (product_skus→product_models IS a real FK, so
  // THAT embed is valid).
  const { data: lineRows, error: lineErr } = await sb
    .from("order_lines")
    .select("id, order_id, sku, qty, excluded_from_plan, exclude_from_plan_until")
    .in("order_id", orderIds);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const lines = lineRows ?? [];
  const lineSkus = [...new Set(lines.map((l) => l.sku as string))];

  const catBySku = new Map<
    string,
    {
      supplierId: string | null;
      cost: number | null;
      category: ProductCategory | undefined;
      modelName: string | null;
    }
  >();
  if (lineSkus.length > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, supplier_id, cost, product_models!inner(category, name)")
      .in("sku", lineSkus);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    for (const s of skuRows ?? []) {
      const pm = (s as Record<string, unknown>).product_models as
        | { category?: string | null; name?: string | null }
        | null
        | undefined;
      catBySku.set(s.sku as string, {
        supplierId: (s.supplier_id as string | null) ?? null,
        cost: s.cost != null ? Number(s.cost) : null,
        category: (pm?.category as ProductCategory | undefined) ?? undefined,
        modelName: (pm?.name as string | null) ?? null,
      });
    }
  }

  // Per-SKU system cost (product_skus.cost) — DISPLAY-only, advisory. Never
  // reaches an order_line / PO / pricing path; the card just shows Σ(cost×toOrder).
  const costBySku: Record<string, number | null> = {};
  // Per-SKU model name (product_models.name) — the human label on each place line.
  const modelNameBySku: Record<string, string | null> = {};

  const demand: DemandLine[] = [];
  // Supplier × category pairs that have real demand and NO production time.
  // They are named on screen instead of being planned on a guessed number —
  // there is no per-category default to fall back on, by design (P1).
  const unratedKeys = new Set<string>();
  for (const l of lines) {
    const cat = catBySku.get(l.sku as string);
    const category = cat?.category;
    const supplierId = cat?.supplierId ?? null;
    // Only the 3 procurable categories; a line with no supplier can't be bought.
    if (!category || !PROCURABLE.includes(category) || !supplierId) continue;

    // Purchase §6 exclusion filter. Two independent gates:
    //   · excluded_from_plan = true         → operator Skip'd (permanent)
    //   · exclude_from_plan_until > now()  → operator pushed to next cycle
    // Either flag = drop this line from the demand feed to the engine. When
    // the temp exclusion expires it flows back in on the next /today call.
    if ((l as { excluded_from_plan?: boolean }).excluded_from_plan === true) continue;
    const excludeUntil = (l as { exclude_from_plan_until?: string | null }).exclude_from_plan_until;
    if (excludeUntil && new Date(excludeUntil) > new Date()) continue;

    costBySku[l.sku as string] = cat?.cost ?? null;
    modelNameBySku[l.sku as string] = cat?.modelName ?? null;

    const order = orderById.get(l.order_id as string);
    if (!order) continue;

    const tbd = Boolean(order.delivery_date_tbd);
    const deadline = tbd ? null : ((order.delivery_date as string | null) ?? null);
    const placedAt = ((order.placed_at as string | null) ??
      (order.created_at as string | null) ??
      todayIso()) as string;

    // NO SILENT DEFAULT. A pair nobody has set a number for is held out of
    // the plan and reported by name — an order-by date computed from a
    // guessed production time looks exactly like one the factory agreed to.
    const leadDays = productionWorkingDaysFor(settings, supplierId, category);
    if (leadDays == null) {
      unratedKeys.add(`${supplierId}::${category}`);
      continue;
    }

    demand.push({
      lineId: l.id as string,
      orderId: l.order_id as string,
      sku: l.sku as string,
      category,
      supplierId,
      qty: Number(l.qty ?? 0),
      deadline: deadline ? deadline.slice(0, 10) : null,
      leadDays,
      offDays: workWeekOffDaysFor(settings, supplierId),
      /* The lorry leg — the same governed number `expectedArrivalOf` adds
         forward when a PO is born (Law D). */
      transitDays: transitDaysFor(settings, supplierId),
      placedAt: placedAt.slice(0, 10),
      committed: order.status === "proceed_order",
    });
  }

  const demandSkus = [...new Set(demand.map((d) => d.sku))];

  // ── 3. Supply: open POs + free stock, restricted to the demand SKUs. ──────
  // Restricting to demand SKUs keeps both reads well under the PostgREST row
  // cap (bounded by the live-order SKU set, not the whole PO / stock tables).
  const openPoBySku: Record<string, number> = {};
  const freeStockBySku: Record<string, number> = {};

  if (demandSkus.length > 0) {
    // openPoBySku = Σ(qty − received_qty) on OPEN POs (POStatus 'received' =
    // fully received, 'cancelled' excluded; only 'open' remains).
    const { data: poLines, error: poErr } = await sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
      .in("sku", demandSkus)
      .eq("purchase_orders.status", "open");
    if (poErr) {
      const m = mapPgError(poErr);
      return c.json(m.body, m.status);
    }
    for (const r of poLines ?? []) {
      const remaining = Number(r.qty ?? 0) - Number(r.received_qty ?? 0);
      if (remaining <= 0) continue;
      const sku = r.sku as string;
      openPoBySku[sku] = (openPoBySku[sku] ?? 0) + remaining;
    }

    // freeStockBySku = Σ(qty − reserved) at the Klg warehouse only.
    // Resolve the Klg warehouse by name (no `code` column exists). If exactly
    // one matches we scope to it; otherwise we sum ALL warehouses + flag it.
    // TODO: freeStock is ADVISORY here — the engine leaves consumeFreeStock OFF
    // by default (make-to-order never auto-eats labelled stock without a WMS).
    let klgWarehouseId: string | null = null;
    const { data: whRows, error: whErr } = await sb
      .from("warehouses")
      .select("id, name")
      .or("name.ilike.%klang%,name.ilike.%klg%");
    if (whErr) {
      const m = mapPgError(whErr);
      return c.json(m.body, m.status);
    }
    // TODO(klg-resolution): 0 or >1 name matches → sum ALL warehouses' free
    // stock as the safest default (never under-report advisory stock). Tighten
    // once warehouses carry a stable code / the Klg row is unambiguous.
    if ((whRows ?? []).length === 1) klgWarehouseId = whRows![0].id as string;

    let stockQ = sb
      // 0368 — `sellable` (available + bulk_on_hand): this decides what to BUY,
      // not what a Sales Order can bind. Never qty − reserved.
      .from("stock_sku_availability")
      .select("sku, sellable, warehouse_id")
      .in("sku", demandSkus);
    if (klgWarehouseId) stockQ = stockQ.eq("warehouse_id", klgWarehouseId);
    const { data: stockRows, error: stockErr } = await stockQ;
    if (stockErr) {
      const m = mapPgError(stockErr);
      return c.json(m.body, m.status);
    }
    for (const r of stockRows ?? []) {
      const free = Number((r as { sellable?: number }).sellable ?? 0);
      if (free <= 0) continue;
      const sku = r.sku as string;
      freeStockBySku[sku] = (freeStockBySku[sku] ?? 0) + free;
    }
  }

  // Every supplier is reviewed on the configured PO days (Purchasing →
  // Settings). Per-supplier cadences are not a thing Jess asked for; when
  // they are, this is the one line that changes.
  const reviewDaysBySupplier: Record<string, readonly number[]> = {};
  for (const supplierId of new Set(demand.map((d) => d.supplierId))) {
    reviewDaysBySupplier[supplierId] = settings.poDays;
  }

  // ── 4. Run the engine + shape the response. ───────────────────────────────
  const report = buildPurchaseTodayReport(
    demand,
    { openPoBySku, freeStockBySku },
    {
      today: todayIso(),
      holidays: myHolidaySet(),
      // options.offDays = the CARRES / delivery-side week (Mon–Fri, 5-day). It
      // drives the arrival buffer + the urgency buckets (we can't SEND a PO on a
      // Carres off-day). The per-line make+deliver LEAD instead uses each
      // line's own supplier week (DemandLine.offDays, now the per-supplier
      // setting) — so Ohana's Saturday counts toward its lead while Nice
      // Future's does not. NOT a §2 setting: this is Carres's own week, and
      // §2 lists only the SUPPLIER work week.
      offDays: [0, 6],
      // Stock must land this many working days before the deadline, to leave
      // time to arrange the delivery — the order-by buffer, from Settings.
      arrivalBufferDays: settings.orderByBufferDays,
      // consumeFreeStock stays OFF (default) — free stock is advisory only.
      reviewDaysBySupplier,
    },
    soByOrderId,
    customerNameByOrderId,
    costBySku,
    chaseReceive,
    modelNameBySku,
    refByOrderId,
  );

  // Purchase §6 · supplier-level Snooze filter. If purchase_snoozes has an
  // unexpired row for a supplier, drop its placeGroups from the response
  // (the supplier is "muted" until snooze_until). Chase/Receive unaffected —
  // snooze only defers NEW PO planning, not in-flight PO follow-up.
  const { data: snoozeRows } = await sb
    .from("purchase_snoozes")
    .select("supplier_id, snooze_until");
  const nowMs = Date.now();
  const snoozedSupplierIds = new Set(
    (snoozeRows ?? [])
      .filter((r) => {
        const su = (r as { snooze_until?: string }).snooze_until;
        return su && new Date(su).getTime() > nowMs;
      })
      .map((r) => (r as { supplier_id: string }).supplier_id),
  );
  if (snoozedSupplierIds.size > 0) {
    report.placeGroups = report.placeGroups.filter(
      (g) => !snoozedSupplierIds.has(g.supplierId),
    );
    // Recount the summary to reflect the filtered groups (a snoozed supplier
    // stops contributing to the "N to place today" tab counts).
    report.summary.toPlaceBundles = report.placeGroups.reduce(
      (s, g) => s + g.orderCount,
      0,
    );
    report.summary.toOrderUnits = report.placeGroups.reduce(
      (s, g) => s + g.totalUnits,
      0,
    );
  }

  // P1 — the pairs nobody has set a number for. Named, never guessed.
  const supplierNameById = new Map(settings.suppliers.map((s) => [s.id, s.name]));
  const unrated = [...unratedKeys].map((k) => {
    const [supplierId, category] = k.split("::");
    return {
      supplierId,
      supplierName: supplierNameById.get(supplierId) ?? null,
      category,
    };
  });

  return c.json(purchaseTodayResponseSchema.parse({ ...report, unrated }));
});

// Purchase §6 · POST /line/skip · body: { lineIds: string[] }
// Permanently drop these order_lines from the purchase plan. Operator gesture:
// "customer no longer wants this / cancelled / mis-ordered". Idempotent —
// re-skipping stays skipped. RLS via userClient (operation+principal only).
purchaseRouter.post("/line/skip", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  let body: { lineIds?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const lineIds = Array.isArray(body.lineIds)
    ? (body.lineIds.filter((x) => typeof x === "string") as string[])
    : [];
  if (lineIds.length === 0) {
    return c.json({ error: "lineIds_required" }, 400);
  }
  const { error } = await sb
    .from("order_lines")
    .update({ excluded_from_plan: true })
    .in("id", lineIds);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, skipped: lineIds.length });
});

// Purchase §6 · POST /line/push-next · body: { lineIds: string[], until?: iso }
// Temp-skip these order_lines from the purchase plan until `until` (defaults
// to the next Mon/Wed/Fri PO day in MYT — matching the operator's mental
// model "revisit next cycle"). Idempotent — re-pushing extends the horizon.
purchaseRouter.post("/line/push-next", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  let body: { lineIds?: unknown; until?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const lineIds = Array.isArray(body.lineIds)
    ? (body.lineIds.filter((x) => typeof x === "string") as string[])
    : [];
  if (lineIds.length === 0) {
    return c.json({ error: "lineIds_required" }, 400);
  }
  const untilRaw = typeof body.until === "string" ? body.until : null;
  // Default = next PO day MYT (Mon/Wed/Fri) at 00:00 MYT (16:00 UTC previous
  // day). nextPoDayMYT returns YYYY-MM-DD; we convert to a UTC instant that
  // represents "start of that MYT date".
  let untilIso: string;
  if (untilRaw) {
    untilIso = untilRaw;
  } else {
    let poDays: number[];
    try {
      poDays = (await loadPurchasingNumbers(sb)).poDays;
    } catch (e) {
      return c.json(
        {
          error: "settings_unavailable",
          code: "settings_unavailable",
          message: (e as Error).message,
        },
        500,
      );
    }
    const dateOnly = nextPoDayMYT(new Date(), poDays);
    if (!dateOnly) {
      return c.json({ error: "no_po_day_configured", code: "invalid_param" }, 422);
    }
    untilIso = `${dateOnly}T00:00:00+08:00`;
  }
  const { error } = await sb
    .from("order_lines")
    .update({ exclude_from_plan_until: untilIso })
    .in("id", lineIds);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, pushed: lineIds.length, until: untilIso });
});

// Purchase §6 · POST /snooze · body: { supplierId: string, until: iso, reason?: string }
// Defer the whole supplier's PO planning until `until`. Upserts on
// supplier_id (one active snooze per supplier). Passing until in the past
// deletes the snooze (immediate wake). Chase/Receive unaffected — snooze
// only defers NEW PO planning, not in-flight PO follow-up.
purchaseRouter.post("/snooze", requireOperation, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  let body: { supplierId?: unknown; until?: unknown; reason?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const supplierId = typeof body.supplierId === "string" ? body.supplierId : "";
  const until = typeof body.until === "string" ? body.until : "";
  const reason = typeof body.reason === "string" ? body.reason : null;
  if (!supplierId || !until) {
    return c.json({ error: "supplierId_and_until_required" }, 400);
  }
  const untilMs = new Date(until).getTime();
  if (Number.isNaN(untilMs)) {
    return c.json({ error: "until_must_be_iso" }, 400);
  }
  // Past = wake immediately (delete the row instead of upsert).
  if (untilMs <= Date.now()) {
    const { error } = await sb
      .from("purchase_snoozes")
      .delete()
      .eq("supplier_id", supplierId);
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ ok: true, action: "cleared", supplierId });
  }
  const { error } = await sb
    .from("purchase_snoozes")
    .upsert(
      { supplier_id: supplierId, snooze_until: until, reason },
      { onConflict: "supplier_id" },
    );
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, action: "snoozed", supplierId, until });
});

export default purchaseRouter;
