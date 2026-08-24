import { Hono, type Context } from "hono";
import {
  arrivalFromReadyDate,
  assignPickupPartnerInput,
  cancelPoInput,
  chasePoEventInput,
  listPurchaseOrdersQuery,
  normalizeSkuKey,
  reassignPoWarehouseInput,
  officeReceiveInput,
  recordBalanceDateInput,
  recordReadyDateInput,
  recordTomorrowDeliveryInput,
  confirmPoSentInput,
  recordSendInput,
  revisePoInput,
  setMessageTemplateInput,
  setLineDestinationInput,
  setLineOpsRemarkInput,
  splitLineDestinationInput,
  type AwaitingStockShortageResponse,
  type PoReportLine,
  type PoReportResponse,
} from "@carres/shared";
// renderPoPdf moved to apps/web/src/lib/pdf/render.ts (Workers WASM ban).
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

/* `poDutyGate` was deleted with the two create routes above (Card 4B). It
   guarded PO creation against the PO-duty roster, and those were its only two
   callers. Batch Purchase carries its own server-side gate inside
   `purchasing_issue_pos_batch`. */


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
      // Q5: `expected_ready_date` — the factory's own promise (0318), the
      // FIRST of §12.2's four dates and the one the register has never carried.
      // It is a different fact from `eta_date` (OUR prediction) and the two are
      // never merged: R5 grades a supplier on this column, so it holds only
      // what a human recorded after the supplier answered.
      // 0361: `purpose` — the reason the PO was born (customer_sales auto-stamp
      // or a typed demand purpose). The panel prints it as `Need for`; NULL for
      // every PO issued before 0361, deliberately not backfilled.
      // 0364: `version` + `revised_at` — which version of the document the
      // factory holds, and when the current one was minted. The panel prints
      // `PO-2041 · Version 2` and derives "Version N has not reached the
      // supplier" from `revised_at` against the latest send; nothing stores it.
      "id, supplier_id, warehouse_id, destination_id, status, sup_status, so, so_refs, eta_date, expected_ready_date, placed_at, purpose, version, revised_at, purchase_order_lines(id, sku, qty, received_qty, damaged_qty, wrong_item_qty, short_since, attrs, destination_id, ops_remark)",
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
  // The supplier-date FIELD's own history (Jess, 2026-08-02: a field's
  // history lives beside the field, never down in Activity). Same bounded
  // read — no extra round-trip.
  const promisesByPo = new Map<string, Record<string, unknown>[]>();
  if (poIds.length > 0) {
    const { data: promiseRows, error: promiseErr } = await sb
      .from("po_supplier_promises")
      .select(
        // `about_qty` and `remarks` are selected because this route already
        // READS them: the balance call's re-open test compares `about_qty` (it
        // was resolving to null on every row — a promise about a quantity the
        // client never received), and the date history prints `remarks` beside
        // the countable `reason` (0310). Found while wiring Q5's ready date;
        // fixed rather than left, since both are one word in this string.
        "po_id, po_line_id, kind, answer, about_date, about_qty, previous_date, new_date, reason, remarks, recorded_at",
      )
      .in("po_id", poIds)
      .order("recorded_at", { ascending: false });
    if (promiseErr) {
      const m = mapPgError(promiseErr);
      return c.json(m.body, m.status);
    }
    // Newest first, so the FIRST row seen for a key is the current answer.
    for (const r of promiseRows ?? []) {
      const row = r as Record<string, unknown>;
      const pid = row.po_id as string;
      const hist = promisesByPo.get(pid) ?? [];
      hist.push(row);
      promisesByPo.set(pid, hist);
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
  const orderIdBySo = new Map<number, string>();
  if (soSet.size > 0) {
    const { data: orderRows, error: orderErr } = await sb
      .from("orders")
      .select("id, so, delivery_date, customer_name")
      .in("so", [...soSet]);
    if (orderErr) {
      const m = mapPgError(orderErr);
      return c.json(m.body, m.status);
    }
    for (const r of orderRows ?? []) {
      const row = r as Record<string, unknown>;
      deliveryBySo.set(Number(row.so), (row.delivery_date as string | null) ?? null);
      customerBySo.set(Number(row.so), (row.customer_name as string | null) ?? null);
      orderIdBySo.set(Number(row.so), row.id as string);
    }
  }

  // ── The Items grid speaks EXCEL rows (Jess, 2026-08-02): one row per
  // SO × SKU, each with the SALESPERSON's remark flowing over from the sales
  // order — operation never keys it. Derived by matching the covered SOs'
  // order_lines to each PO line's SKU and dealing the PO qty out in SO order;
  // a quantity no SO claims stays an unattributed row (so: null). This is a
  // DISPLAY attribution — P5's allocation will make it structural.
  const soLinesByOrderId = new Map<
    string,
    { sku: string; qty: number; remark: string | null }[]
  >();
  if (orderIdBySo.size > 0) {
    const { data: solRows, error: solErr } = await sb
      .from("order_lines")
      .select("order_id, sku, qty, attrs")
      .in("order_id", [...orderIdBySo.values()]);
    if (solErr) {
      const m = mapPgError(solErr);
      return c.json(m.body, m.status);
    }
    for (const r of solRows ?? []) {
      const row = r as Record<string, unknown>;
      const attrs = (row.attrs as Record<string, unknown> | null) ?? {};
      const remark =
        typeof attrs.remark === "string" && attrs.remark.trim() !== ""
          ? (attrs.remark as string)
          : null;
      const arr = soLinesByOrderId.get(row.order_id as string) ?? [];
      arr.push({ sku: row.sku as string, qty: Number(row.qty ?? 0), remark });
      soLinesByOrderId.set(row.order_id as string, arr);
    }
  }
  /** Deal one PO line's qty out across its covered SOs, in SO order. */
  const soRowsOf = (
    row: Record<string, unknown>,
    sku: string,
    qty: number,
  ): { so: number | null; qty: number; remark: string | null }[] => {
    const sos: number[] = [];
    if (row.so != null) sos.push(Number(row.so));
    for (const r of (row.so_refs as number[] | null) ?? []) sos.push(Number(r));
    const out: { so: number | null; qty: number; remark: string | null }[] = [];
    let left = qty;
    for (const so of [...new Set(sos)].sort((a, b) => a - b)) {
      if (left <= 0) break;
      const oid = orderIdBySo.get(so);
      if (!oid) continue;
      for (const ol of soLinesByOrderId.get(oid) ?? []) {
        if (left <= 0) break;
        if (ol.sku !== sku) continue;
        const take = Math.min(left, ol.qty);
        if (take > 0) out.push({ so, qty: take, remark: ol.remark });
        left -= take;
      }
    }
    if (left > 0) out.push({ so: null, qty: left, remark: null });
    return out;
  };
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

  // The destination registry rides the list so the workspace's per-line picker
  // has its options without a second call (To Order reads it the same way).
  const { data: destRows, error: destErr } = await sb
    .from("purchasing_destinations")
    .select("id, name, is_default")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");
  if (destErr) {
    const m = mapPgError(destErr);
    return c.json(m.body, m.status);
  }

  // What LEFT Carres (0312), and since 0377 WHAT KIND of leaving it was: an
  // `external_open` is communication history and completes nothing; a
  // `confirmed_sent` carries recipient, actor, time and the exact version the
  // supplier received.
  const sendsByPo = new Map<string, Record<string, unknown>[]>();
  if (poIds.length > 0) {
    const { data: sendRows, error: sendErr } = await sb
      .from("po_sends")
      /* 0377/0378 — an OPEN and a CONFIRMED SEND are different facts, and the
         detail page has to be able to tell them apart. `kind`, `recipient` and
         `po_version` ride with the row so the evidence surface reads persisted
         truth rather than whatever it happens to remember. */
      /* 0379 — and WHO. `sent_by` is the person who pressed it, `duty_user_id`
         the month's holder and `acting_user_id` the authorised cover when one
         acted. Three facts, because `Team Work` groups by the holder while the
         audit trail must name the actor. */
      .select(
        "po_id, channel, note, sent_at, kind, recipient, po_version, sent_by, duty_user_id, acting_user_id, po_revisions(rev_no)",
      )
      .in("po_id", poIds)
      .order("sent_at", { ascending: false });
    if (sendErr) {
      const m = mapPgError(sendErr);
      return c.json(m.body, m.status);
    }
    /* A UUID IS NOT AN ACTOR. The evidence has to be readable by a human
       checking later who sent what, so the names are resolved here rather than
       printed as an id (closure §8). */
    const actorIds = [
      ...new Set(
        (sendRows ?? [])
          .flatMap((r) => {
            const row = r as Record<string, unknown>;
            return [row.sent_by, row.duty_user_id, row.acting_user_id];
          })
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];
    const actorName = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: people } = await sb
        .from("app_users")
        .select("id, name, email")
        .in("id", actorIds);
      for (const u of (people ?? []) as Record<string, unknown>[]) {
        const label =
          ((u.name as string | null) ?? "").trim() || ((u.email as string | null) ?? "");
        if (label) actorName.set(u.id as string, label);
      }
    }
    for (const r of sendRows ?? []) {
      const row = r as Record<string, unknown>;
      const arr = sendsByPo.get(row.po_id as string) ?? [];
      arr.push({
        ...row,
        sent_by_name: actorName.get(row.sent_by as string) ?? null,
        duty_name: actorName.get(row.duty_user_id as string) ?? null,
        acting_name: actorName.get(row.acting_user_id as string) ?? null,
      });
      sendsByPo.set(row.po_id as string, arr);
    }
  }

  const { data: tmplRow } = await sb
    .from("purchasing_settings")
    .select("supplier_message_template")
    .eq("id", 1)
    .maybeSingle();

  const withAnswers = pos.map((p) => {
    const row = p as Record<string, unknown>;
    const lines = (row.purchase_order_lines as Array<Record<string, unknown>> | null) ?? [];
    return {
      ...row,
      tomorrow_answer_about_date: tomorrowAboutByPo.get(row.id as string) ?? null,
      customer_delivery: customerDeliveryOf(row),
      orders: ordersOf(row),
      eta_revised: (arrivalDatesByPo.get(row.id as string)?.size ?? 0) > 1,
      promises: promisesByPo.get(row.id as string) ?? [],
      sends: sendsByPo.get(row.id as string) ?? [],
      purchase_order_lines: lines.map((l) => ({
        ...l,
        balance_answer_about_qty: balanceAboutByLine.get(l.id as string) ?? null,
        model_name: modelBySku.get(l.sku as string)?.model_name ?? null,
        size: modelBySku.get(l.sku as string)?.size ?? null,
        so_rows: soRowsOf(row, l.sku as string, Number(l.qty ?? 0)),
      })),
    };
  });

  return c.json({
    pos: withAnswers,
    destinations: destRows ?? [],
    messageTemplate:
      (tmplRow as { supplier_message_template?: string | null } | null)
        ?.supplier_message_template ?? null,
  });
});

