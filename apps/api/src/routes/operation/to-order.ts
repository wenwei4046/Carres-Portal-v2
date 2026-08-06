import { Hono } from "hono";
import { z } from "zod";
import {
  buildToOrder,
  DEMAND_PURPOSE_DEFAULT,
  DEMAND_PURPOSE_VALUES,
  expectedArrivalOf,
  isToOrderCategory,
  myHolidaySet,
  planFromDocuments,
  productionWorkingDaysFor,
  readyStockDrawNote,
  READY_STOCK_DRAW_REASON,
  readyStockRef,
  stockMatchKey,
  toOrderBuilds,
  railItemLabel,
  workWeekOffDaysFor,
  type DemandPickItem,
  type ProductCategory,
  type IssueDocument,
  type ToOrderBuild,
  type ToOrderLine,
  type ToOrderOrderedRow,
  type ToOrderProposal,
  type ToOrderRow,
} from "@carres/shared";
import { validateIssuePlan } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase/to-order — the Planning Workspace.
 *
 *   GET  /            the proposals the Review Grid shows
 *   POST /issue       the ONE act that creates formal purchase orders
 *
 * **Nothing here stores a proposal.** The read recomputes it every time, which
 * is the whole reason To Order has no status, no hold and no audit of its own.
 *
 * **The write goes through `operation_create_po`, the RPC that has always
 * created purchase orders.** No second write path is introduced and no
 * migration is needed: the destination is set with a follow-up UPDATE, which
 * `trg_po_destination_guard` already permits for operation/principal while a PO
 * has received nothing.
 *
 * userClient / RLS is the security boundary throughout — never service_role.
 */
const toOrderRouter = new Hono<AppEnv>();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Split an `.in(…)` list into small batches.
 *
 * On 2026-07-30 seven customer requirements across five customer orders reached
 * no purchase order at all, and two whole customer orders disappeared from the
 * workspace. The projection was proved correct on the same data, every SKU
 * existed with the same supplier, the same category and the same production
 * time as the ones that DID get ordered, none was excluded and none was covered
 * — so the loss happened in the catalog read, and a `.in()` of 78 values with
 * quoted parentheses is the one thing between the demand and the plan.
 *
 * Chunking removes the whole class rather than one instance. The guard below
 * removes the rest: even if a read still comes back short, the demand is now
 * NAMED instead of skipped.
 */
const IN_CHUNK = 40;

