import { Hono, type Context } from "hono";
import {
  assignPickupPartnerInput,
  cancelPoInput,
  chasePoEventInput,
  createPoInput,
  createPosBatchInput,
  listPurchaseOrdersQuery,
  normalizeSkuKey,
  reassignPoWarehouseInput,
  receivePoWithDoInput,
  recordBalanceDateInput,
  recordTomorrowDeliveryInput,
  type AwaitingStockShortageResponse,
} from "@carres/shared";
import { resolveCurrentPoDuty } from "./po-duty";
// renderPoPdf moved to apps/web/src/lib/pdf/render.ts (Workers WASM ban).
import type { PoTemplateData } from "../../lib/pdf/types";
import { requireOperation } from "../../lib/auth-guards";
import { hasDuty } from "../../lib/duties";
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

/** PO duty gate (0236, Jess 2026-07-18): while a duty holder exists for the
 *  current MYT month, only that holder + management may CREATE POs (web hides
 *  the button; this is the API layer of the same rule — two layers, one
 *  rule). Dormant DB / empty pool → no gate (a missing feature must never
 *  block procurement). Read-only PO routes are untouched. */
async function poDutyGate(c: Context<AppEnv>): Promise<Response | null> {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // Cheapest question first. HR-P2 (0260) turned the management bypass into a
  // duty read (a DB round-trip), so asking it up front would bill EVERY PO
  // create for a permission we usually don't need: when the duty layer is
  // dormant, or the caller IS this month's holder, management status is
  // irrelevant to the outcome. Resolve the holder first and only ask about
  // `ops_manager` in the one case where it can change the answer.
  const duty = await resolveCurrentPoDuty(sb);
  if (!duty || duty.user_id === auth.id) return null;

  // Someone ELSE holds this month — management may still override.
  if (await hasDuty(c, "ops_manager")) return null;
  const holder = await sb
    .from("app_users")
    .select("name, email")
    .eq("id", duty.user_id)
    .maybeSingle();
  const label =
    (holder.data?.name as string | null) ??
    (holder.data?.email as string | null) ??
    "the duty holder";
  return c.json(
    {
      error: "forbidden",
      code: "po_duty",
      message: `PO duty: this month is ${label}'s — only the duty holder and management can raise POs.`,
    },
    403,
  );
}

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
      // R1 (0284): damaged_qty + wrong_item_qty ride the list so the Receiving
      // queue can show a progress state — In transit / Partially received /
      // Fully received / Receiving issue — without opening a single PO.
      // The line UUID is the lookup key `operation_receive_po_with_do` needs
      // (0076) — without it the Receiving station could not submit a receive
      // at all. Every other PO-line select already carries it.
      // P3 (0306): `short_since` is the balance call's Due anchor — the day the
      // line last took a short delivery, stamped by a trigger so every door
      // that writes `received_qty` stamps it.
      "id, supplier_id, warehouse_id, status, sup_status, so, so_refs, eta_date, placed_at, purchase_order_lines(id, sku, qty, received_qty, damaged_qty, wrong_item_qty, short_since, attrs)",
    );

  if (status !== "all") q = q.eq("status", status);
  if (supplierId) q = q.eq("supplier_id", supplierId);

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const pos = data ?? [];

  // ── P3 · what the supplier last told us, and what it was ABOUT ────────────
  //
  // Both calls close on an answer that still describes the CURRENT facts (S4's
  // rule, the one C8 made load-bearing): the tomorrow call closes only while
  // the answer names the PO's current expected arrival, and the balance call
  // only while it names the line's current received quantity. So the list
  // carries the LATEST promise's `about_*` and the engine compares.
  //
  // A second read rather than an embed: `po_supplier_promises` has no FK
  // PostgREST can traverse to give "the latest one" — an embed would return
  // every promise ever made and the client would sort them. Bounded by the same
  // 200-PO page above.
  const poIds = pos.map((p) => (p as Record<string, unknown>).id as string);
  const tomorrowAboutByPo = new Map<string, string | null>();
  const balanceAboutByLine = new Map<string, number | null>();
  // Register (Jess, 2026-08-02) — `(revised)`: the arriving date has been
  // answered about MORE THAN ONE expected arrival, so what the listing shows
  // is not the first date the supplier named. Read from the promise ledger
  // (0306) — the only arrival history that exists; the Phase-4 write door
  // appends to the same ledger, so this flag starts working the day it ships.
  const arrivalDatesByPo = new Map<string, Set<string>>();
  if (poIds.length > 0) {
    const { data: promiseRows, error: promiseErr } = await sb
      .from("po_supplier_promises")
      .select("po_id, po_line_id, kind, about_date, about_qty, recorded_at")
      .in("po_id", poIds)
      .order("recorded_at", { ascending: false });
    if (promiseErr) {
      const m = mapPgError(promiseErr);
      return c.json(m.body, m.status);
    }
    // Newest first, so the FIRST row seen for a key is the current answer.
    for (const r of promiseRows ?? []) {
      const row = r as Record<string, unknown>;
      if (row.kind === "tomorrow_delivery") {
        const key = row.po_id as string;
        if (!tomorrowAboutByPo.has(key)) {
          tomorrowAboutByPo.set(key, (row.about_date as string | null) ?? null);
        }
        if (row.about_date != null) {
          const set = arrivalDatesByPo.get(key) ?? new Set<string>();
          set.add(row.about_date as string);
          arrivalDatesByPo.set(key, set);
        }
      } else if (row.kind === "balance_delivery" && row.po_line_id) {
        const key = row.po_line_id as string;
        if (!balanceAboutByLine.has(key)) {
          balanceAboutByLine.set(
            key,
            row.about_qty == null ? null : Number(row.about_qty),
          );
        }
      }
    }
  }

  // ── The customer's date — the earliest promised delivery across every SO
  // this PO covers. The Register's second column (Jess, 2026-08-02): the PO
  // exists to make a customer date, so the listing shows it beside the day
  // the PO was issued. One bounded IN() read over the page's SOs.
  const soSet = new Set<number>();
  for (const p of pos) {
    const row = p as Record<string, unknown>;
    if (row.so != null) soSet.add(Number(row.so));
    for (const r of (row.so_refs as number[] | null) ?? []) soSet.add(Number(r));
  }
  const deliveryBySo = new Map<number, string | null>();
  // Register (Jess, 2026-08-02) — the customer's NAME rides along so the
  // listing's search answers "which PO carries Ah Hock's goods" without a
  // second read. Same bounded IN() as the date.
  const customerBySo = new Map<number, string | null>();
  if (soSet.size > 0) {
    const { data: orderRows, error: orderErr } = await sb
      .from("orders")
      .select("so, delivery_date, customer_name")
      .in("so", [...soSet]);
    if (orderErr) {
      const m = mapPgError(orderErr);
      return c.json(m.body, m.status);
    }
    for (const r of orderRows ?? []) {
      const row = r as Record<string, unknown>;
      deliveryBySo.set(Number(row.so), (row.delivery_date as string | null) ?? null);
      customerBySo.set(Number(row.so), (row.customer_name as string | null) ?? null);
    }
  }
  const customerDeliveryOf = (row: Record<string, unknown>): string | null => {
    const sos: number[] = [];
    if (row.so != null) sos.push(Number(row.so));
    for (const r of (row.so_refs as number[] | null) ?? []) sos.push(Number(r));
    const dates = sos
      .map((n) => deliveryBySo.get(n) ?? null)
      .filter((d): d is string => d != null)
      .sort();
    return dates[0] ?? null;
  };
  const ordersOf = (row: Record<string, unknown>) => {
    const sos: number[] = [];
    if (row.so != null) sos.push(Number(row.so));
    for (const r of (row.so_refs as number[] | null) ?? []) sos.push(Number(r));
    return sos
      .filter((n) => deliveryBySo.has(n) || customerBySo.has(n))
      .map((n) => ({
        so: n,
        customer_name: customerBySo.get(n) ?? "",
        delivery_date: deliveryBySo.get(n) ?? null,
      }));
  };

  // ── The Items column's words (Jess, 2026-08-02): the listing speaks MODEL,
  // never the raw SKU code. The browser used to translate via its POS catalog
  // and printed the code whenever the catalog missed — so the name is resolved
  // HERE, where every SKU can be looked up, and rides the wire per line.
  // `purchase_order_lines.sku` has no FK PostgREST can traverse (schema note
  // at /:id/print-data), so one bounded IN() over the page's distinct SKUs.
  const skuSet = new Set<string>();
  for (const p of pos) {
    const row = p as Record<string, unknown>;
    const lines = (row.purchase_order_lines as Array<Record<string, unknown>> | null) ?? [];
    for (const l of lines) skuSet.add(l.sku as string);
  }
  const modelBySku = new Map<string, { model_name: string | null; size: string | null }>();
  if (skuSet.size > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, variant, product_models(name)")
      .in("sku", [...skuSet]);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    for (const r of skuRows ?? []) {
      const row = r as Record<string, unknown>;
      const model = row.product_models as { name?: string | null } | null;
      modelBySku.set(row.sku as string, {
        model_name: model?.name ?? null,
        size: (row.variant as string | null) ?? null,
      });
    }
  }

  const withAnswers = pos.map((p) => {
    const row = p as Record<string, unknown>;
    const lines = (row.purchase_order_lines as Array<Record<string, unknown>> | null) ?? [];
    return {
      ...row,
      tomorrow_answer_about_date: tomorrowAboutByPo.get(row.id as string) ?? null,
      customer_delivery: customerDeliveryOf(row),
      orders: ordersOf(row),
      eta_revised: (arrivalDatesByPo.get(row.id as string)?.size ?? 0) > 1,
      purchase_order_lines: lines.map((l) => ({
        ...l,
        balance_answer_about_qty: balanceAboutByLine.get(l.id as string) ?? null,
        model_name: modelBySku.get(l.sku as string)?.model_name ?? null,
        size: modelBySku.get(l.sku as string)?.size ?? null,
      })),
    };
  });

  return c.json({ pos: withAnswers });
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
//    operation_stage='in_production' AND po_id IS NULL. After
//    confirm_proceed_request_v3 (migration 0034) every order is split into
//    per-(supplier, category) threads; a thread with po_id NULL is the exact
//    "not yet covered by a PO" target. This filter is correct by construction
//    (no so/so_refs string matching against open POs), and the v3-S4 batch
//    RPC closes the race window with SELECT ... FOR UPDATE on the same rows.
//
// 2. LEGACY FALLBACK (v3-S2.1 so/so_refs filter): orders in
//    operation_stage='in_production' that have NO row in
//    order_supplier_threads — i.e. legacy/unsplit data, or orders where
//    confirm_proceed_request_v3 has not yet been called. For these we apply
//    the v3-S2.1 v2-style filter: drop orders whose `so` matches an OPEN PO's
//    `so` or appears in `so_refs`. status='open' is the discriminator;
//    received/cancelled POs leave the order in play.
//
// The two order_id sets are union-ed (Set dedupes natively) before the
// order_lines fetch, so a row that surfaces in both paths contributes its
// `qty` to `need` exactly once. order_lines + stock_balances aggregation is
// unchanged from C5.3.
//
// Tables touched (one round-trip each, all in parallel):
//   - order_supplier_threads (no filter — TS narrows by stage + po_id)
//   - orders (.eq("operation_stage", "in_production"))
//   - purchase_orders (.eq("status", "open") for the legacy coverage filter)
//   - order_lines (.in("order_id", [...]) on the union set)
//   - stock_balances (no filter — sum across all warehouses per Q2=A)
//
// RLS: the inline role guard above plus the user JWT covers this; no policy
// changes needed.
//
// Optional `?dls=1003,1002` query — when present, scopes the shortage feed to
// the orders matching those so numbers (used by CrossOrderBundleSheet so the
// modal pre-fills lines for the user's exact selection, not the global pool).
// Comma-separated positive integers. The orders fetch becomes so-scoped and
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
  // so/so_refs filter). All independent; Promise.all is the same pattern as
  // the order_lines + stock_balances pair below. When dlsFilter is set, the
  // orders fetch narrows to those dls — `legacyOrderIds` then auto-scopes
  // through `ordersRes.data`, and `primaryOrderIds` (from threads, which
  // don't carry so) is intersected with the same scope below.
  const ordersBuilder = sb
    .from("orders")
    .select("id, so, delivery_date")
    .eq("operation_stage", "in_production");
  const ordersQuery = dlsFilter
    ? ordersBuilder.in("so", dlsFilter)
    : ordersBuilder;
  const [threadsRes, ordersRes, posRes] = await Promise.all([
    sb.from("order_supplier_threads").select("order_id, operation_stage, po_id"),
    ordersQuery,
    sb.from("purchase_orders").select("so, so_refs").eq("status", "open"),
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

  // Primary path: threads where stage='in_production' AND po_id
  // IS NULL. Each such thread maps its order_id into the union — multiple
  // threads on the same order (different supplier/category) collapse to one
  // entry in the Set, but their lines all show up later via order_lines (the
  // SKU split happens in the modal's grouping, not here).
  const primaryOrderIds = new Set<string>();
  // "Has any thread" gate for the legacy fallback — an order with at least
  // one thread row has been split, so it should NOT enter the legacy path
  // even if its orders.operation_stage is still in_production.
  const orderIdsWithAnyThread = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (threadsRes.data ?? []) as any[]) {
    const oid = String(t.order_id);
    orderIdsWithAnyThread.add(oid);
    if (t.operation_stage === "in_production" && t.po_id == null) {
      primaryOrderIds.add(oid);
    }
  }

  // Legacy fallback path: build the so-coverage Set from open POs the same
  // way v3-S2.1 did. A PO covers a so if (po.so = so) OR (so = ANY(po.so_refs)).
  const coveredDls = new Set<number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (posRes.data ?? []) as any[]) {
    if (p.so != null) coveredDls.add(Number(p.so));
    if (Array.isArray(p.so_refs)) {
      for (const ref of p.so_refs) {
        if (ref != null) coveredDls.add(Number(ref));
      }
    }
  }

  // Legacy candidate orders → keep only those that (a) have NO thread row
  // (i.e. unsplit / pre-v3) AND (b) are NOT covered by any open PO. The
  // null-`so` defensive branch from v3-S2.1 is preserved.
  const legacyOrderIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (ordersRes.data ?? []) as any[]) {
    const oid = String(o.id);
    if (orderIdsWithAnyThread.has(oid)) continue; // split — handled by primary
    const so = o.so;
    if (so != null && coveredDls.has(Number(so))) continue; // already covered by an open PO
    legacyOrderIds.add(oid);
  }

  // When dlsFilter is set, threads-side primaryOrderIds may include orders
  // outside the user's selection (threads carry no so). Intersect with the
  // so-scoped orders set so the union honors the bundle scope.
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
  // 2026-05-18 (Loo) — also pull `order_id` so per-(so, sku, attrs)
  // aggregation can attribute each line back to its source SO for the
  // `bySo` breakdown (Phase 3 per-SO PO auto-split).
  const [linesRes, stockRes] = await Promise.all([
    sb.from("order_lines").select("order_id, sku, qty, attrs").in("order_id", orderIds),
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

  // Step 3 — TS aggregation. Two-level keying:
  //   1. (sku, attrs-canonical) — surfaces same-SKU different-variant rows
  //      separately so CreatePOModal can pre-fill the cascade picker per
  //      variant (color / gap / fabric). JSON.stringify with sorted keys
  //      keeps two semantically identical attrs objects on the same bucket
  //      regardless of source key order.
  //   2. (so, sku, attrs-canonical) — Phase 3 (2026-05-18) per-source-SO
  //      breakdown so CreatePOModal can fan out one PO per source SO. Only
  //      emitted to the wire when `?dls=...` is set (the FE auto-split
  //      path); global calls return `bySo: []` to avoid shipping per-SO
  //      context the FE doesn't use.
  //
  // `available` is still per-SKU (stock isn't variant- or SO-tracked) and
  // gets divided across (sku, attrs, so) entries in deterministic
  // (sku → canonAttrs → so) order. First entry absorbs available stock,
  // later entries see whatever's left. Conservative: over-orders if the
  // operator didn't explicitly want it on the same variant/so, but never
  // under-orders. Matches the existing operation_calc_shortages semantics
  // for single-variant orders byte-for-byte; row-level totals remain equal
  // to sum-across-bySo so legacy callers reading aggregate `shortage` see
  // the same numbers.
  type ShortageRow = AwaitingStockShortageResponse["shortage"][number];
  type Attrs = ShortageRow["attrs"];
  type BySoEntry = ShortageRow["bySo"][number];

  const canonAttrs = (a: unknown): string => {
    if (a == null) return "";
    if (typeof a !== "object") return JSON.stringify(a);
    const obj = a as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const ordered: Record<string, unknown> = {};
    for (const k of keys) ordered[k] = obj[k];
    return JSON.stringify(ordered);
  };

  // Build order_id → so map from ordersRes. Only orders in
  // in_production stage are fetched; the union of primary +
  // legacy paths intersects with this set when dlsFilter is on, so every
  // contributing order_id has a row here under the dls-scoped call. Orders
  // missing a so (defensive) drop their per-so attribution but still
  // contribute to row-level totals via the synthetic so=-1 bucket below.
  const orderIdToSo = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (ordersRes.data ?? []) as any[]) {
    if (o.so != null) orderIdToSo.set(String(o.id), Number(o.so));
  }

  // Per-(so, sku, attrs) aggregation. The key shape `${so} ${sku} ${canon}`
  // collides only when so + sku + canonAttrs all match, which is exactly
  // the semantic we want (multiple order_lines from the same order with
  // same variant collapse).
  const needBySoKey = new Map<string, { so: number; sku: string; attrs: Attrs; need: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (linesRes.data ?? []) as any[]) {
    const sku = String(l.sku);
    const attrs = (l.attrs ?? null) as Attrs;
    const orderId = l.order_id != null ? String(l.order_id) : null;
    const soLookup = orderId != null ? orderIdToSo.get(orderId) : undefined;
    // When `so` is unknown (no orders row — happens if primary path
    // admitted an order outside the ordersRes set in a global call), fold
    // into a synthetic so=-1 bucket so row-level totals stay correct. The
    // bySo emission step below filters this bucket out of the wire payload
    // (negative `so` is invalid per the zod schema).
    const so = soLookup ?? -1;
    const key = `${so} ${sku} ${canonAttrs(attrs)}`;
    const cur = needBySoKey.get(key);
    if (cur) cur.need += Number(l.qty);
    else needBySoKey.set(key, { so, sku, attrs, need: Number(l.qty) });
  }

  const availBySku = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (stockRes.data ?? []) as any[]) {
    const sku = String(r.sku);
    const avail = Number(r.qty) - Number(r.reserved);
    availBySku.set(sku, (availBySku.get(sku) ?? 0) + avail);
  }

  // Distribute SKU-level availability across (sku, attrs, so) entries in
  // deterministic (sku → canonAttrs → so) order. Each entry consumes
  // min(remaining_for_sku, entry.need). The walk order is reproducible so
  // tests can snapshot it. Entries are then collapsed back to (sku, attrs)
  // rows for the wire shape; the per-so detail is preserved in `bySo` when
  // `dlsFilter` is set.
  const orderedBySoEntries = [...needBySoKey.values()].sort((a, b) => {
    const cSku = a.sku.localeCompare(b.sku);
    if (cSku !== 0) return cSku;
    const cAttrs = canonAttrs(a.attrs).localeCompare(canonAttrs(b.attrs));
    if (cAttrs !== 0) return cAttrs;
    return a.so - b.so;
  });
  const remainingBySku = new Map(availBySku);
  type PerSoConsumed = {
    so: number;
    sku: string;
    attrs: Attrs;
    need: number;
    available: number;
    shortage: number;
  };
  const consumedList: PerSoConsumed[] = [];
  for (const e of orderedBySoEntries) {
    const remaining = remainingBySku.get(e.sku) ?? 0;
    const consumed = Math.min(remaining, e.need);
    remainingBySku.set(e.sku, remaining - consumed);
    consumedList.push({
      so: e.so,
      sku: e.sku,
      attrs: e.attrs,
      need: e.need,
      available: consumed,
      shortage: e.need - consumed,
    });
  }

  // Collapse per-(so, sku, attrs) entries back to (sku, attrs) rows for the
  // top-level response. Aggregate need/available/shortage = sum across
  // matching so entries. `consumedList` is already sorted by
  // (sku → canonAttrs → so), so first-seen wins for row order and per-row
  // `bySo` is naturally so-ascending within the same (sku, attrs).
  type RowAccumulator = {
    sku: string;
    attrs: Attrs;
    need: number;
    available: number;
    shortage: number;
    bySo: BySoEntry[];
  };
  const rowByKey = new Map<string, RowAccumulator>();
  for (const c of consumedList) {
    const rowKey = `${c.sku} ${canonAttrs(c.attrs)}`;
    let row = rowByKey.get(rowKey);
    if (!row) {
      row = {
        sku: c.sku,
        attrs: c.attrs,
        need: 0,
        available: 0,
        shortage: 0,
        bySo: [],
      };
      rowByKey.set(rowKey, row);
    }
    row.need += c.need;
    row.available += c.available;
    row.shortage += c.shortage;
    // Only emit valid SOs to bySo. The synthetic so=-1 bucket (for lines
    // whose order_id had no matching row in ordersRes) is dropped from the
    // breakdown but its totals still flow into the row sums above. This
    // preserves the invariant `row.totals = sum(bySo) + dropped` only when
    // every line maps to a valid so — which is the case under `?dls=` (the
    // only mode where `bySo` is emitted to the wire).
    if (c.so >= 1) {
      row.bySo.push({
        so: c.so,
        need: c.need,
        available: c.available,
        shortage: c.shortage,
      });
    }
  }

  const shortage: ShortageRow[] = [];
  for (const row of rowByKey.values()) {
    if (row.shortage <= 0) continue;
    shortage.push({
      sku: row.sku,
      attrs: row.attrs,
      need: row.need,
      available: row.available,
      shortage: row.shortage,
      // Per Phase 3 brief: `bySo` is only populated when the request
      // carries `?dls=...`. Global awaiting calls return [] on every row
      // to avoid shipping per-SO context the FE doesn't use.
      bySo: dlsFilter ? row.bySo : [],
    });
  }

  // 2026-05-16 (Loo) — bundle-scope per-order list. Only populated when the
  // caller passed `?dls=...` (CreatePOModal bundle prefill). Global awaiting
  // calls return [] to avoid shipping the entire cohort.
  type OrderRow = AwaitingStockShortageResponse["orders"][number];
  const orders: OrderRow[] = [];
  if (dlsFilter) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const o of (ordersRes.data ?? []) as any[]) {
      if (o.so == null) continue;
      orders.push({
        so: Number(o.so),
        deliveryDate: o.delivery_date ?? null,
      });
    }
    orders.sort((a, b) => a.so - b.so);
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
/**
 * GET /api/operation/pos/:id/units — the per-unit goods ids this PO minted at
 * Issue (0153/0154: one `id-abc123456` unit_code per physical piece, status
 * 'incoming' until the warehouse receives). The PO-PDF-STANDARD's Item ID
 * column is THESE ids, never the SKU — this read is what lets the workspace
 * (and later the printed document) fill that column with real data.
 * Own-warehouse POs only ever mint units; a PO with none returns [].
 */
