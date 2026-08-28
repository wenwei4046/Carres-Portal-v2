import {
  buildToOrder,
  isToOrderCategory,
  myHolidaySet,
  productionWorkingDaysFor,
  readyStockRef,
  stockMatchKey,
  workWeekOffDaysFor,
  type ProductCategory,
  type ToOrderLine,
  type ToOrderProposal,
} from "@carres/shared";
import { loadPurchasingSettings } from "./purchasing-settings";
import { mapPgError } from "./route-helpers";
import { userClient } from "./supabase";

/**
 * THE CUSTOMER-DEMAND READ — one recomputation, two Purchasing surfaces.
 *
 * `SO Batch Purchase` (`routes/operation/to-order.ts`) and the
 * `Purchase Demands` Register (`routes/operation/purchase-demands.ts`) answer
 * two different questions about the SAME facts:
 *
 *   SO Batch Purchase   what can I ISSUE today, and to whom
 *   Purchase Demands    what needs buying, what covers it, what must be fixed
 *
 * **Both read this file and nothing else.** The engine assembly, the catalog
 * read, the ready-stock offer, the open-PO cover and the netting all live here
 * once, so the two pages cannot print two different answers for one SKU
 * (`docs/ERP-ARCHITECTURE.md` Law D — a derived fact has ONE arithmetic).
 *
 * The extraction changed NOT ONE LINE of the arithmetic. What it added is
 * {@link Loaded.registerFacts}: the demand lines this engine REFUSES, each
 * carrying enough facts to be NAMED on screen. `loadToOrder` has always thrown
 * those away — a sold SKU absent from the catalog simply vanished — and a
 * Register whose whole job is *why can this not be bought* cannot be built on
 * a read that answers by dropping the row (CARD-2026-08-20-purchase-demands).
 *
 * Nothing here writes. Nothing here holds a status. The state of every demand
 * is recomputed from live Sales Order, Catalog, Stock, open-PO and Purchasing
 * Settings facts on every read.
 *
 * userClient / RLS is the security boundary throughout — never service_role.
 */