function chunk<T>(xs: readonly T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** `attrs` is jsonb; read one string field defensively. */
function attr(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const v = (attrs as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

type Unresolved = { sku: string; orderId: string; so: number | null };

type CatalogFact = {
  supplierId: string | null;
  cost: number | null;
  variant: string | null;
  variantKind: string | null;
  category: string | undefined;
  modelName: string | null;
};

type Loaded = {
  proposals: ToOrderProposal[];
  today: string;
  /** Settings' PO Days — the rail's purchase calendar runs on it. */
  poDays: readonly number[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved: Unresolved[];
  /** The whole catalog, read once — the ordered read reuses it. */
  catalog: Map<string, CatalogFact>;
  /**
   * The numbers, read ONCE. The issue path needs them for the PO's birth
   * certificate; reading them a second time there costs a query AND lets the
   * plan and the dates stamped on it come from two different reads.
   */
  settings: Awaited<ReturnType<typeof loadPurchasingSettings>>;
  /** P10 — the warehouse the free stock was counted at, by its own name. */
  stockWarehouse: { id: string; name: string } | null;
  /** P10 — how many units each offered register record holds, so the take can
   *  say what it drew without a second read. */
  stockQtyById: Map<string, number>;
};

/**
 * P10 — the ONE reference a drawn unit is committed to, for a row of this
 * grid. Server-side, so a browser can never name someone else's order.
 */
function stockRefOf(
  readyStock: boolean | undefined,
  so: number | null,
  destination: string | null | undefined,
): string | null {
  if (readyStock) return readyStockRef(destination ?? null);
  return so != null ? `SO-${so}` : null;
}

/**
 * ── READY STOCK, THE ONE RULE (card P10, Loo 2026-08-04) ────────────────────
 *
 * The engine has computed how much a demand could take from free stock since
 * the day it was written, and it was switched off (`consumeFreeStock`) and
 * shown to nobody. Jess's 2026-07-21 ruling — goods are labelled per order, so
 * nothing auto-consumes them — is right and stays; what was missing is that a
 * decision reserved for a human never reached the human.
 *
 * **P15 EXTRACTED THIS INTO A FUNCTION AND CHANGED NOT ONE LINE OF IT.** The
 * Create Purchase picker must show *"the same free-stock number the grid would
 * offer for that SKU (one rule, not a second count)"* — that card's Must-NOT
 * says so by name — and the only way a second surface cannot disagree with the
 * first is for there to be no second implementation. Two callers, one body.
 *
 * THE REGISTER, NOT `stock_balances`. They are two tables with no trigger
 * between them (measured 2026-08-04), and the pool draw moves the REGISTER.
 * A number read from the other one would not fall when a unit was taken, so
 * the same units would be offered again tomorrow. `purchase.ts`'s advisory
 * read still uses `stock_balances`; that is a different surface and is
 * reported, not changed here.
 *
 * IT MAY NEVER TAKE THE PAGE DOWN. To Order turned customer orders into
 * purchase orders for months before ready stock was on it; if the table is
 * unreachable the FEATURE is unavailable and the workspace is exactly what it
 * was — no offer, no netting, nothing invented.
 */
async function readFreeStock(sb: ReturnType<typeof userClient>): Promise<{
  stockWarehouse: { id: string; name: string } | null;
  freeStock: Record<string, { id: string; qty: number }[]>;
  stockQtyById: Map<string, number>;
}> {
  let stockWarehouse: { id: string; name: string } | null = null;
  const freeStock: Record<string, { id: string; qty: number }[]> = {};
  const stockQtyById = new Map<string, number>();
  try {
    const { data: whRows } = await sb
      .from("warehouses")
      .select("id, name, kind")
      .eq("kind", "own");
    const own = whRows ?? [];
    // The issue path's own rule, so the stock offered and the warehouse a
    // purchase order is raised against can never be two different places.
    const wh = own.find((w) => /klang|klg/i.test((w.name as string) ?? "")) ?? own[0];
    if (wh) {
      stockWarehouse = { id: wh.id as string, name: (wh.name as string) ?? "" };

      const { data: itemRows, error: itemErr } = await sb
        .from("ops_stock_items")
        .select("id, sku, qty, date_in, created_at")
        .eq("status", "free")
        .eq("needs_repair", false)
        // READY STOCK'S OWN DEFINITION OF READY, mirrored rather than
        // re-decided (`GET /api/ops/stock/ready`). Free and sound is not
        // enough on its own: R4 releases a quarantined unit back to `free`,
        // so the day a DAMAGED one is released this page would otherwise
        // offer it to a customer's order. Live exposure today is zero
        // (measured 2026-08-04: 54 `new` + 33 `exhibition`, nothing else) —
        // which is exactly why it is closed now rather than after the first
        // release. The list is that route's, verbatim, and its own header
        // comment is stale: the CODE admits `old` and `refurbished` too and
        // excludes only `damaged`.
        .in("condition", ["new", "exhibition", "old", "refurbished"])
        .eq("warehouse_id", stockWarehouse.id);
      if (itemErr) throw new Error(itemErr.message);

      // FIFO — `ops_stock_pool_draw`'s own pick order (oldest first), so the
      // records this page offers are the records it would have taken anyway.
      const items = [...((itemRows ?? []) as Record<string, unknown>[])].sort((a, b) => {
        const ad = (a.date_in as string | null) ?? "9999-12-31";
        const bd = (b.date_in as string | null) ?? "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
        const ac = (a.created_at as string | null) ?? "";
        const bc = (b.created_at as string | null) ?? "";
        return ac < bc ? -1 : ac > bc ? 1 : 0;
      });
      for (const it of items) {
        // `order_lines.sku` and `ops_stock_items.sku` are two vocabularies —
        // the catalog code against the warehouse's own name. `stockMatchKey`
        // is the portal's ONE rule for linking them, already read by the
        // readiness badge and the drawer's picker.
        const key = stockMatchKey(it.sku as string);
        const qty = Math.max(1, Number(it.qty ?? 1));
        (freeStock[key] ??= []).push({ id: it.id as string, qty });
        stockQtyById.set(it.id as string, qty);
      }
    }
  } catch (e) {
    console.error("ready stock unavailable — no offer made", (e as Error).message);
  }
  return { stockWarehouse, freeStock, stockQtyById };
}

/**
 * Read live demand and project it. Shared by the GET and by the POST, so the
 * document that gets issued is built from the SAME computation the operator
 * reviewed — the client never posts rows back.
 */
async function loadToOrder(
  sb: ReturnType<typeof userClient>,
): Promise<{ ok: true; data: Loaded } | { ok: false; status: number; body: unknown }> {
  let settings;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "settings_unavailable",
        code: "settings_unavailable",
        message: (e as Error).message,
      },
    };
  }

  const { data: orderRows, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, status, delivery_date, delivery_date_tbd, placed_at, created_at, proceed_date",
    )
    .in("status", ["place", "proceed_order"]);
  if (orderErr) {
    const m = mapPgError(orderErr);
    return { ok: false, status: m.status, body: m.body };
  }
  const orders = orderRows ?? [];
  const orderById = new Map(orders.map((o) => [o.id as string, o]));
  const orderIds = orders.map((o) => o.id as string);

  if (orderIds.length === 0) {
    return {
      ok: true,
      data: {
        proposals: [],
        today: todayIso(),
        poDays: settings.poDays,
        unresolved: [],
        catalog: new Map(),
        settings,
        stockWarehouse: null,
        stockQtyById: new Map(),
      },
    };
  }

  const lines: Record<string, unknown>[] = [];
  for (const batch of chunk(orderIds)) {
    const { data, error } = await sb
      .from("order_lines")
      .select("id, order_id, sku, qty, attrs, excluded_from_plan, exclude_from_plan_until")
      .in("order_id", batch);
    if (error) {
      const m = mapPgError(error);
      return { ok: false, status: m.status, body: m.body };
    }
    lines.push(...((data ?? []) as Record<string, unknown>[]));
  }

  // Catalog facts. No FK exists on order_lines.sku, so this is a second query
  // by sku rather than an embed (product_skus → product_models IS a real FK).
  const cat = new Map<string, CatalogFact>();
  /**
   * ⚠ THE CATALOG IS READ WHOLE, AND `.in()` IS NEVER USED ON A SKU.
   *
   * `order_lines.sku` is free text, and 16 live demand lines carry a DOUBLE
   * QUOTE in the value — `Leg 4"`, `HK5531/28"(2 Seater + Lshape)/…`. PostgREST
   * wraps a value holding reserved characters in double quotes, so a value that
   * CONTAINS one breaks the filter it is put into and the server answers with
   * whatever it managed to parse.
   *
   * That is the whole story of this module's two worst days: seven customer
   * requirements on no purchase order (2026-07-30), then a guard reading the
   * short answer as an alarm and blocking every issue (2026-07-31). Chunking
   * did not help — the unparseable value is still inside one of the chunks.
   *
   * The catalog is 205 rows. Reading it whole costs nothing and removes the
   * class: no list to quote, no length to exceed, nothing to chunk. A SKU
   * absent from this map is then definitively not a product, so "does it
   * exist?" needs no second query.
   */
  const { data: skuRows, error: skuErr } = await sb
    .from("product_skus")
    .select(
      "sku, supplier_id, cost, variant, variant_kind, product_models!inner(category, name)",
    );
  if (skuErr) {
    const m = mapPgError(skuErr);
    return { ok: false, status: m.status, body: m.body };
  }
  for (const row of (skuRows ?? []) as Record<string, unknown>[]) {
    const pm = row.product_models as { category?: string | null; name?: string | null } | null;
    cat.set(row.sku as string, {
      supplierId: (row.supplier_id as string | null) ?? null,
      cost: row.cost != null ? Number(row.cost) : null,
      variant: (row.variant as string | null) ?? null,
      variantKind: (row.variant_kind as string | null) ?? null,
      category: (pm?.category as string | undefined) ?? undefined,
      modelName: (pm?.name as string | null) ?? null,
    });
  }

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return { ok: false, status: m.status, body: m.body };
  }

  const demand: ToOrderLine[] = [];
  const missingProductionDays: { supplierId: string; category: string }[] = [];
  const seenMissing = new Set<string>();
  /** Demand the catalog could not answer for. Never dropped in silence. */
  const unresolved: { sku: string; orderId: string; so: number | null }[] = [];
  /** P10 — a typed demand's own `issued_qty`, the ceiling on what the ledger
   *  may be read as having taken for it. */
  const issuedByLine = new Map<string, number>();

  for (const l of lines) {
    const c = cat.get(l.sku as string);

    // Not a catalog product — `Transport Fees`, `Leg 4"`, an AutoCount
    // description. 95 of them live here; never procurable, so nothing is said.
    // The map above is the WHOLE catalog, so this is a fact, not a failed read.
    if (!c) continue;

    const category = c.category;
    const supplierId = c.supplierId ?? null;

    // POSITIVE rule: only the three made-to-order categories reach this page.
    // Accessories are replenished against a reorder point; a guarantee or a
    // service is not goods. Filtering on the category rather than on "the SKU
    // happens to have no supplier" is what stops a pillow appearing here the
    // day somebody maps one.
    //
    // A SKU that resolved but carries no supplier is NOT silent either — it is
    // a real procurable item nobody has mapped, and the information model
    // (§6.3) forbids it disappearing.
    if (category && isToOrderCategory(category) && !supplierId) {
      unresolved.push({
        sku: l.sku as string,
        orderId: l.order_id as string,
        so: (orderById.get(l.order_id as string)?.so as number | null) ?? null,
      });
      continue;
    }
    if (!category || !isToOrderCategory(category) || !supplierId) continue;

    if ((l as { excluded_from_plan?: boolean }).excluded_from_plan === true) continue;
    const until = (l as { exclude_from_plan_until?: string | null }).exclude_from_plan_until;
    if (until && new Date(until) > new Date()) continue;

    const order = orderById.get(l.order_id as string);
    if (!order) continue;

    const leadDays = productionWorkingDaysFor(settings, supplierId, category as ProductCategory);
    if (leadDays == null) {
      const k = `${supplierId}::${category}`;
      if (!seenMissing.has(k)) {
        seenMissing.add(k);
        missingProductionDays.push({ supplierId, category });
      }
      continue;
    }

    const tbd = Boolean(order.delivery_date_tbd);
    const deadline = tbd ? null : ((order.delivery_date as string | null) ?? null);
    const placedAt = ((order.placed_at as string | null) ??
      (order.created_at as string | null) ??
      todayIso()) as string;
    const attrs = (l as { attrs?: unknown }).attrs;

    demand.push({
      lineId: l.id as string,
      orderId: l.order_id as string,
      sku: l.sku as string,
      category: category as ProductCategory,
      supplierId,
      qty: Number(l.qty ?? 0),
      deadline: deadline ? deadline.slice(0, 10) : null,
      leadDays,
      offDays: workWeekOffDaysFor(settings, supplierId),
      placedAt: placedAt.slice(0, 10),
      committed: order.status === "proceed_order",
      so: order.so != null ? Number(order.so) : null,
      customerName: (order.customer_name as string | null) ?? null,
      // P18 — Sales' planned production start. An ORDER fact, sliced to a bare
      // day like every other date on this wire. It is NOT gated on `tbd`: the
      // proceed date is a fact about the order whether or not the customer's own
      // date is agreed, and 0165's own CHECK already keeps it <= the delivery
      // date. A TBD order never reaches the grid anyway (the page skips a null
      // delivery), so nothing is shown that could contradict a blank date.
      proceedDate: ((order.proceed_date as string | null) ?? null)?.slice(0, 10) ?? null,
      modelName: c?.modelName ?? null,
      variant: c?.variant ?? null,
      variantKind: c?.variantKind ?? null,
      buildKey: attr(attrs, "sofa_build_key"),
      fabricName: attr(attrs, "fabric_name"),
      legHeight: attr(attrs, "leg_height"),
      itemHeight: attr(attrs, "sofa_height"),
      cost: c?.cost ?? null,
    });
  }

  /**
   * READY STOCK — demand a human typed (Jess, 2026-08-03).
   *
   * It joins the customer requirements as ordinary `ToOrderLine`s, which is
   * the whole ruling: *"ONE unified demand table. Customer Orders flow in,
   * Create Purchase flows in, ONE engine eats it, no second pipeline ever."*
   * So the order-by date, the supplier×category grouping and Issue all work on
   * it without knowing it came from a person rather than a customer.
   *
   * Its `orderId` is `demand:<uuid>` so it groups alone on the grid — a ready
   * stock buy has no customer to sit under — and so the issue path can map a
   * created purchase order back to the row that asked for it.
   *
   * OPEN MEANS "STILL SOMETHING TO BUY", AND THAT IS THE REMAINDER — not the
   * absence of a purchase order link (0320, Loo's 2026-08-04 ruling). A demand
   * for 5 whose ready stock covered 2 is a demand for 3 and must still be here;
   * reading `po_id is null` would have shown it as 5 or as nothing at all.
   * `remaining_qty` is generated in the database, so this number and the
   * counter behind it cannot disagree.
   */
  {
    const { data: demandRows, error: demandErr } = await sb
      .from("purchase_demands")
      .select(
        "id, purpose, sku, supplier_id, destination_id, qty, issued_qty, remaining_qty, required_by, remark",
      )
      .gt("remaining_qty", 0)
      .is("cancelled_at", null);
    /**
     * THIS READ MAY NEVER TAKE THE PAGE DOWN.
     *
     * To Order's job is turning CUSTOMER orders into purchase orders, and it
     * did that for months before typed demand existed. If `purchase_demands` is
     * absent — the window between deploying this code and applying 0319/0320,
     * a rebuilt environment, a half-applied migration — the FEATURE is
     * unavailable and the workspace is untouched. Returning an error here would
     * 500 the whole page over an optional read, which is a far worse failure
     * than the one it would be reporting.
     *
     * Fail CLOSED, not open: nothing is invented, the typed-demand list is
     * simply empty, and the WRITE door still answers a real, named error to
     * anyone who tries to create one — so the state is discoverable rather
     * than silent.
     */
    if (demandErr) {
      console.error("purchase_demands unavailable — typed demand omitted", demandErr.message);
    }
    const destName = new Map<string, string>();
    if (!demandErr && (demandRows ?? []).length > 0) {
      const { data: destRows } = await sb
        .from("purchasing_destinations")
        .select("id, name");
      for (const d of destRows ?? []) destName.set(d.id as string, (d.name as string) ?? "");
    }
    for (const d of (demandErr ? [] : (demandRows ?? [])) as Record<string, unknown>[]) {
      const c = cat.get(d.sku as string);
      const category = c?.category;
      const supplierId = (d.supplier_id as string | null) ?? c?.supplierId ?? null;
      // A demand whose SKU left the catalog, or whose pair has no production
      // time, is held out exactly as a customer line would be — never planned
      // on a guessed number.
      if (!category || !isToOrderCategory(category) || !supplierId) continue;
      const leadDays = productionWorkingDaysFor(
        settings,
        supplierId,
        category as ProductCategory,
      );
      if (leadDays == null) {
        const k = `${supplierId}::${category}`;
        if (!seenMissing.has(k)) {
          seenMissing.add(k);
          missingProductionDays.push({ supplierId, category });
        }
        continue;
      }
      const id = d.id as string;
      demand.push({
        lineId: `demand:${id}`,
        orderId: `demand:${id}`,
        sku: d.sku as string,
        category: category as ProductCategory,
        supplierId,
        // What is LEFT to buy, never what was originally asked for. The row is
        // only in this list because that number is above zero.
        qty: Number(d.remaining_qty ?? 0),
        deadline: (d.required_by as string | null) ?? null,
        leadDays,
        offDays: workWeekOffDaysFor(settings, supplierId),
        placedAt: todayIso(),
        committed: true,
        so: null,
        customerName: null,
        modelName: c?.modelName ?? null,
        variant: c?.variant ?? null,
        variantKind: c?.variantKind ?? null,
        buildKey: null,
        fabricName: null,
        legHeight: null,
        itemHeight: null,
        cost: c?.cost ?? null,
        readyStock: true,
        destinationName: destName.get(d.destination_id as string) ?? null,
      });
      issuedByLine.set(`demand:${id}`, Number(d.issued_qty ?? 0));
    }
  }

  // Supply: what open POs already cover. A line already on a PO has left this
  // workspace, so it must never appear as something still to buy.
  // Every OPEN purchase order line, unfiltered — same reason as the catalog: a
  // SKU may not go into an `.in()` list. Open POs are a small live slice.
  const openPoBySku: Record<string, number> = {};
  /**
   * T3 — the same supply, per DOCUMENT, so the grid can NAME what covers a
   * line rather than printing a bare number. `po_id` IS the PO number
   * (`purchase_orders.id` = `PO-2051`), so this costs one more column on a
   * query already being run — no second read, no migration.
   *
   * Sorted by PO number, and the ORDER IS THE CONTRACT: `buildToOrder` replays
   * the engine's draw over this list, so an unstable order would make one
   * refresh name a different purchase order for the same unit.
   */
  const openPoRefs: Record<string, { poId: string; qty: number }[]> = {};
  {
    const { data: poLines, error: poErr } = await sb
      .from("purchase_order_lines")
      .select("po_id, sku, qty, received_qty, purchase_orders!inner(status)")
      .eq("purchase_orders.status", "open");
    if (poErr) {
      const m = mapPgError(poErr);
      return { ok: false, status: m.status, body: m.body };
    }
    for (const r of poLines ?? []) {
      const remaining = Number(r.qty ?? 0) - Number(r.received_qty ?? 0);
      if (remaining <= 0) continue;
      const sku = r.sku as string;
      openPoBySku[sku] = (openPoBySku[sku] ?? 0) + remaining;
      const poId = (r.po_id as string | null) ?? null;
      if (poId) (openPoRefs[sku] ??= []).push({ poId, qty: remaining });
    }
    // One PO may hold two lines of one SKU — merge them, so a hover names a
    // document once and the pool it drains matches `openPoBySku` exactly.
    for (const [sku, refs] of Object.entries(openPoRefs)) {
      const merged = new Map<string, number>();
      for (const r of refs) merged.set(r.poId, (merged.get(r.poId) ?? 0) + r.qty);
      openPoRefs[sku] = [...merged]
        .map(([poId, qty]) => ({ poId, qty }))
        .sort((a, b) => (a.poId < b.poId ? -1 : a.poId > b.poId ? 1 : 0));
    }
  }

  /**
   * ── READY STOCK (card P10, Loo 2026-08-04) ────────────────────────────────
   *
   * The engine has computed how much a demand could take from free stock since
   * the day it was written, and it was switched off (`consumeFreeStock`) and
   * shown to nobody. Jess's 2026-07-21 ruling — goods are labelled per order,
   * so nothing auto-consumes them — is right and stays; what was missing is
   * that a decision reserved for a human never reached the human.
   *
   * TWO READS, and each answers a different question:
   *
   *   `ops_stock_items`      what is FREE right now — the offer.
   *   `ops_stock_pool_usage` what has already been TAKEN — why a quantity is
   *                          smaller than what was asked for.
   *
   * THE REGISTER, NOT `stock_balances`. They are two tables with no trigger
   * between them (measured 2026-08-04), and the pool draw moves the REGISTER.
   * A number read from the other one would not fall when a unit was taken, so
   * the same units would be offered again tomorrow. `purchase.ts`'s advisory
   * read still uses `stock_balances`; that is a different surface and is
   * reported, not changed here.
   *
   * THE LEDGER, NOT `status = 'reserved'`. A unit that is delivered becomes
   * `sold`, so a reservation-based reading would let a satisfied requirement
   * come BACK as something to buy the day the goods went out. The ledger is
   * permanent and dated, and its own comment says why: it counts the DECISION,
   * never net units.
   *
   * NEITHER READ MAY TAKE THE PAGE DOWN. To Order turned customer orders into
   * purchase orders for months before ready stock was on it; if either table
   * is unreachable the FEATURE is unavailable and the workspace is exactly
   * what it was — no offer, no netting, nothing invented.
   */
  const { stockWarehouse, freeStock, stockQtyById } = await readFreeStock(sb);

  /** `{ref}::{stockKey}` → units already drawn for it. */
  const takenByRefKey = new Map<string, number>();
  try {
    const { data: usageRows, error: usageErr } = await sb
      .from("ops_stock_pool_usage")
      .select("sku, qty, ref");
    if (usageErr) throw new Error(usageErr.message);
    for (const u of (usageRows ?? []) as Record<string, unknown>[]) {
      const ref = (u.ref as string | null) ?? "";
      if (!ref) continue;
      const k = `${ref}::${stockMatchKey(u.sku as string)}`;
      takenByRefKey.set(k, (takenByRefKey.get(k) ?? 0) + Math.max(0, Number(u.qty ?? 0)));
    }
  } catch (e) {
    console.error("ready stock ledger unavailable — takes not shown", (e as Error).message);
  }

  /**
   * Net what was taken out of what is still to buy, and carry the fact.
   *
   * The two row kinds net through DIFFERENT stores and that is not a smell —
   * they genuinely have different ones. A typed demand's remainder is
   * `remaining_qty`, GENERATED in the database (0320), so it is already net
   * and the ledger is read only to SAY so. A customer line has no counter, so
   * the ledger is the netting: a unit committed to `SO-1234` is a unit we do
   * not have to buy, whichever door committed it — the drawer's picker counts
   * exactly as this page's own button does, because it is the same act.
   */
  const budget = new Map(takenByRefKey);
  const planned: ToOrderLine[] = [];
  for (const l of demand) {
    const key = stockMatchKey(l.sku);
    l.stockKey = key;
    const ref = stockRefOf(l.readyStock, l.so, l.destinationName);
    if (ref) {
      const bk = `${ref}::${key}`;
      // A demand may never be read as having taken more than it has ISSUED,
      // and a customer line never more than it ORDERED — so an unrelated draw
      // sharing a reference cannot make a requirement disappear.
      const ceiling = l.readyStock ? (issuedByLine.get(l.lineId) ?? 0) : l.qty;
      const take = Math.max(0, Math.min(budget.get(bk) ?? 0, ceiling));
      if (take > 0) {
        budget.set(bk, (budget.get(bk) ?? 0) - take);
        l.takenFromStock = take;
        // A typed demand's `qty` IS `remaining_qty` and is already net.
        if (!l.readyStock) l.qty = Math.max(0, l.qty - take);
      }
    }
    // Nothing left to buy is not a row — the same rule an open purchase order
    // has always had.
    if (l.qty > 0) planned.push(l);
  }

  const today = todayIso();
  const proposals = buildToOrder({
    lines: planned,
    suppliers: (supRows ?? []).map((s) => ({
      id: s.id as string,
      name: (s.name as string) ?? "",
    })),
    supply: { openPoBySku },
    openPoRefs,
    freeStock,
    options: {
      today,
      holidays: myHolidaySet(),
      // The arrival buffer and the urgency buckets count on the OFFICE week —
      // arranging a delivery is office work (Law 2A). The supplier's own week
      // rides on each line's offDays.
      offDays: [0, 6],
      arrivalBufferDays: settings.orderByBufferDays,
      reviewDaysBySupplier: {},
    },
    missingProductionDays,
  });

  return {
    ok: true,
    data: {
      proposals,
      today,
      poDays: settings.poDays,
      unresolved,
      catalog: cat,
      settings,
      stockWarehouse,
      stockQtyById,
    },
  };
}