operationPosRouter.get("/:id/units", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("ops_stock_items")
    .select("unit_code, sku, status")
    .eq("po_no", c.req.param("id"))
    .order("unit_code", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ units: data ?? [] });
});

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
      "id, status, sup_status, so, so_refs, eta_date, placed_at, supplier_id, warehouse_id, suppliers(name, contact), warehouses(name, address)",
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
// indirect (PO.so_refs is an int[] of dealer-facing SO numbers, joined to
// orders.so). The modal needs each SO's `delivery_date` so the operator can
// see customer ETAs alongside the PO-level ETA.
//
// Two PostgREST round-trips: fetch PO (RLS-scoped), then fetch orders by so.
// Cheap (<5 rows typically), only fires when the modal opens.
operationPosRouter.get("/:id/source-orders", requireOperation, async (c) => {
  const poId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: po, error: e1 } = await sb
    .from("purchase_orders")
    .select("so, so_refs")
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
  const poRow = po as { so: number | null; so_refs: number[] | null };
  const dls: number[] = [
    ...((poRow.so_refs ?? []) as number[]),
    ...(poRow.so != null ? [Number(poRow.so)] : []),
  ];
  if (dls.length === 0) return c.json({ orders: [] });

  const { data, error } = await sb
    .from("orders")
    .select("so, delivery_date")
    .in("so", dls)
    .order("so");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const orders = (data ?? []).map((r) => {
    const row = r as { so: unknown; delivery_date: string | null };
    return { so: Number(row.so), deliveryDate: row.delivery_date };
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
  const gated = await poDutyGate(c);
  if (gated) return gated;
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
    // p_so / p_so_refs MUST match the DB function param names (renamed from
    // p_dl / p_dl_refs by migration 0123). The 0123 code sweep's \bdl\b regex
    // missed `p_dl` (no word boundary after `_`), so this call site shipped
    // stale → PostgREST 500 "Could not find the function ... in the schema cache".
    p_so: parsed.data.so ?? null,
    p_so_refs: parsed.data.soRefs ?? null,
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
  const gated = await poDutyGate(c);
  if (gated) return gated;
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
    so_refs: p.soRefs ?? null,
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
      // R1 (0284): what this DO found wrong. Snake-case to match the RPC's
      // `v_line->>'damaged_qty'` read. Omitted keys are 0 inside the RPC, so a
      // clean delivery sends the same payload it always did. NOTE the mixed
      // semantics, which the RPC comments spell out: received_qty is the NEW
      // TOTAL, these two are what THIS delivery found (they accumulate).
      damaged_qty: l.damagedQty ?? 0,
      wrong_item_qty: l.wrongItemQty ?? 0,
      // R2 (0288): the claim's evidence rides with the report, because the RPC
      // mints the claim in the SAME transaction that moves the counters — a
      // guard trigger refuses the counters otherwise. Empty arrays are fine to
      // send: the RPC only demands photos for a line that actually reported a
      // problem.
      damaged_photos: l.damagedPhotos ?? [],
      wrong_item_claim_type: l.wrongItemClaimType ?? null,
      wrong_item_photos: l.wrongItemPhotos ?? [],
    })),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Auto-reserve the received goods to the PO's source order (Jess 2026-06-30).
  // Once a PO is received its units are free stock; if the PO was raised for an
  // order, reserve matching free units to that order's SO so the operator doesn't
  // have to. Best-effort + fail-safe: the receive already committed, so a hiccup
  // here is logged and swallowed (the order-drawer Ready picker is the fallback).
  try {
    await autoReserveReceivedToSourceOrder(sb, c.req.param("id"));
  } catch (e) {
    console.error("post-receive auto-reserve failed (non-fatal):", e);
  }
  return c.json(data);
});