export function todayIso(): string {
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

export function chunk<T>(xs: readonly T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Is this line deliberately OUT of the plan?
 *
 * The engine applies exactly this test partway down its loop, and the Register
 * needs the same answer EARLIER — before the catalog has classified the line —
 * so it is spelt here once. The engine's own call site is untouched: moving it
 * would change which lines reach `unresolved`, and that is the To Order wire.
 */
function registerExcluded(l: Record<string, unknown>): boolean {
  if ((l as { excluded_from_plan?: boolean }).excluded_from_plan === true) return true;
  const until = (l as { exclude_from_plan_until?: string | null }).exclude_from_plan_until;
  return Boolean(until && new Date(until) > new Date());
}

/** `attrs` is jsonb; read one string field defensively. */
export function attr(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const v = (attrs as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export type Unresolved = { sku: string; orderId: string; so: number | null };

export type CatalogFact = {
  supplierId: string | null;
  cost: number | null;
  variant: string | null;
  variantKind: string | null;
  category: string | undefined;
  modelName: string | null;
};

/**
 * CARD-2026-08-20-purchase-demands — a customer demand line the engine could
 * not carry into a proposal, WITH the facts needed to name it on screen.
 *
 * `loadToOrder` refuses these lines for four different reasons and, until this
 * card, dropped every one of them. That is correct for a workspace whose job is
 * to ISSUE (an unbuyable line has no document), and wrong for a Register whose
 * job is to EXPLAIN — `Purchase Demands` exists to say *why can this not be
 * bought*, and a row that is not there says nothing.
 *
 * These are FACTS, not a second projection: each is pushed at the exact point
 * the engine already decided, in the same pass, from the same values. Nothing
 * is recomputed and no arithmetic is duplicated.
 */
export type RegisterRefusal =
  /** No such SKU in the catalog at all. Catalog is the only authority able to
   *  decide what a sold SKU is, so it is NAMED rather than assumed to be a fee,
   *  a service or a typo. */
  | "no_sku"
  /** A real procurable product nobody has mapped a supplier to. */
  | "no_supplier"
  /** This supplier × category pair has no production days in Settings. */
  | "no_production_days"
  /** Every unit was already drawn from ready stock, so nothing is left to buy.
   *  The engine drops such a line; the Register states it as covered. */
  | "covered_by_stock";

export interface RegisterDemandLine {
  refusal: RegisterRefusal;
  lineId: string;
  orderId: string;
  sku: string;
  /** What the customer ordered on this line. */
  qty: number;
  /** Catalog facts, where the catalog had any. */
  modelName: string | null;
  variant: string | null;
  variantKind: string | null;
  category: string | null;
  supplierId: string | null;
  /** Units already committed out of ready stock (`covered_by_stock` only). */
  takenFromStock: number;
}

/** The customer order behind a refused line — read once, off the same rows. */
export interface RegisterOrderFact {
  so: number | null;
  customer: string | null;
  /** The customer's promised day. `null` when TBD or never set. */
  delivery: string | null;
  /** Who owns the customer conversation (`orders.salesperson_id`). */
  salespersonId: string | null;
  /** Card 02-B — `place` is not proceeded, and the order Register must know. */
  status: string | null;
  /** The day Sales pressed Proceed and Operations received the order. */
  proceedDate: string | null;
  /** The customer's delivery locality, for the shared concise formatting. */
  city: string | null;
  state: string | null;
}

/**
 * Card 02-B — ONE record per PROCURABLE customer demand line, whatever its
 * blocker or coverage, in SKU units throughout.
 *
 * The order Register's Status compares *what genuinely requires purchasing*
 * against the confirmed-sent PO lineage, and neither the carried builds nor
 * the refusals alone can answer it: a build's numbers change UNIT on a
 * modular set, a covered line leaves the leaf rows entirely, and the lineage
 * speaks order lines. These facts are pushed in the SAME pass the engine
 * already runs — `qty` is the customer's original line quantity and
 * `stockTaken` the pool ledger's own draw, recomposed from the very values
 * the netting just produced (net + taken), never a second arithmetic.
 *
 * A `no_sku` line is deliberately ABSENT: Catalog has not established it as
 * goods, so it may not hold a Sales Order's Status open forever.
 */
export interface SoRegisterLineFact {
  lineId: string;
  orderId: string;
  sku: string;
  /** What the customer ordered on this line, SKU units. */
  qty: number;
  /** Units already committed out of ready stock for this line. */
  stockTaken: number;
  modelName: string | null;
  variant: string | null;
  category: string | null;
  supplierId: string | null;
}

export interface RegisterFacts {
  lines: RegisterDemandLine[];
  ordersById: Map<string, RegisterOrderFact>;
  /** Card 02-B — every procurable customer demand line, coverage included. */
  soLines: SoRegisterLineFact[];
}

export type Loaded = {
  proposals: ToOrderProposal[];
  today: string;
  /** Settings' PO Days — the rail's purchase calendar runs on it. */
  poDays: readonly number[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved: Unresolved[];
  /** Existing production-days refusal, retained for an explanatory SO lens. */
  blocked: Unresolved[];
  /** The whole catalog, read once — the ordered read reuses it. */
  catalog: Map<string, CatalogFact>;
  supplierKinds: Map<string, "own_logistics" | "factory_pickup">;
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
  /** Every supplier's own name, off the same read the kinds come from. */
  supplierNames: Map<string, string>;
  /**
   * The Register's own facts. ADDITIVE — no existing caller reads them, and the
   * To Order response is byte-identical with or without them.
   */
  registerFacts: RegisterFacts;
};

/**
 * P10 — the ONE reference a drawn unit is committed to, for a row of this
 * grid. Server-side, so a browser can never name someone else's order.
 */
export function stockRefOf(
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
export async function readFreeStock(sb: ReturnType<typeof userClient>): Promise<{
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
export async function loadToOrder(
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
      // `salesperson_id` is the Register's owner rule for a missing customer
      // date (card §4); it is read here rather than in a second query because
      // the row is already being fetched. Nothing in the To Order projection
      // reads it, so the workspace response is unchanged.
      // `customer_address_city/state` are Card 02-B's Delivery Location facts,
      // read here because the row is already being fetched — the To Order
      // projection ignores them, so the workspace response is unchanged.
      "id, so, customer_name, status, delivery_date, delivery_date_tbd, placed_at, created_at, proceed_date, salesperson_id, customer_address_city, customer_address_state",
    )
    /**
     * ⭐ THE PROCEEDED-ORDER BOUNDARY (Card 02-C, RESOLVED FROM AUTHORITY,
     * 2026-08-27). A Sales Order enters SO Batch Purchase only after Sales
     * completes `Proceed` — a `place` order is INVISIBLE to Purchasing: no
     * planning, no netting, no rail count, no Register row, no selection, no
     * Ready Stock take and no PO. Filtering it HERE — before the engine ever
     * sees a line — is what makes that one boundary: a `place` order cannot
     * consume Open PO coverage ahead of a proceeded one, and both write doors
     * (`take-stock`, `issue-batch`) recompute through this read at POST time,
     * so a demand id naming a `place` order resolves to nothing and is refused
     * by name. Until 2026-08-27 this read admitted `place` too, which let the
     * rail count orders Purchasing could not legitimately buy.
     */
    .eq("status", "proceed_order");
  if (orderErr) {
    const m = mapPgError(orderErr);
    return { ok: false, status: m.status, body: m.body };
  }
  /* The same rule enforced in code: the SQL narrows production, and this line
     keeps the boundary true under any permissive read (a test double that
     ignores filters must not be able to smuggle a `place` order in). */
  const orders = (orderRows ?? []).filter((o) => o.status === "proceed_order");
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
        blocked: [],
        catalog: new Map(),
        supplierKinds: new Map(),
        settings,
        stockWarehouse: null,
        stockQtyById: new Map(),
        supplierNames: new Map(),
        registerFacts: { lines: [], ordersById: new Map(), soLines: [] },
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

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name, kind");
  if (supErr) {
    const m = mapPgError(supErr);
    return { ok: false, status: m.status, body: m.body };
  }

  const demand: ToOrderLine[] = [];
  const missingProductionDays: { supplierId: string; category: string }[] = [];
  const seenMissing = new Set<string>();
  /** Demand the catalog could not answer for. Never dropped in silence. */
  const unresolved: { sku: string; orderId: string; so: number | null }[] = [];
  /** Existing engine refusal: this supplier × category has no production days. */
  const blocked: { sku: string; orderId: string; so: number | null }[] = [];
  /**
   * CARD-2026-08-20 — the SAME refusals, with the facts a Register row needs.
   * `unresolved` and `blocked` above are the To Order wire and are frozen at
   * three fields; widening them would change that response, so the Register's
   * richer facts travel beside them instead of inside them.
   */
  const registerLines: RegisterDemandLine[] = [];
  const registerOrders = new Map<string, RegisterOrderFact>();
  for (const o of orders) {
    registerOrders.set(o.id as string, {
      so: o.so != null ? Number(o.so) : null,
      customer: (o.customer_name as string | null) ?? null,
      delivery: o.delivery_date_tbd
        ? null
        : (((o.delivery_date as string | null) ?? null)?.slice(0, 10) ?? null),
      salespersonId: (o.salesperson_id as string | null) ?? null,
      status: (o.status as string | null) ?? null,
      proceedDate: ((o.proceed_date as string | null) ?? null)?.slice(0, 10) ?? null,
      city: (o.customer_address_city as string | null) ?? null,
      state: (o.customer_address_state as string | null) ?? null,
    });
  }
  /** Card 02-B — the procurable-line facts the order Register's Status runs on. */
  const soLines: SoRegisterLineFact[] = [];
  /** P10 — a typed demand's own `issued_qty`, the ceiling on what the ledger
   *  may be read as having taken for it. */
  const issuedByLine = new Map<string, number>();

  for (const l of lines) {
    const c = cat.get(l.sku as string);

    /**
     * Not a catalog product — `Transport Fees`, `Leg 4"`, an AutoCount
     * description. The map above is the WHOLE catalog, so this is a fact, not a
     * failed read.
     *
     * **To Order still says nothing about it** — there is no supplier, no
     * category and therefore no document to issue, so the workspace behaves
     * exactly as it always has.
     *
     * **The Register NAMES it** (card §3): a sold SKU absent from the catalog is
     * not silently assumed to be a fee or a service, because the catalog is the
     * only authority able to decide what it is. An excluded line is still
     * excluded — the operator took it out of the plan deliberately.
     */
    if (!c) {
      if (!registerExcluded(l)) {
        registerLines.push({
          refusal: "no_sku",
          lineId: l.id as string,
          orderId: l.order_id as string,
          sku: l.sku as string,
          qty: Number(l.qty ?? 0),
          modelName: null,
          variant: null,
          variantKind: null,
          category: null,
          supplierId: null,
          takenFromStock: 0,
        });
      }
      continue;
    }

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
      if (!registerExcluded(l)) {
        registerLines.push({
          refusal: "no_supplier",
          lineId: l.id as string,
          orderId: l.order_id as string,
          sku: l.sku as string,
          qty: Number(l.qty ?? 0),
          modelName: c.modelName,
          variant: c.variant,
          variantKind: c.variantKind,
          category,
          supplierId: null,
          takenFromStock: 0,
        });
        // A supplier-less line still genuinely requires purchasing — it holds
        // its Sales Order's Status open (Card 02-B).
        soLines.push({
          lineId: l.id as string,
          orderId: l.order_id as string,
          sku: l.sku as string,
          qty: Number(l.qty ?? 0),
          stockTaken: 0,
          modelName: c.modelName,
          variant: c.variant,
          category,
          supplierId: null,
        });
      }
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
      blocked.push({
        sku: l.sku as string,
        orderId: l.order_id as string,
        so: order.so != null ? Number(order.so) : null,
      });
      registerLines.push({
        refusal: "no_production_days",
        lineId: l.id as string,
        orderId: l.order_id as string,
        sku: l.sku as string,
        qty: Number(l.qty ?? 0),
        modelName: c.modelName,
        variant: c.variant,
        variantKind: c.variantKind,
        category,
        supplierId,
        takenFromStock: 0,
      });
      soLines.push({
        lineId: l.id as string,
        orderId: l.order_id as string,
        sku: l.sku as string,
        qty: Number(l.qty ?? 0),
        stockTaken: 0,
        modelName: c.modelName,
        variant: c.variant,
        category,
        supplierId,
      });
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
   * TYPED DEMAND LEFT THIS GRID (CARD-2026-08-18-manual-purchase §1,
   * executed with the issue slice so nothing was ever unissuable).
   *
   * 0319's "ONE unified demand table" ruling still holds for the STORE —
   * both lanes keep their demand in `purchase_demands` — but the 2026-08-18
   * ruling split the SURFACES: this grid answers ONE question, *what have
   * customers ordered that we still have to buy*, and the Manual Purchase
   * page answers the other. Two lanes, two Issue buttons, and a PO that can
   * always say which lane bore it (0361's `purpose` + `demand_id`).
   */

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
    //
    // CARD-2026-08-20: it is not nothing to the REGISTER. A requirement whose
    // every unit was already drawn from ready stock is COVERED, and a page that
    // answers *what needs buying* has to be able to say so — otherwise the
    // customer's order looks like it was never demanded at all.
    if (l.qty > 0) planned.push(l);
    else
      registerLines.push({
        refusal: "covered_by_stock",
        lineId: l.lineId,
        orderId: l.orderId,
        sku: l.sku,
        qty: l.takenFromStock ?? 0,
        modelName: l.modelName,
        variant: l.variant,
        variantKind: l.variantKind,
        category: l.category,
        supplierId: l.supplierId,
        takenFromStock: l.takenFromStock ?? 0,
      });
    /* Card 02-B — the SAME line, recomposed from the values the netting just
       produced: the customer's original quantity is the net remainder plus the
       units the ledger drew. Recorded for EVERY carried line, covered ones
       included — a Sales Order the stock fully covers must still be able to
       explain itself on the permanent Register. */
    if (!l.readyStock) {
      soLines.push({
        lineId: l.lineId,
        orderId: l.orderId,
        sku: l.sku,
        qty: l.qty + (l.takenFromStock ?? 0),
        stockTaken: l.takenFromStock ?? 0,
        modelName: l.modelName,
        variant: l.variant,
        category: l.category,
        supplierId: l.supplierId,
      });
    }
  }

  const today = todayIso();
  const supplierKinds = new Map<string, "own_logistics" | "factory_pickup">(
    (supRows ?? []).map((s) => [
      s.id as string,
      s.kind as "own_logistics" | "factory_pickup",
    ]),
  );
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
  }).map((proposal) => ({
    ...proposal,
    supplierKind: supplierKinds.get(proposal.supplierId) ?? "own_logistics",
  }));

  return {
    ok: true,
    data: {
      proposals,
      today,
      poDays: settings.poDays,
      unresolved,
      blocked,
      catalog: cat,
      supplierKinds,
      settings,
      stockWarehouse,
      stockQtyById,
      supplierNames: new Map(
        (supRows ?? []).map((s) => [s.id as string, (s.name as string) ?? ""]),
      ),
      registerFacts: { lines: registerLines, ordersById: registerOrders, soLines },
    },
  };
}