/** How far back the grid answers "what did we order". Older → Purchase Orders. */
const ORDERED_WINDOW_DAYS = 14;

/**
 * Rows that already became purchase orders — the grid's `Ordered` answer
 * (Jess, 2026-08-01: Today + PO filter `Ordered` = 今天已经下了哪些).
 *
 * RECENT ONLY, on purpose: real history belongs to Purchase Orders, so this
 * reads the last {@link ORDERED_WINDOW_DAYS} days and nothing more. A row is
 * one PO × one customer order; its lines are matched by SKU against the
 * customer's own order lines, so the quantity is what THAT customer ordered —
 * the same voice as a demand row. A PO with no SO refs (a manual purchase)
 * still gets one row: it was ordered, and ordered work must be answerable.
 *
 * Failures here degrade to an empty list rather than failing the page — the
 * demand half is the work; the ordered half is the receipt.
 */
async function loadOrderedRows(
  sb: ReturnType<typeof userClient>,
  today: string,
  catalog: Map<string, CatalogFact>,
  supplierNames: ReadonlyMap<string, string>,
): Promise<ToOrderOrderedRow[]> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - ORDERED_WINDOW_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: poRows, error: poErr } = await sb
    .from("purchase_orders")
    .select("id, supplier_id, placed_at, so_refs")
    .gte("placed_at", sinceIso)
    .order("placed_at", { ascending: false });
  if (poErr || !poRows || poRows.length === 0) return [];

  // The catalog arrives from loadToOrder — but its no-open-orders early
  // return carries an EMPTY map, and recent POs can outlive their orders.
  // Read it here in that one case, whole, same rule as loadToOrder (§: a SKU
  // never goes into an `.in()`).
  if (catalog.size === 0) {
    const { data: skuRows } = await sb
      .from("product_skus")
      .select("sku, supplier_id, cost, variant, variant_kind, product_models!inner(category, name)");
    for (const row of (skuRows ?? []) as Record<string, unknown>[]) {
      const pm = row.product_models as { category?: string | null; name?: string | null } | null;
      catalog.set(row.sku as string, {
        supplierId: (row.supplier_id as string | null) ?? null,
        cost: row.cost != null ? Number(row.cost) : null,
        variant: (row.variant as string | null) ?? null,
        variantKind: (row.variant_kind as string | null) ?? null,
        category: (pm?.category as string | undefined) ?? undefined,
        modelName: (pm?.name as string | null) ?? null,
      });
    }
  }

  const poIds = poRows.map((p) => p.id as string);
  const linesByPo = new Map<string, { sku: string; qty: number }[]>();
  for (const batch of chunk(poIds)) {
    const { data, error } = await sb
      .from("purchase_order_lines")
      .select("po_id, sku, qty")
      .in("po_id", batch);
    if (error) return [];
    for (const l of data ?? []) {
      const arr = linesByPo.get(l.po_id as string) ?? [];
      arr.push({ sku: l.sku as string, qty: Number(l.qty ?? 0) });
      linesByPo.set(l.po_id as string, arr);
    }
  }

  const soRefs = [...new Set(poRows.flatMap((p) => (p.so_refs as number[] | null) ?? []))];
  const orderBySo = new Map<number, Record<string, unknown>>();
  const orderLinesByOrder = new Map<string, { sku: string; qty: number; attrs: unknown }[]>();
  if (soRefs.length > 0) {
    for (const batch of chunk(soRefs)) {
      const { data, error } = await sb
        .from("orders")
        .select("id, so, customer_name, delivery_date, delivery_date_tbd, proceed_date")
        .in("so", batch);
      if (error) return [];
      for (const o of data ?? []) orderBySo.set(Number(o.so), o as Record<string, unknown>);
    }
    const orderIds = [...orderBySo.values()].map((o) => o.id as string);
    for (const batch of chunk(orderIds)) {
      const { data, error } = await sb
        .from("order_lines")
        .select("order_id, sku, qty, attrs")
        .in("order_id", batch);
      if (error) return [];
      for (const l of data ?? []) {
        const arr = orderLinesByOrder.get(l.order_id as string) ?? [];
        arr.push({ sku: l.sku as string, qty: Number(l.qty ?? 0), attrs: l.attrs });
        orderLinesByOrder.set(l.order_id as string, arr);
      }
    }
  }

  /** One build, one MODEL NAME — `2 items` is banned from the Model column
   *  (Jess, 2026-08-01), so ordered rows split exactly like demand rows. */
  const labelOf = (sku: string): string => {
    const f = catalog.get(sku);
    const size = f?.variantKind === "size" ? f.variant : null;
    return railItemLabel(f?.modelName ?? sku, size);
  };
  const categoryOf = (skus: readonly string[]): ProductCategory | null => {
    for (const s of skus) {
      const c = catalog.get(s)?.category;
      if (c && isToOrderCategory(c)) return c;
    }
    return null;
  };

  const rows: ToOrderOrderedRow[] = [];
  for (const po of poRows) {
    const poLines = linesByPo.get(po.id as string) ?? [];
    const poSkus = new Set(poLines.map((l) => l.sku));
    const refs = (po.so_refs as number[] | null) ?? [];
    const placedAt = ((po.placed_at as string | null) ?? today).slice(0, 10);
    const category = categoryOf([...poSkus]);
    if (!category) continue; // not this page's goods (accessory restock etc.)

    if (refs.length === 0) {
      // A manual PO: one row per LINE, each naming its model.
      for (const l of poLines) {
        rows.push({
          poId: po.id as string,
          placedAt,
          category,
          supplierId: (po.supplier_id as string | null) ?? "",
          supplierName: supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
          orderId: null,
          customer: null,
          so: null,
          delivery: null,
          // P18 — a manual purchase order has no customer order behind it, so
          // there is no planned production start to state. Null for the same
          // reason `so`, `customer` and `delivery` above are null.
          proceedDate: null,
          model: labelOf(l.sku),
          qty: l.qty,
        });
      }
      continue;
    }

    for (const so of refs) {
      const order = orderBySo.get(Number(so));
      const covered = order
        ? (orderLinesByOrder.get(order.id as string) ?? []).filter((l) => poSkus.has(l.sku))
        : [];
      const tbd = Boolean(order?.delivery_date_tbd);
      const base = {
        poId: po.id as string,
        placedAt,
        category,
        supplierId: (po.supplier_id as string | null) ?? "",
        supplierName: supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
        orderId: (order?.id as string | null) ?? null,
        customer: (order?.customer_name as string | null) ?? null,
        so: Number(so),
        delivery:
          !tbd && order?.delivery_date
            ? (order.delivery_date as string).slice(0, 10)
            : null,
        // P18 — the same order fact on the receipt row. Required, not tidy: an
        // order whose every line is bought has no demand rows left, so its group
        // is receipts alone and this is the only place the header could read it.
        proceedDate: ((order?.proceed_date as string | null) ?? null)?.slice(0, 10) ?? null,
      };
      if (covered.length === 0) {
        // Nothing matched — still one honest row per PO line.
        for (const l of poLines) rows.push({ ...base, model: labelOf(l.sku), qty: l.qty });
        continue;
      }
      // One row per BUILD — a sofa's modules collapse to one sofa; every
      // other line stands alone, exactly the demand grid's grouping.
      const byBuild = new Map<string, { sku: string; qty: number }[]>();
      for (const l of covered) {
        const k = attr(l.attrs, "sofa_build_key") ?? `line::${l.sku}`;
        const arr = byBuild.get(k) ?? [];
        arr.push({ sku: l.sku, qty: l.qty });
        byBuild.set(k, arr);
      }
      for (const members of byBuild.values()) {
        rows.push({
          ...base,
          model: labelOf(members[0]!.sku),
          qty:
            category === "sofa" ? 1 : members.reduce((sum, m) => sum + m.qty, 0),
        });
      }
    }
  }
  return rows;
}

toOrderRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

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

  // The factory names, read here rather than threaded out of loadToOrder: its
  // no-live-orders early return never reads `suppliers`, and an ordered row's
  // supplier is exactly the one that may have no demand today. 10 rows.
  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return c.json(m.body, m.status);
  }
  const supplierNames = new Map<string, string>(
    (supRows ?? []).map((s) => [s.id as string, (s.name as string) ?? ""]),
  );

  const ordered = await loadOrderedRows(sb, res.data.today, res.data.catalog, supplierNames);

  return c.json({
    today: res.data.today,
    poDays: res.data.poDays,
    proposals: res.data.proposals,
    unresolved: res.data.unresolved,
    ordered,
    // P10 — the warehouse the offer was counted at, by its own name. The page
    // states WHERE the stock is, and it may not invent the word `Klang`: a
    // second warehouse is a rename away, and a sentence naming the wrong shed
    // is worse than one naming none.
    stockWarehouse: res.data.stockWarehouse?.name ?? null,
    destinations: (destRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      isDefault: Boolean(d.is_default),
    })),
  });
});

/**
 * The issue contract.
 *
 * The client posts an ARRANGEMENT — which builds go on which document — and
 * nothing else. Quantities, SKUs and prices are never sent: the server reads
 * them from its own recomputation, so a browser cannot invent a line, change a
 * quantity or price a purchase order.
 */