/**
 * Reserve free warehouse units to the PO's source order after a receive.
 *
 * Matching uses normalizeSkuKey because the catalog is empty — order_lines.sku
 * and ops_stock_items.sku both carry the product NAME with cosmetic drift (see
 * project-catalog-empty-sku-naming). For each product the source order still
 * needs, we reserve that many free units (oldest first); we cap at need MINUS
 * what is already reserved to this SO, so a partial / repeat receive can never
 * over-reserve. The operator can release any of it from On Hand.
 */
async function autoReserveReceivedToSourceOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  poId: string,
): Promise<void> {
  const { data: po } = await sb
    .from("purchase_orders")
    .select("so, warehouse_id")
    .eq("id", poId)
    .maybeSingle();
  if (!po?.so) return; // stockpile PO (no source order) — nothing to reserve to.
  const soRef = `SO-${po.so}`;

  const { data: ord } = await sb
    .from("orders")
    .select("id")
    .eq("so", po.so)
    .maybeSingle();
  if (!ord?.id) return;

  const { data: oLines } = await sb
    .from("order_lines")
    .select("sku, qty")
    .eq("order_id", ord.id);
  if (!oLines || oLines.length === 0) return;

  // Needed qty per normalized product key (combine duplicate lines).
  const needByKey = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of oLines as any[]) {
    const k = normalizeSkuKey(l.sku);
    if (!k) continue;
    needByKey.set(k, (needByKey.get(k) ?? 0) + Number(l.qty || 0));
  }
  if (needByKey.size === 0) return;

  // Already reserved to this SO (so a repeat receive doesn't double-up).
  const { data: mine } = await sb
    .from("ops_stock_items")
    .select("sku")
    .eq("status", "reserved")
    .eq("reserved_ref", soRef);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mine ?? []) as any[]) {
    const k = normalizeSkuKey(r.sku);
    if (needByKey.has(k)) needByKey.set(k, needByKey.get(k)! - 1);
  }

  // Free units to draw from (scope to the PO's warehouse when set).
  let freeQ = sb
    .from("ops_stock_items")
    .select("id, sku")
    .eq("status", "free")
    .eq("needs_repair", false)
    .order("date_in", { ascending: true, nullsFirst: false });
  if (po.warehouse_id) freeQ = freeQ.eq("warehouse_id", po.warehouse_id);
  const { data: freeUnits } = await freeQ;
  if (!freeUnits || freeUnits.length === 0) return;

  // Pick the unit ids to reserve, honoring the remaining need per product.
  const idsToReserve: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of freeUnits as any[]) {
    const k = normalizeSkuKey(u.sku);
    const remaining = needByKey.get(k) ?? 0;
    if (remaining > 0) {
      idsToReserve.push(u.id);
      needByKey.set(k, remaining - 1);
    }
  }
  if (idsToReserve.length === 0) return;

  await sb
    .from("ops_stock_items")
    .update({ status: "reserved", reserved_ref: soRef, updated_at: new Date().toISOString() })
    .in("id", idsToReserve)
    .eq("status", "free"); // guard: skip any that got grabbed concurrently.
}

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