// ----- GET /report -----
//
// Q3 · Purchasing → Report. The whole "look at the numbers" layer: one flat
// purchase-order LINE per row, and every figure on screen is computed from
// them at read time by `buildPoReport` (`packages/shared/src/po-report.ts`).
//
// **It stores nothing** — no table, no RPC, no cached figure. It reads exactly
// the `purchase_order_lines` the register reads, so the report and the register
// can never disagree about a number.
//
// **NO MONEY IS ON THE WIRE** (Loo, 2026-08-04). `cost` is not selected and no
// price field exists on the payload, so a client cannot print what it never
// receives — 0307's own discipline, applied to a read.
//
// A cancelled purchase order is sent WITH its `cancelled` flag rather than
// filtered out here: the exclusion is a business rule the shared module owns
// and a test can remove, and the screen states it.
//
// Path is registered before the `/:id/*` routes so the static segment wins in
// Hono's matcher, exactly as `/awaiting-stock-shortage` below is.
operationPosRouter.get("/report", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, status, placed_at, suppliers(name), purchase_order_lines(sku, qty, received_qty)",
    )
    .order("placed_at", { ascending: false })
    // A ceiling, not a page: the report has no pagination and none is wanted,
    // so this is the point at which the figures would need a server-side
    // aggregate instead of a flatten. 21 purchase orders live (2026-08-04).
    .limit(1000);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const rows = data ?? [];

  // The category comes from the catalog, one bounded IN() over the page's
  // distinct SKUs — the same shape the list route uses for `model_name`.
  const skuSet = new Set<string>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    for (const l of (row.purchase_order_lines as Array<Record<string, unknown>> | null) ?? [])
      skuSet.add(l.sku as string);
  }
  const categoryBySku = new Map<string, string | null>();
  if (skuSet.size > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, product_models(category)")
      .in("sku", [...skuSet]);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    for (const r of skuRows ?? []) {
      const row = r as Record<string, unknown>;
      const model = row.product_models as { category?: string | null } | null;
      categoryBySku.set(row.sku as string, model?.category ?? null);
    }
  }

  const lines: PoReportLine[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const supplier = row.suppliers as { name?: string | null } | null;
    const placedAt = row.placed_at as string | null;
    // MYT, the portal's zone — the api's own idiom (`+8h`, then slice), so a
    // purchase order raised at 9pm on the 31st is not filed under next month.
    const month = placedAt
      ? new Date(new Date(placedAt).getTime() + 8 * 3_600_000).toISOString().slice(0, 7)
      : "";
    for (const l of (row.purchase_order_lines as Array<Record<string, unknown>> | null) ?? []) {
      lines.push({
        poId: row.id as string,
        supplierId: (row.supplier_id as string | null) ?? "",
        supplierName: supplier?.name ?? ((row.supplier_id as string | null) ?? ""),
        month,
        category: categoryBySku.get(l.sku as string) ?? null,
        cancelled: (row.status as string | null) === "cancelled",
        ordered: Number(l.qty ?? 0),
        received: Number(l.received_qty ?? 0),
      });
    }
  }

  return c.json({ lines } satisfies PoReportResponse);
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
//   - stock_sku_availability (0366 — the unit register's one availability
//     authority; no filter, summed across all warehouses per Q2=A)
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

  // Step 2 — fetch order_lines (for those order IDs) AND the unit register's
  // availability (all rows) in parallel. Same Promise.all pattern as orders.ts:164/212.
  // 0076 (Loo 2026-05-10): also pull `attrs` so the per-(sku, attrs)
  // aggregation below can preserve color/gap/fabric for CreatePOModal's
  // cascade pre-fill. attrs is jsonb; NULL stays NULL for mattress lines.
  // 2026-05-18 (Loo) — also pull `order_id` so per-(so, sku, attrs)
  // aggregation can attribute each line back to its source SO for the
  // `bySo` breakdown (Phase 3 per-SO PO auto-split).
  const [linesRes, stockRes] = await Promise.all([
    sb.from("order_lines").select("order_id, sku, qty, attrs").in("order_id", orderIds),
    // 0366 — the shortage feed decides what we still have to BUY, so it must
    // read what we can actually offer. `stock_balances` is a non-authoritative
    // cache now; `stock_sku_availability` counts the exact units.
    sb.from("stock_sku_availability").select("sku, sellable"),
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
    // 0368 — `sellable`, not `available`. This feed decides what to BUY, and a
    // shelf holding 555 pillows needs no purchase order even though no pillow
    // carries an identity. (`available` counts only exact Units a Sales Order
    // can BIND, which is a different question.) Never qty − reserved either:
    // that counted a unit in repair as sellable.
    const avail = Number(r.sellable ?? 0);
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
// Server-side PO PDF payload — the money-free `purchasing_po_document` RPC
// (migration 0307). The RM figures are ABSENT FROM THE PAYLOAD, not hidden by
// the template, so no client can print what it never receives
// (docs/pdf/PO-PDF-STANDARD.md §2 — Loo 2026-07-29 / 2026-08-01). The RPC also
// enforces the role gate, refuses a cancelled PO and refuses a destination
// with no address on file.
//
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

// ⭐ THE ROUTE ADDS NOTHING (0383; Card closure §7).
//
// It used to add two facts and both were wrong. `so_refs` was re-read here
// because per-line attribution did not exist in the schema — 0382 gave it one,
// so the document now carries which customer order each unit is for and the
// `SO NO` column is fed from that instead of printing blank on every bulk PO.
// `issued_by` was hard-coded `null`, which erased the issuer the creation helper
// had already written to `audit_log`.
//
// `purchasing_po_document` is the document authority. A route that overwrites
// its answer is a second truth about the same paper.
// 2026-05-12 (Loo): browser renders @react-pdf locally (Workers WASM ban —
// see render.ts note in apps/web/src/lib/pdf/).
operationPosRouter.get("/:id/print-data", requireOperation, async (c) => {
  const poId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: doc, error } = await sb.rpc("purchasing_po_document", { p_po_id: poId });
  if (error) {
    // The RPC raises with a machine-readable `detail` (PostgREST → .details).
    const details = String((error as { details?: string }).details ?? "");
    if (details === "po_not_found" || error.code === "42P01") {
      return c.json({ error: "not_found", code: "not_found", message: "PO not found" }, 404);
    }
    if (details === "po_not_printable") {
      return c.json(
        { error: "rule_violation", code: "po_not_printable", message: "Cancelled POs cannot be printed" },
        422,
      );
    }
    if (details === "destination_address_missing") {
      return c.json(
        {
          error: "rule_violation",
          code: "destination_address_missing",
          message: "No address on file for this PO's destination",
        },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json(doc as Record<string, unknown>);
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
// ----- POST / and POST /batch — RETIRED 2026-08-11 (Card 4B) -----
//
// These were the application's single-create and batch-create Purchase Order
// doors. They called `operation_create_po` and `operation_create_pos_batch`,
// two of the four extra creation authorities the Card 4 audit found still
// reachable from the browser.
//
// ONE CREATION AUTHORITY, GOVERNED CALLERS.
// `purchasing_issue_pos_batch(jsonb)` is the only authority that may create a
// Purchase Order. It is reached through the governed operator journeys — SO
// Batch Purchase (`POST /api/operation/purchase/to-order/issue-batch`) and
// Manual Purchase (its own approved issue route) — and through nothing else.
// One authority with named callers is the law; "one caller" never was.
//
// (Corrected 2026-08-23. This comment named `POST …/to-order/issue` as the one
// caller; that route is RETIRED — CARD-2026-08-22-purchasing-02 deleted it —
// and Manual Purchase was always a second governed caller of the same RPC.)
//
// DELETED rather than left standing as a 403, for the reason the `/receive`
// retirement below already states in this file: a live route with no caller is
// a bypass one curl away, and a compatibility write door is exactly the hidden
// authority this card exists to remove. A browser still holding an old bundle
// now meets a loud 404 instead of quietly minting a PO nobody governed.
//
// The RPCs themselves are NOT dropped — they are the construction history of
// every PO on file — but migration 0339 revokes EXECUTE from `public`, `anon`
// and `authenticated`, so this route could not reach them even if it returned.

// ----- POST /:id/receive — RETIRED 2026-08-03 (Card C1, Jess) -----
//
// This was the Office's receiving door and it opened NO Receiving Session:
// it called `operation_receive_po_with_do` directly, so stock moved and the
// delivery left no record, no event and no GRN. `POST /:id/office-receive`
// below is the one Office door now, and it goes through `office_receive_post`
// (0315) — Session, event and stock in one transaction.
//
// Deleted rather than left standing: with `ReceivePOModal` gone this route had
// zero callers, and a live route with no caller is a bypass one curl away. A
// browser still holding the old bundle now meets a loud 404 instead of quietly
// writing a receive nobody can trace.
//
// The RPC itself stays — it is the ONE receive engine, called by
// `office_receive_post`, `warehouse_receipt_check_in` and the partner's
// arrive-at-warehouse route.

// ----- POST /:id/office-receive -----
//
// Slice B — the Office Receiving Workspace's ONE write door (migration 0315
// `office_receive_post`). A thin door: every rule lives in the RPC, which
// shares `warehouse_receipt_validate_lines` with the warehouse's door and
// hands the stock movement to the same `operation_receive_po_with_do`.
//
// What this route does that `/receive` above does NOT: it opens a **Receiving
// Session** — one physical delivery, one record, one `posted` event. Ops
// receiving through `/receive` leaves no document at all, which is why the
// Workspace never calls it.
//
// Reshape at the boundary, the same discipline as `/receive`: the wire is
// camelCase, `p_lines` is snake_case. `received_now` is a DELTA here, not a
// new total — the Session stores what THIS delivery brought and the engine
// derives the cumulative figure (RECEIVING-INFORMATION-MODEL §7.1).
operationPosRouter.post("/:id/office-receive", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, officeReceiveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("office_receive_post", {
    p_po_id: c.req.param("id"),
    p_do_number: parsed.data.doNumber,
    p_do_file_path: parsed.data.doFilePath,
    p_note: parsed.data.note ?? null,
    // Omitted → the RPC stamps today in MYT. The browser's clock never
    // decides a business date.
    p_goods_received_at: parsed.data.goodsReceivedAt ?? null,
    p_lines: parsed.data.lines.map((l) => ({
      id: l.id,
      received_now: l.receivedNow,
      damaged_qty: l.damagedQty ?? 0,
      wrong_item_qty: l.wrongItemQty ?? 0,
      damaged_photos: l.damagedPhotos ?? [],
      wrong_item_claim_type: l.wrongItemClaimType ?? null,
      wrong_item_photos: l.wrongItemPhotos ?? [],
    })),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // The SAME post-receive step `/receive` runs. Without it, goods booked in
  // through the Workspace would sit unreserved while goods booked in through
  // the old modal were reserved — one act, two outcomes, decided by which
  // screen the operator happened to use.
  try {
    await autoReserveReceivedToSourceOrder(sb, c.req.param("id"));
  } catch (e) {
    console.error("post-receive auto-reserve failed (non-fatal):", e);
  }
  return c.json(data);
});

// ----- GET /:id/receiving -----
//
// What the Receiving Workspace reads: this PO's Receiving Sessions, newest
// first, each with its events. The Activity section reads the EVENT LEDGER and
// nothing else (RECEIVING-INFORMATION-MODEL §6), so the events ride here
// rather than being re-derived from the session's columns — a second
// derivation's only power is to disagree with the first.
operationPosRouter.get("/:id/receiving", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const poId = c.req.param("id");

  const { data: rows, error } = await sb
    .from("warehouse_receipts")
    .select(
      "id, po_id, warehouse_id, do_number, do_file_path, note, lines, status, submitted_from, goods_received_at, submitted_by, submitted_at, posted_by, posted_at, return_reason",
    )
    .eq("po_id", poId)
    .order("goods_received_at", { ascending: false })
    .order("submitted_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const sessions = (rows ?? []) as Array<Record<string, unknown>>;
  const ids = sessions.map((s) => s.id as string);

  const { data: evs } = ids.length
    ? await sb
        .from("receiving_events")
        .select("id, receipt_id, event, actor_id, event_at, payload")
        .in("receipt_id", ids)
        .order("event_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };
  const events = (evs ?? []) as Array<Record<string, unknown>>;

  // Names are resolved here, never stored on the event: the ledger records WHO
  // by id so it survives a rename, and the screen needs the name as it stands
  // today.
  const userIds = [
    ...new Set(
      [
        ...sessions.flatMap((s) => [s.submitted_by, s.posted_by]),
        ...events.map((e) => e.actor_id),
      ].filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const userNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", userIds);
    for (const u of users ?? [])
      userNames.set(u.id as string, u.name as string);
  }

  return c.json({
    sessions: sessions.map((s) => ({
      ...s,
      posted_by_name: s.posted_by
        ? (userNames.get(s.posted_by as string) ?? null)
        : null,
      submitted_by_name: s.submitted_by
        ? (userNames.get(s.submitted_by as string) ?? null)
        : null,
    })),
    events: events.map((e) => ({
      ...e,
      actor_name: e.actor_id
        ? (userNames.get(e.actor_id as string) ?? null)
        : null,
    })),
  });
});

/**
 * Label THIS PO's just-received units to the PO's source order.
 *
 * CARD 2 (2026-08-11): the pick is scoped to `po_no = poId` — the units this
 * PO minted at Issue and Receiving just flipped free. Labelling the goods
 * bought FOR an order to that order honours the purchase intent (§3.13:
 * goods are labelled per order). What this function may NEVER do again is
 * draw the WHOLE free pool: reserving pre-existing ready stock is an
 * allocation decision, and Card 2's law is "the system may OFFER compatible
 * stock; a human decides. Never silently auto-allocate or reallocate."
 * The general pool stays reachable only through the human doors
 * (`/reserve`, `/reserve-item`, To Order's Reserve — all via
 * `ops_stock_pool_draw` with its reason ledger).
 *
 * Matching uses normalizeSkuKey because the catalog is empty — order_lines.sku
 * and ops_stock_items.sku both carry the product NAME with cosmetic drift (see
 * project-catalog-empty-sku-naming). We cap at need MINUS what is already
 * reserved to this SO, so a partial / repeat receive can never over-reserve.
 * The operator can release any of it from On Hand.
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

  // CARD 2: ONLY this PO's own units — the goods bought for this order.
  // The whole-pool draw this once was is a silent allocation and is closed.
  let freeQ = sb
    .from("ops_stock_items")
    .select("id, sku")
    .eq("status", "free")
    .eq("needs_repair", false)
    .eq("po_no", poId)
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

  // 0366 — THE binding door. This was a raw `.update()` straight onto the
  // register: a second reservation writer beside the governed pool draw, with
  // no lineage and nothing stopping it from binding a bulk row to one
  // customer. `ops_stock_bind_units` takes only free, uncontrolled, single
  // units, records the event, and skips anything grabbed concurrently.
  const { error: bindErr } = await sb.rpc("ops_stock_bind_units", {
    p_item_ids: idsToReserve,
    p_ref: soRef,
    p_note: null,
  });
  if (bindErr) {
    // Labelling is a consequence of receiving, not the receipt itself: the
    // goods ARE here. Surfacing this as a failed receive would be a lie, so
    // it is logged and the units stay free for the operator to bind by hand.
    console.error("autoReserveReceivedToSourceOrder: bind refused", bindErr);
  }
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
  // PO Revisions (0364): the SQL door's own refusals. The messages are the
  // governed sentences — the client prints them verbatim, inline.
  reason_required: "reason_required",
  nothing_changed: "nothing_changed",
  sent_po_needs_revision: "sent_po_needs_revision",
};

function mapSupplierCallError(
  c: Context<AppEnv>,
  error: { code?: string; message?: string; details?: string },
) {
  const detail = (error.details ?? "").trim();
  // THE FLOOR (0364, 2990s' shape): revising a line below its received_qty is
  // a CONFLICT with goods already on a Carres floor, not a bad request — the
  // fix is a Purchase Return, not a retype. 409, like 2990s' approve-po.
  if (detail === "received_floor") {
    return c.json(
      {
        error: "received_floor",
        code: "received_floor",
        message: error.message ?? "received_floor",
      },
      409,
    );
  }
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
  // Remarks + the first-confirm date ride the extended RPC (draft migration —
  // until it is applied this door serves the 0306 signature only, which is why
  // the extras are omitted when absent rather than sent as nulls).
  const extras: Record<string, unknown> = {};
  if (parsed.data.remarks != null) extras.p_remarks = parsed.data.remarks;
  const { data, error } = await sb.rpc("purchasing_record_tomorrow_delivery", {
    p_po_id: c.req.param("id"),
    p_answer: parsed.data.answer,
    p_new_date:
      parsed.data.answer === "delayed"
        ? parsed.data.newDate
        : (parsed.data.firstDate ?? null),
    p_reason: parsed.data.reason ?? null,
    ...extras,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- POST /:id/ready-date -----
// Q5 · `Call {supplier} — confirm ready date`, counted per PO. THE DOOR THAT
// HAD NO HANDLE: `purchasing_record_ready_date` shipped with migration 0318 on
// 2026-08-03 and nothing in the portal has ever called it, so the action the
// flow file has defined since it was written could not be closed from a screen.
//
// It is deliberately the twin of `/tomorrow-delivery` above — `userClient` +
// the operator's own JWT, never `service_role` (the RPC's own
// `purchasing_supplier_call_gate()` IS the boundary, and a service key would
// walk around it), and the same `mapSupplierCallError`, so `po_not_open` comes
// back as a readable 422 instead of a raw Postgres string.
//
// The RPC does everything in one transaction: the append-only promise row
// (`kind='ready_date'`), the PO's own `expected_ready_date`, and the
// `po_history` sentence. Nothing here computes or stores a second copy.
operationPosRouter.post("/:id/ready-date", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, recordReadyDateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Slice 1 (Loo, 2026-08-06): a ready date the factory gives MOVES the
  // expected arrival — new arrival = ready date + transit working days on the
  // OFFICE week, computed with `arrivalFromReadyDate`, the ONE spelling of
  // that leg (the same function `expectedArrivalOf` calls — Law D; a plpgsql
  // copy is exactly the second spelling the register bug came from). No
  // transit number → null → the RPC keeps the old arrival rather than
  // guessing one (P1). Both lookups fail-SOFT to null: the ready date must
  // still record even when the settings read hiccups.
  const poId = c.req.param("id");
  let newEta: string | null = null;
  try {
    const [poRow, transitRow] = await Promise.all([
      sb.from("purchase_orders").select("supplier_id").eq("id", poId).maybeSingle(),
      sb
        .from("purchasing_supplier_settings")
        .select("supplier_id, transit_days"),
    ]);
    const supplierId = (poRow?.data as { supplier_id?: string } | null)?.supplier_id;
    if (supplierId) {
      const suppliers = ((transitRow?.data ?? []) as Array<{
        supplier_id: string;
        transit_days: number | null;
      }>).map((r) => ({
        id: r.supplier_id,
        name: "",
        categories: [] as const,
        offDays: null,
        transitDays: r.transit_days ?? null,
      }));
      newEta = arrivalFromReadyDate(
        { suppliers },
        { supplierId, readyDateIso: parsed.data.newDate },
      );
    }
  } catch {
    newEta = null;
  }

  const { data, error } = await sb.rpc("purchasing_record_ready_date", {
    p_po_id: poId,
    p_new_date: parsed.data.newDate,
    p_reason: parsed.data.reason ?? null,
    p_new_eta: newEta,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- GET /:id/sends -----
// THE OUTBOUND EVIDENCE FOR ONE PURCHASE ORDER (closure §8; 0377 · 0378 · 0379).
//
// SO Batch Purchase issues a purchase order and then has to chase it. It has no
// register behind it, so without this read the evidence surface could only show
// what the current tab happened to remember — and a reload, a second operator or
// a revision would each tell a different story about the same paper.
//
// Every row carries what makes it evidence: the kind (an OPEN completes
// nothing), the exact version, the recipient, the channel, the time, and WHO —
// the actor, the month's duty holder and the authorised cover when one acted.
operationPosRouter.get("/:id/sends", requireOperation, async (c) => {
  const poId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: rows, error } = await sb
    .from("po_sends")
    .select(
      "channel, note, sent_at, kind, recipient, po_version, sent_by, duty_user_id, acting_user_id",
    )
    .eq("po_id", poId)
    .order("sent_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const ids = [
    ...new Set(
      (rows ?? [])
        .flatMap((r) => {
          const row = r as Record<string, unknown>;
          return [row.sent_by, row.duty_user_id, row.acting_user_id];
        })
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const named = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await sb.from("app_users").select("id, name, email").in("id", ids);
    for (const u of (people ?? []) as Record<string, unknown>[]) {
      const label = ((u.name as string | null) ?? "").trim() || ((u.email as string | null) ?? "");
      if (label) named.set(u.id as string, label);
    }
  }

  return c.json({
    sends: (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        ...row,
        sent_by_name: named.get(row.sent_by as string) ?? null,
        duty_name: named.get(row.duty_user_id as string) ?? null,
        acting_name: named.get(row.acting_user_id as string) ?? null,
      };
    }),
  });
});

// ----- POST /:id/sends -----
// AN APP THAT OPENED, NOT A PDF THAT ARRIVED (0377, Card 02 §7.4).
//
// This door records that an external channel was OPENED. It once meant "sent",
// and that was the defect: the operator opens the WhatsApp group, gets
// interrupted, never pastes the file, and the Portal says the order went out.
// Since 0377 its rows are `external_open` and they close nothing. The act that
// completes Issue PO is `POST /:id/confirm-sent` below.
//
// It is KEPT rather than deleted: knowing an operator opened the group at
// 14:02 is real history, and the honest fix was to stop misreading it.
operationPosRouter.post("/:id/sends", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, recordSendInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_record_send", {
    p_po_id: c.req.param("id"),
    p_channel: parsed.data.channel,
    p_note: parsed.data.note ?? null,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- POST /:id/confirm-sent -----
// THE ONE ACT THAT CLOSES ISSUE PO (0377; purchasing/MASTER.md §5.6).
//
// The operator has actually sent the official PDF and says so. The RPC records
// channel, recipient, actor, Malaysia time and — read from the purchase order,
// never accepted from here — the EXACT version that left. Current PO Duty is
// enforced in SQL, because a door only the UI guards is not guarded.
operationPosRouter.post("/:id/confirm-sent", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, confirmPoSentInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_confirm_po_sent", {
    p_po_id: c.req.param("id"),
    /* 0378 — the version the operator RENDERED, declared. SQL locks the row and
       compares it against the version that exists; a mismatch writes nothing.
       The stored version is still SQL's own read. */
    p_expected_version: parsed.data.poVersion,
    p_channel: parsed.data.channel,
    p_recipient: parsed.data.recipient,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    /* THE ONE ERROR THE OPERATOR CAN ACT ON, in the approved two-line form
       (`docs/purchasing/MASTER.md` §8.3): the FACT, then the FIX. Everything
       else falls through to the shared supplier-call mapping. */
    const details = String((error as { details?: string }).details ?? "");
    if (details === "stale_po_version" || /stale_po_version/.test(error.message ?? "")) {
      return c.json(
        {
          error: "rule_violation",
          code: "stale_po_version",
          message: "Purchase order changed",
          action: "Open the latest PDF and send it again.",
        },
        409,
      );
    }
    return mapSupplierCallError(c, error);
  }
  return c.json({ ok: true, result: data });
});

// ----- POST /:id/revise -----
// A sent PO is not overwritten — it is REVISED (Jess, 2026-08-18; 0364). The
// number is KEPT and a version is minted: the RPC snapshots the PRIOR document
// into po_revisions with the reason and the author, floors every qty at its
// received_qty (409 `received_floor` — the fix is a Purchase Return, never a
// retype), applies the line edits, bumps `version`, stamps `revised_at` and
// appends po_history. EXISTING lines only: adding items is a NEW PO, stopping
// is the whole PO (Cancel). The reason is required IN SQL — the zod mirror
// here only fails faster.
operationPosRouter.post("/:id/revise", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, revisePoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_revise_po", {
    p_po_id: c.req.param("id"),
    p_reason: parsed.data.reason,
    p_lines: parsed.data.lines.map((l) => ({
      line_id: l.lineId,
      qty: l.qty,
      destination_id: l.destinationId,
    })),
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- PUT /message-template -----
operationPosRouter.put("/message-template", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, setMessageTemplateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_set_message_template", {
    p_text: parsed.data.text,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

// ----- POST /lines/:lineId/destination · /split · /ops-remark -----
// Where each LINE goes (Jess, 2026-08-02 — 0311). Purchasing's only per-line
// job: ten to Klang, one to AL. A whole line moves; a PART of a line SPLITS
// (the PO stays one document with one supplier — her frozen law). The ops
// remark is internal and, by 0311's own sanity check, can never print.
operationPosRouter.post("/lines/:lineId/destination", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, setLineDestinationInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_set_line_destination", {
    p_line_id: c.req.param("lineId"),
    p_destination_id: parsed.data.destinationId,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

operationPosRouter.post("/lines/:lineId/split", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, splitLineDestinationInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_split_line_destination", {
    p_line_id: c.req.param("lineId"),
    p_move_qty: parsed.data.moveQty,
    p_destination_id: parsed.data.destinationId,
  });
  if (error) return mapSupplierCallError(c, error);
  return c.json({ ok: true, result: data });
});

operationPosRouter.post("/lines/:lineId/ops-remark", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, setLineOpsRemarkInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_set_line_ops_remark", {
    p_line_id: c.req.param("lineId"),
    p_text: parsed.data.text,
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