const issueBody = z.object({
  supplierId: z.string().uuid(),
  category: z.string().min(1),
  destinationId: z.string().uuid(),
  purchaseOrders: z
    .array(
      z.object({
        key: z.string().min(1),
        include: z.boolean(),
        buildKeys: z.array(z.string().min(1)),
      }),
    )
    .min(1)
    .max(200),
});

toOrderRouter.post("/issue", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = issueBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { supplierId, category, destinationId, purchaseOrders } = parsed.data;

  // Recompute. The operator's screen is a view; what gets issued is built from
  // the server's own reading, so a stale tab cannot order last hour's demand.
  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  // A requirement the catalog could not answer for could belong to ANY supplier
  // — nothing about it is known, including whose it is. So it stops every
  // issue, not just this supplier's: a purchase order that quietly omits a
  // customer's goods is worse than one that was never raised, because from that
  // point on nothing downstream is looking for them.
  if (res.data.unresolved.length > 0) {
    return c.json(
      {
        error: "demand_unresolved",
        code: "demand_unresolved",
        message: `${res.data.unresolved.length} customer requirement(s) could not be read from the catalog. Nothing was issued.`,
        unresolved: res.data.unresolved,
      },
      409,
    );
  }

  const proposal = res.data.proposals.find(
    (p) => p.supplierId === supplierId && p.category === category,
  );
  if (!proposal || proposal.rows.length === 0) {
    return c.json({ error: "nothing_to_issue", code: "nothing_to_issue" }, 409);
  }
  if (proposal.blocked === "production_days") {
    return c.json(
      { error: "production_days_required", code: "production_days_required" },
      422,
    );
  }

  // THE GATE. Every rule is asked against the proposal the server just built,
  // never against what the client believes:
  //   · a build already on a purchase order is not in it, so naming one fails
  //   · a build belonging to another supplier or category is not in it either
  //   · the same build twice, an empty document, a merged sofa and a batch past
  //     the transaction's cap each have their own refusal
  //   · demand that changed or was cancelled since the page loaded is simply
  //     absent from the recomputation, and fails as `unknown_build`
  const docs: IssueDocument[] = purchaseOrders.map((d) => ({
    key: d.key,
    include: d.include,
    buildKeys: d.buildKeys,
  }));
  const check = validateIssuePlan(proposal, docs);
  if (!check.ok) {
    return c.json({ error: check.code, code: check.code, message: check.message }, 422);
  }

  const { data: dest, error: destErr } = await sb
    .from("purchasing_destinations")
    .select("id, name")
    .eq("id", destinationId)
    .eq("active", true)
    .maybeSingle();
  if (destErr) {
    const m = mapPgError(destErr);
    return c.json(m.body, m.status);
  }
  if (!dest) return c.json({ error: "unknown_destination", code: "invalid_param" }, 422);

  // Carres holds exactly one warehouse; AL and HOUZS are delivery ADDRESSES and
  // never warehouse records, which is why the destination is its own column.
  const { data: whRows, error: whErr } = await sb
    .from("warehouses")
    .select("id, name, kind")
    .eq("kind", "own");
  if (whErr) {
    const m = mapPgError(whErr);
    return c.json(m.body, m.status);
  }
  const warehouses = whRows ?? [];
  const warehouse =
    warehouses.find((w) => /klang|klg/i.test((w.name as string) ?? "")) ?? warehouses[0];
  if (!warehouse) {
    return c.json({ error: "no_warehouse", code: "no_warehouse" }, 500);
  }

  const plan = planFromDocuments(proposal, docs);

  // ONE transaction. `operation_create_pos_batch` is a single plpgsql function,
  // so a failure on the seventh document rolls the first six back — there is no
  // state where half an issue exists and nothing says so.
  const { data: batch, error: batchErr } = await sb.rpc("operation_create_pos_batch", {
    p_pos: plan.map((po) => ({
      supplier_id: po.supplierId,
      warehouse_id: warehouse.id as string,
      so_refs: po.soRefs,
      lines: po.lines.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        // The purchase price is resolved from the catalog and never shown here
        // (Loo, 2026-07-30: the supplier has an agreed rate). The RPC requires
        // one, so an unpriced SKU writes 0 rather than blocking the purchase.
        cost: l.cost ?? 0,
        cost_source: "catalog",
      })),
    })),
  });
  if (batchErr) {
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const ids = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  if (ids.length !== plan.length) {
    return c.json({ error: "po_not_created", code: "po_not_created" }, 500);
  }

  /**
   * THE PO'S BIRTH CERTIFICATE (Loo, 2026-08-03).
   *
   * A purchase order must be born carrying what the rest of the module reads.
   * `purchasing_record_tomorrow_delivery` (0306, shipped) refuses to open when
   * `eta_date` is NULL — so until this stamp existed, a built and deployed
   * supplier call could never fire on a PO raised here.
   *
   *   expected arrival = today
   *                    + production working days  (on the FACTORY's week)
   *                    + transit working days     (on the OFFICE week — moving
   *                                                goods is arranged by us)
   *
   * **THE ARITHMETIC ITSELF LIVES IN `expectedArrivalOf` AND NOWHERE ELSE**
   * (Loo, 2026-08-05). It was written a second time on the register, without
   * the transit leg, and the register therefore under-warned by exactly the day
   * it forgot on three live rows. This call and the register's now read the
   * same function; only `fromIso` differs, because a PO being born starts its
   * clock today and one already issued starts it at `placed_at`.
   *
   * It is stamped ONCE and then frozen: §2 — "a PO already sent is never
   * re-computed", because its dates were true when it was sent and moving them
   * would rewrite a promise the supplier already made.
   *
   * **AND IT IS OUR ESTIMATE, WHICH THE REGISTER NOW SAYS OUT LOUD.** Stamping
   * it here is deliberate and stays: 0306 refuses to open the tomorrow call on
   * a NULL arrival, so removing the stamp would take a shipped supplier call
   * dark. What was wrong was downstream — the register read *"a date exists"*
   * as *"the factory promised"*. Provenance now comes from
   * `po_supplier_promises`, so this stamp can be honest without being silent.
   *
   * `expected_ready_date` is deliberately NOT written here. That column is the
   * factory's PROMISE and R5 grades the factory by it; seeding it with our own
   * estimate would score a supplier on a number it never gave. Empty is not
   * missing data — it is the trigger of `Confirm ready date` (§3).
   *
   * A supplier with no transit number gets NO arrival rather than a guessed
   * one (P1's law), and the purchase order is still raised — the goods matter
   * more than the estimate, and the gap is visible as an empty arrival.
   */
  const etaDate = expectedArrivalOf(res.data.settings, {
    supplierId,
    category,
    fromIso: todayIso(),
  });

  // Where the goods go, in ONE statement over every document the batch made. A
  // fresh purchase order has received nothing, so the destination guard permits
  // it; it freezes on first receipt.
  const { error: upErr } = await sb
    .from("purchase_orders")
    .update({ destination_id: destinationId, ...(etaDate ? { eta_date: etaDate } : {}) })
    .in("id", ids);
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json({ ...(m.body as object), issued: ids }, m.status);
  }

  /**
   * A READY STOCK DEMAND THAT JUST BECAME A PURCHASE ORDER STOPS BEING DEMAND —
   * BY THE QUANTITY THAT WAS ORDERED, not all of it (0320, Loo 2026-08-04).
   *
   * The table carries no status column on purpose (Jess, 2026-08-01): open /
   * ordered / done are DERIVED. What the issue path owes a demand is the
   * NUMBER it took; without it the row sits on To Order for ever and gets
   * ordered twice.
   *
   * IT GOES THROUGH THE RPC, and that is 0316's rule applied to this table:
   * a quantity a client can PATCH is a quantity that moves with no arithmetic
   * and no guard. `purchasing_demand_record_issue` adds rather than sets (two
   * documents taking from one demand must add up), takes the row FOR UPDATE
   * (two operators pressing Issue in the same second queue instead of both
   * reading the same `issued_qty`), and refuses an over-issue by name — with
   * the table's own CHECK behind it in case a second door is ever written.
   *
   * The map is EXACT rather than by supplier: each document names the builds it
   * carried, and a build knows its `orderId`, which for a ready stock demand is
   * `demand:<uuid>`. So a demand is credited to the purchase order that
   * actually took it, never to "one of today's".
   */
  const buildRef = new Map(toOrderBuilds(proposal).map((b) => [b.buildKey, b]));
  const included = docs.filter((d) => d.include && d.buildKeys.length > 0);
  for (const [i, d] of included.entries()) {
    const poId = ids[i];
    if (!poId) continue;
    for (const k of d.buildKeys) {
      const ref = buildRef.get(k);
      const m = /^demand:(.+)$/.exec(ref?.orderId ?? "");
      if (!m) continue;
      const { error: stampErr } = await sb.rpc("purchasing_demand_record_issue", {
        p_id: m[1]!,
        p_qty: ref?.qty ?? 0,
        p_po_id: poId,
      });
      if (stampErr) {
        // The purchase orders exist and the supplier is about to be sent them.
        // Failing the whole issue now would destroy real work to protect a
        // number; the demand reappearing is visible and recoverable, and an
        // over-issue refusal is exactly the double-order this names out loud.
        console.error("purchase_demands issue record failed", m[1], stampErr.message);
      }
    }
  }

  /**
   * WHO RAISED IT. Measured 2026-08-01: `operation_create_pos_batch` writes no
   * audit row of any kind, so a purchase order could not say who issued it or
   * when. `po_history` has existed since 0001 for exactly this, so nothing new
   * is invented and no migration is needed.
   *
   * Best-effort ON PURPOSE: the purchase orders already exist and the supplier
   * is about to be sent them. Failing the whole issue because a history line
   * could not be written would destroy real work to protect a note about it.
   */
  await sb.from("po_history").insert(
    ids.map((id, i) => ({
      po_id: id,
      text: `Issued from To Order · ${plan[i]?.lines.length ?? 0} line(s)${
        etaDate ? ` · expected arrival ${etaDate}` : " · no expected arrival (transit days not set)"
      }`,
    })),
  );

  return c.json({
    supplier: proposal.supplierName,
    destination: dest.name as string,
    pos: ids.map((id, i) => ({ id, customer: plan[i]?.customer ?? proposal.supplierName })),
  });
});