// ----- POST /:id/chase-event  record a chase (WhatsApp/phone follow-up) -----
// Writes ONE audit_log row keyed to the PO ref. Called by the cockpit's ②
// Chase button alongside the WhatsApp deep-link open, so we get a record of
// every chase without a dedicated table. Optional free-text `note` captures
// whatever the supplier said back. Best-effort — failure returns 500 but does
// not block the client from continuing to WhatsApp.
operationPosRouter.post("/:id/chase-event", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, chasePoEventInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const poId = c.req.param("id");
  const noteTail = parsed.data.note ? ` · ${parsed.data.note.slice(0, 200)}` : "";
  const { error } = await sb.from("audit_log").insert({
    role:       c.var.auth.role,
    actor_text: c.var.auth.email ?? null,
    action:     `PO chased${noteTail}`,
    ref:        poId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, chasedAt: new Date().toISOString() });
});

// ----- P3 · the two supplier calls (`PURCHASING-WORKING-FLOW.md` §3) --------
//
// Both routes are THIN: the gate, the ledger row, the promise history, the
// `line_etas` push and the audit are all inside one SECURITY DEFINER RPC
// (0306), so there is no PostgREST door that can record a supplier promise
// without writing who promised what — and no way for the two halves to land
// separately.
//
// The 22023 / P0001 details the RPCs raise are mapped to named 422 codes here
// so an operator meets a sentence rather than a Postgres string
// (`attribution_becomes_a_constraint`'s lesson, 0296).
const SUPPLIER_CALL_422: Record<string, string> = {
  invalid_input: "invalid_input",
  new_date_required: "new_date_required",
  po_not_open: "po_not_open",
  no_expected_arrival: "no_expected_arrival",
  line_not_part_received: "line_not_part_received",
};