/**
 * `Reserve` — ready stock is SUGGESTED; the human decides whether to reserve
 * it (card P10, Loo 2026-08-04; the word is P13's, same day — the goods do not
 * leave, they are LOCKED until delivery, and the order drawer's picker has
 * said `Reserve` for this act since 2026-06-30).
 *
 * THE ROUTE PATH STAYS `/take-stock`. It is a wire contract, not a word on a
 * screen, and renaming it would break a browser open across the deploy for
 * nothing. P13 rules the VOCABULARY the operator reads.
 *
 * THE BODY CARRIES NO QUANTITY, and that is his ruling 3 built as a contract
 * rather than as a screen rule: *"我要的就是有一个自动建议补货，不过我们可以
 * 手动选择要不要拉。"* The system suggests, the human accepts — so there is
 * nothing to type, nothing to mistype, and the REASON is recorded by
 * construction, because pressing this can mean exactly one thing.
 *
 * The server recomputes the whole workspace and reads the offer off its OWN
 * projection, so a stale tab cannot take stock against last hour's demand and
 * a browser cannot name a quantity, a SKU or a unit.
 */
const takeStockBody = z.object({
  orderId: z.string().min(1),
  buildKey: z.string().min(1),
});

toOrderRouter.post("/take-stock", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = takeStockBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  const { orderId, buildKey } = parsed.data;

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  let found: { row: ToOrderRow; build: ToOrderBuild } | null = null;
  for (const p of res.data.proposals) {
    for (const row of p.rows) {
      if (row.orderId !== orderId) continue;
      const build = row.builds.find((b) => b.key === buildKey);
      if (build) found = { row, build };
    }
  }
  // The row moved, was ordered, or was covered since the page loaded. Absent
  // from the recomputation IS the refusal — there is nothing to take.
  if (!found) return c.json({ error: "unknown_build", code: "unknown_build" }, 409);

  const { row, build } = found;
  if (build.freeStock <= 0 || build.freeStockItemIds.length === 0) {
    return c.json({ error: "no_free_stock", code: "no_free_stock" }, 409);
  }
  const ref = stockRefOf(row.readyStock, row.so, row.destination);
  if (!ref) {
    // A customer row with no SO cannot say what the unit is committed to, and
    // `ops_stock_pool_draw` refuses an empty reference by name. Refused here
    // rather than there, so the operator gets the reason and not a 500.
    return c.json({ error: "no_reference", code: "no_reference" }, 422);
  }

  /**
   * K4'S DOOR, and only K4's door (0292/0294). It makes the draw and its
   * reason ONE transaction, flips the unit to `reserved` under this reference,
   * writes the ledger row, the audit row and the order's own timeline. A
   * fourth door writing `ops_stock_items` its own way would be a second truth
   * about the same units.
   *
   * ONE CALL PER RECORD, because that is the door's shape — and it is what
   * makes *"taking twice cannot over-draw"* structural rather than hopeful:
   * each call claims its unit only `where status = 'free'`, so a unit somebody
   * else took a second ago comes back null and is simply not counted.
   */
  const note = readyStockDrawNote(build.title);
  let taken = 0;
  const drawn: string[] = [];
  for (const itemId of build.freeStockItemIds) {
    const { data, error } = await sb.rpc("ops_stock_pool_draw", {
      p_ref: ref,
      // P13 (0322) — K4's own sixth reason. P10 wrote `other` + a note because
      // the five had no row for *taken instead of buying it*; Loo added the
      // word on 2026-08-04, so the ledger now says it in its own vocabulary
      // and the monthly split stops reading as an unexplained `Other`.
      p_reason: READY_STOCK_DRAW_REASON,
      p_note: note,
      p_item_id: itemId,
      p_sku: null,
      p_condition: null,
      p_wh: null,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json({ ...(m.body as object), taken }, m.status);
    }
    if (!data) continue; // no longer free — somebody else got there first
    drawn.push(itemId);
    taken += res.data.stockQtyById.get(itemId) ?? 1;
  }

  if (taken === 0) {
    return c.json({ error: "no_free_stock", code: "no_free_stock" }, 409);
  }

  /**
   * A TYPED DEMAND'S REMAINDER FALLS THROUGH ITS OWN DOOR (0320).
   *
   * A customer line needs nothing here: the ledger row just written IS the
   * record, and the next read nets it. A typed demand carries a counter, and
   * `purchasing_demand_record_issue` is the only thing allowed to move it —
   * additive, `FOR UPDATE`, and refusing an over-issue by name.
   *
   * It runs AFTER the draw on purpose. If it fails, the units are reserved and
   * the demand still asks for them: we would buy too many, which is visible on
   * the next read and recoverable. The other order would have us buy too few,
   * and a customer short of goods is not recoverable by looking at a screen.
   */
  if (row.readyStock) {
    const m = /^demand:(.+)$/.exec(row.orderId);
    if (m) {
      const { error } = await sb.rpc("purchasing_demand_record_issue", {
        p_id: m[1]!,
        p_qty: taken,
        p_po_id: null,
      });
      if (error) {
        console.error("purchase_demands stock take not recorded", m[1], error.message);
        return c.json(
          {
            error: "demand_not_recorded",
            code: "demand_not_recorded",
            message: `${taken} unit(s) were reserved but the demand was not reduced.`,
            taken,
          },
          500,
        );
      }
    }
  }

  return c.json({ taken, reference: ref, items: drawn.length });
});