function mapSupplierCallError(
  c: Context<AppEnv>,
  error: { code?: string; message?: string; details?: string },
) {
  const detail = (error.details ?? "").trim();
  const named = SUPPLIER_CALL_422[detail];
  if (named) {
    return c.json({ error: named, code: named, message: error.message ?? named }, 422);
  }
  if (detail === "po_not_found" || detail === "po_line_not_found") {
    return c.json({ error: detail, code: detail, message: error.message ?? detail }, 404);
  }
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

// ----- POST /:id/tomorrow-delivery -----
// `Call {supplier} — confirm tomorrow's delivery`, counted per PO. Two answers
// and no third (§3): shipping, or delayed with a new date. A DELAYED answer
// moves the PO's expected arrival AND reaches `ops_order_control.line_etas`,
// which is what opens **Delay planning** by itself — the Orders flow's stage 1,
// unchanged. Purchasing never invents a second delay conversation and never
// opens a call to the customer.
operationPosRouter.post("/:id/tomorrow-delivery", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, recordTomorrowDeliveryInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_record_tomorrow_delivery", {
    p_po_id: c.req.param("id"),
    p_answer: parsed.data.answer,
    p_new_date: parsed.data.answer === "delayed" ? parsed.data.newDate : null,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- POST /lines/:lineId/balance-date -----
// `Call {supplier} — confirm balance delivery date`, counted per PO LINE — the
// only one of the six purchasing actions that is, which is why this route keys
// on the line and not on the PO.
//
// PM decision A (Loo, 2026-07-29): the balance date ALSO reaches the ladder, so
// a balance landing after the customer's promised date opens Delay planning by
// itself. Same engine, same clock, no second delay model. On a MERGED PO that
// currently reaches every customer the PO covers — an accepted limitation until
// P5 gives purchasing an allocation.
operationPosRouter.post("/lines/:lineId/balance-date", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, recordBalanceDateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_record_balance_date", {
    p_po_line_id: c.req.param("lineId"),
    p_new_date: parsed.data.newDate,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

export default operationPosRouter;