/**
 * `+ Create Purchase` — the manual entrance (Jess, 2026-08-03).
 *
 * V1 buys READY STOCK and nothing else. Display begins at the Dealer/Sales
 * portal as a Display Request and Office at a future internal request
 * workflow; both will reach purchasing through this same table, and neither
 * starts here — so neither appears in this body, and there is no disabled
 * option anywhere to suggest otherwise.
 *
 * THE PURPOSE IS SENT EXPLICITLY, not inferred from the absence of others
 * (her correction, same day). The CLIENT cannot choose it: it is written here,
 * so a browser can never file a demand as something else.
 *
 * THE SUPPLIER IS NOT IN THE BODY EITHER — the RPC derives it from the SKU. A
 * product has one factory, and a demand pointed at the wrong one becomes a
 * purchase order pointed at the wrong one.
 */
/**
 * `GET /demand/pick-items` — what the Create Purchase picker chooses from
 * (card P15, Loo 2026-08-04).
 *
 * **IT EXISTS BECAUSE THE STOCK NUMBERS CANNOT BE COMPUTED IN THE BROWSER.**
 * The card's Must-NOT is explicit — *"let the picker compute stock its own
 * way — read P10's rule"* — and P10's rule reads `ops_stock_items` at the own
 * warehouse through `stockMatchKey`. The dialog had only the catalog bundle,
 * which knows nothing about the register, so a browser-side count would have
 * been a second rule by construction. This route calls `readFreeStock`, the
 * literal function the grid's offer is built from.
 *
 * THREE NUMBERS, ONE READ, AND EACH MEANS SOMETHING DIFFERENT:
 *
 *   On Hand   every unit standing in the warehouse, whatever its condition —
 *             a damaged mattress is still in the building.
 *   Reserved  spoken for by an order. Context, never cover.
 *   Free      P10's own answer, unmodified: free · sound · at that warehouse.
 *
 * On live data today two of them agree (87 free, 0 reserved, measured
 * 2026-08-04) and that is honest rather than redundant — `Reserved 0` is the
 * fact that nothing is spoken for, and the three separate the day a
 * reservation exists.
 *
 * THE SUPPLIER RIDES ALONG AS A FACT. `purchasing_create_demand` derives it
 * from the SKU and there is no parameter to override it; this is the same
 * derivation shown a step earlier so an operator can predict which purchase
 * order their demand will join (the engine groups by supplier × category).
 *
 * A SKU WITH NO SUPPLIER IS NOT OFFERED. The RPC refuses it by name
 * (`sku_has_no_supplier`), and offering it teaches the operator that refusals
 * are random rather than a configuration hole.
 */
toOrderRouter.get("/demand/pick-items", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: skuRows, error: skuErr } = await sb
    .from("product_skus")
    .select("sku, variant, variant_kind, supplier_id, model_id")
    .not("supplier_id", "is", null);
  if (skuErr) {
    const m = mapPgError(skuErr);
    return c.json(m.body, m.status);
  }

  const { data: modelRows, error: modelErr } = await sb
    .from("product_models")
    .select("id, name");
  if (modelErr) {
    const m = mapPgError(modelErr);
    return c.json(m.body, m.status);
  }
  const modelName = new Map(
    (modelRows ?? []).map((m) => [m.id as string, (m.name as string) ?? ""]),
  );

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return c.json(m.body, m.status);
  }
  const supplierName = new Map(
    (supRows ?? []).map((s) => [s.id as string, (s.name as string) ?? ""]),
  );

  // P10's rule, called rather than copied.
  const { stockWarehouse, freeStock } = await readFreeStock(sb);

  /** On Hand and Reserved — the register's other two questions, one query. */
  const onHandByKey = new Map<string, number>();
  const reservedByKey = new Map<string, number>();
  if (stockWarehouse) {
    try {
      const { data: rows, error } = await sb
        .from("ops_stock_items")
        .select("sku, qty, status")
        // `free` and `reserved` are the two statuses that mean the unit is
        // HERE. `incoming` is on its way and is not on hand; `sold`,
        // `transferred`, `voided`, `returned_to_supplier` and `written_off`
        // have left. `on_hold` IS here — R4 quarantines it in the building —
        // so it counts as On Hand and, correctly, never as Free.
        .in("status", ["free", "reserved", "on_hold"])
        .eq("warehouse_id", stockWarehouse.id);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const key = stockMatchKey(r.sku as string);
        const qty = Math.max(1, Number(r.qty ?? 1));
        onHandByKey.set(key, (onHandByKey.get(key) ?? 0) + qty);
        if (r.status === "reserved") {
          reservedByKey.set(key, (reservedByKey.get(key) ?? 0) + qty);
        }
      }
    } catch (e) {
      // Same contract as `readFreeStock`: the picker degrades to zeroes rather
      // than taking the dialog down. A demand can always be typed.
      console.error("stock counts unavailable — picker shows none", (e as Error).message);
    }
  }

  const items: DemandPickItem[] = (skuRows ?? []).map((s) => {
    const sku = s.sku as string;
    const key = stockMatchKey(sku);
    return {
      sku,
      label: railItemLabel(
        modelName.get(s.model_id as string) ?? sku,
        s.variant_kind === "size" ? ((s.variant as string) ?? null) : null,
      ),
      supplier: supplierName.get(s.supplier_id as string) ?? null,
      onHand: onHandByKey.get(key) ?? 0,
      reserved: reservedByKey.get(key) ?? 0,
      free: (freeStock[key] ?? []).reduce((n, r) => n + r.qty, 0),
    };
  });
  items.sort((a, b) => a.sku.localeCompare(b.sku));

  return c.json({ items, stockWarehouse: stockWarehouse?.name ?? null });
});

const demandBody = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1),
  destinationId: z.string().uuid(),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  remark: z.string().max(500).nullish(),
  /**
   * P15 — the Source. **The enum is the SHARED constant, not a list retyped
   * here**: `DEMAND_PURPOSES` mirrors `purchase_demands.purpose`'s CHECK and
   * `purchasing_create_demand`'s own gate, so the picker, this validator and
   * the database cannot come to hold three different lists — which is exactly
   * what 0322 had to repair on the pool's reasons.
   *
   * OPTIONAL, and that is a compatibility decision rather than an oversight: a
   * browser still holding the pre-P15 bundle posts no `purpose`, and it must
   * keep working. It falls to `ready_stock` — the RPC's own default, and the
   * only value that browser could ever have meant.
   *
   * THERE IS NO `supplier` KEY AND THERE MAY NEVER BE ONE. The supplier is
   * derived from the SKU inside the RPC; the dialog SHOWS it as a fact. A
   * client that could name it is a client that could name the wrong factory.
   */
  purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]).optional(),
});

toOrderRouter.post("/demand", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = demandBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { sku, qty, destinationId, requiredBy, remark, purpose } = parsed.data;

  const { data, error } = await sb.rpc("purchasing_create_demand", {
    p_sku: sku,
    p_qty: qty,
    p_destination_id: destinationId,
    p_required_by: requiredBy ?? null,
    p_remark: remark ?? null,
    p_purpose: purpose ?? DEMAND_PURPOSE_DEFAULT,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});

/**
 * `Cancel` on a demand row — and on the REMAINDER of a part-ordered one
 * (Loo, 2026-08-04, card P12).
 *
 * IT SHIPS WITH ITS BUTTON, in the same card, because C1 deleted a live route
 * whose only caller had gone: *a route with no caller is a bypass one curl
 * away.* The inverse is the same fault — a button with no door is a lie.
 *
 * NO QUANTITY IS IN THE BODY, and that is the design rather than an omission.
 * A cancel takes the whole remainder or it is not a cancel, and `remaining_qty`
 * is GENERATED in the database (0320), so the number nobody typed is also a
 * number nobody can get wrong. What the RPC answers with — `cancelled` — is
 * read back off the row, so the figure the operator is told is the figure the
 * record now holds.
 *
 * `issued_qty` and `po_id` are untouched by the door: what was already ordered
 * keeps its purchase order, and stopping THAT is the purchase order's own
 * business (`PURCHASING-WORKING-FLOW.md` §9).
 *
 * There is no DELETE route here and there may never be one. Cancel keeps the
 * record; test rubbish is cleaned by SQL on request and the database starts
 * clean at go-live, so nothing is owed. A delete built for testing survives
 * into production as a way to erase a real purchase record leaving no trace.
 */
const cancelDemandBody = z.object({
  // Mandatory, and refused in three places rather than one: here, in the RPC by
  // name (`reason_required`), and by the table's own `cancel_pair` CHECK. A
  // cancellation without a reason is half a record.
  reason: z.string().trim().min(1).max(500),
});

toOrderRouter.post("/demand/:id/cancel", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = cancelDemandBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }

  const { data, error } = await sb.rpc("purchasing_cancel_demand", {
    p_id: id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    // `already_cancelled` and `nothing_to_cancel` arrive as P0001 and reach the
    // page as their own named codes — an operator meeting one must be told
    // which of the two happened, not that something went wrong.
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});

export default toOrderRouter;
