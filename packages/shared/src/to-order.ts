/**
 * To Order — the Planning Workspace projection.
 *
 * ONE pure module turns raw customer demand into what the Review Grid shows and
 * what `Issue Purchase Order` writes. It stores nothing: a proposal is computed
 * on every read, which is why it has no status, no hold, no audit and no
 * lifecycle of its own (Loo, 2026-07-30 — *"Proposal is not a business object.
 * It is a computed view. Only Purchase Order is a real business object."*).
 *
 * What lives here, and why here:
 *
 *  · **Stock Ready** is READ from the net-requirements engine's `arriveBy`.
 *    There is deliberately no second date calculation in this file — the whole
 *    formula (`customer delivery − arrival buffer − production days`) already
 *    lives in `net-requirements.ts` and runs on `subtractWorkingDays()`.
 *
 *  · **The PO boundary.** A sofa is one purchase order per CUSTOMER ORDER;
 *    every other category merges the supplier's whole demand into one. So the
 *    grid's row count and the button's PO count are the same number for sofa
 *    and deliberately differ for the rest — and both are computed here, once.
 *
 *  · **Qty is a business unit, never a database unit.** A three-module sofa is
 *    ONE sofa. The database holds three `order_lines` at qty 1; the operator and
 *    the factory both count sofas. Modules only surface when a row is expanded.
 *
 *  · **Summary is capped at three tokens** — model, quantity, and at most ONE
 *    specification, chosen by a frozen priority. A default never prints.
 *
 * Not here, on purpose: price (it is resolved server-side and never shown),
 * addresses, review status, and anything that would need a stored marker.
 */

import type { ProductCategory } from "./db-types";
import {
  computeNetRequirements,
  type BundleRequirement,
  type DemandLine,
  type NetRequirementsOptions,
  type NetRequirementsSupply,
} from "./net-requirements";
import type { IsoDate } from "./working-days";

// ── The words ───────────────────────────────────────────────────────────────

/**
 * Every fixed string To Order shows. A word that is not here has not been
 * ruled, and inventing one on a screen is the failure this module exists to
 * make impossible (COPY-STANDARD is the canonical home; this is its mirror).
 *
 * Dynamic text — counts, dates, a supplier's own name, a specification read
 * out of the catalog — is composed from these and from live values.
 */
export const TO_ORDER_WORDS = {
  searchPlaceholder: "Search…",
  searchLabel: "Search supplier, customer or SO",
  filterLabel: "Filter",

  colCustomer: "Customer",
  colSo: "SO",
  colQty: "Qty",
  colSummary: "Summary",
  colStockReady: "Stock ready",
  stockReadyHelp: "Required stock ready date before customer delivery.",

  noDeliveryDate: "No delivery date",

  destination: "Destination",
  issue: "Issue Purchase Order",

  productionDaysRequired: "Production Days Required",
  productionDaysHelp: "Set production days in Settings.",

  nextStep: "Next: confirm the ready date in Purchase Orders",
  openPurchaseOrders: "Open Purchase Orders",

  empty: "No purchase orders to issue.",
} as const;

/** `1 Purchase Order` / `7 Purchase Orders` — the sidebar and the button. */
export function purchaseOrderCount(n: number): string {
  return `${n} Purchase Order${n === 1 ? "" : "s"}`;
}

/** `{N} purchase orders issued to {supplier}` — the success line. */
export function issuedHeadline(n: number, supplier: string): string {
  return `${n} purchase order${n === 1 ? "" : "s"} issued to ${supplier}`;
}

// ── Business units ──────────────────────────────────────────────────────────

/**
 * What one of a thing is CALLED when an operator counts it. A sofa build made
 * of four modules is one sofa; a mattress line of qty 2 is two mattresses.
 */
const UNIT: Record<string, { one: string; many: string }> = {
  sofa: { one: "Sofa", many: "Sofas" },
  bedframe: { one: "Bedframe", many: "Bedframes" },
  mattress: { one: "Mattress", many: "Mattresses" },
};

export function unitLabel(category: string, n: number): string {
  const u = UNIT[category];
  if (!u) return n === 1 ? "item" : "items";
  return n === 1 ? u.one : u.many;
}

/**
 * The categories To Order reads. Everything else is bought a different way and
 * has no business being on a page whose unit is one customer order:
 * accessories are replenished against a reorder point, and a guarantee or a
 * service is not goods at all.
 *
 * This is a POSITIVE rule on purpose. The engine used to drop those rows only
 * because their SKU happened to resolve to no supplier — an accident, one
 * `update product_skus` away from putting pillows on this page.
 */
export const TO_ORDER_CATEGORIES: readonly ProductCategory[] = [
  "mattress",
  "bedframe",
  "sofa",
];

export function isToOrderCategory(c: string): c is ProductCategory {
  return (TO_ORDER_CATEGORIES as readonly string[]).includes(c);
}

/**
 * Sofa is one purchase order per customer order — fabric, size and
 * configuration make a merged sofa PO dangerous. Every other category merges
 * the supplier's whole demand into ONE document.
 */
export function isOnePoPerOrder(category: string): boolean {
  return category === "sofa";
}

// ── Inputs ──────────────────────────────────────────────────────────────────

/** A demand line plus the catalog and customer facts the grid puts on screen. */
export interface ToOrderLine extends DemandLine {
  so: number | null;
  customerName: string | null;
  /** `product_models.name` — what the operator recognises. */
  modelName: string | null;
  /** `product_skus.variant` — the module code a factory reads. */
  variant: string | null;
  /** `order_lines.attrs.sofa_build_key`; null means the line stands alone. */
  buildKey: string | null;
  fabricName: string | null;
  legHeight: string | null;
  itemHeight: string | null;
  /** Resolved server-side. Never shown; the PO write needs it. */
  cost: number | null;
}

export interface ToOrderSupplier {
  id: string;
  name: string;
}

export interface BuildToOrderInput {
  lines: readonly ToOrderLine[];
  suppliers: readonly ToOrderSupplier[];
  supply?: NetRequirementsSupply;
  options: NetRequirementsOptions;
  /**
   * Supplier × category pairs with no production days set. Those pairs cannot
   * produce an order-by date at all, so they are named rather than defaulted
   * (Jess, 2026-07-28 — a fallback is how a setting silently stops mattering).
   */
  missingProductionDays?: readonly { supplierId: string; category: string }[];
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export interface ToOrderBuild {
  key: string;
  /** `Sofa 1 — Booqit` */
  title: string;
  /** `3 Modules · CG-004 Wood · Leg 6" · Height 24"` — everything, unabridged. */
  spec: string;
  /** `5539-1B(LHF) · 5539-CNR · 5539-2A(RHF)` */
  codes: string;
  lines: { lineId: string; sku: string; qty: number; cost: number | null }[];
}

export interface ToOrderRow {
  orderId: string;
  so: number | null;
  customer: string;
  /** Business unit: sofas, mattresses, bedframes — never module lines. */
  qty: number;
  summary: string;
  /** `arriveBy` from the engine. `null` when the customer order has no date. */
  stockReady: IsoDate | null;
  builds: ToOrderBuild[];
}

export interface ToOrderProposal {
  key: string;
  supplierId: string;
  supplierName: string;
  category: ProductCategory;
  /** `Ohana · Sofa` */
  label: string;
  /** Earliest raise-by across the proposal. `null` when every row is TBD. */
  orderBy: IsoDate | null;
  /** How many purchase orders `Issue Purchase Order` will create. */
  poCount: number;
  rows: ToOrderRow[];
  /** Set when the pair has no production days — Issue is refused. */
  blocked: "production_days" | null;
}

// ── Summary ─────────────────────────────────────────────────────────────────

/**
 * The ONE specification a Summary is allowed to carry, by frozen priority:
 * fabric, then a missing leg, then a non-default height. A default never
 * prints — `Height 24"` is on every sofa in the catalog, so printing it spends
 * a token to say nothing.
 *
 * Leg HEIGHT is deliberately absent: the data holds 4" and 6" and nobody has
 * said which is standard, so neither can be called an exception. `No Leg` is
 * an exception whatever the default turns out to be, which is why it is the
 * only leg fact here.
 */
const DEFAULT_ITEM_HEIGHT = "24";

export function pickSpecToken(
  raw: readonly {
    fabricName: string | null;
    legHeight: string | null;
    itemHeight: string | null;
  }[],
): string | null {
  for (const r of raw) if (r.fabricName) return r.fabricName;
  for (const r of raw) if (r.legHeight && /no\s*leg/i.test(r.legHeight)) return "No Leg";
  for (const r of raw) {
    if (r.itemHeight && r.itemHeight !== DEFAULT_ITEM_HEIGHT) {
      return `Height ${r.itemHeight}"`;
    }
  }
  return null;
}

/**
 * `Model · N Sofas · one spec` — three tokens, never four.
 *
 * When one customer order spans two models the model token reads the first;
 * expanding the row is where every build is named in full.
 */
export function composeSummary(args: {
  model: string | null;
  qty: number;
  category: string;
  spec: string | null;
}): string {
  const tokens: string[] = [];
  if (args.model) tokens.push(args.model);
  tokens.push(`${args.qty} ${unitLabel(args.category, args.qty)}`);
  if (args.spec) tokens.push(args.spec);
  return tokens.slice(0, 3).join(" · ");
}

// ── Sorting ─────────────────────────────────────────────────────────────────

export type ToOrderSortKey = "cust" | "so" | "qty" | "summary" | "stockReady";

/**
 * A row with no Stock Ready date SINKS — under EVERY column, in BOTH
 * directions. A step that cannot be late is not urgent (the delivery queue's
 * own rule, T7), so no way of looking at the grid may promote a row that
 * carries no deadline into the top of the day's work. Sorting by customer name
 * is still a sort; it is not a licence to put undated work first.
 *
 * Within each of the two groups the chosen column decides, and a missing value
 * in THAT column sinks to the bottom of its own group.
 */
export function sortToOrderRows(
  rows: readonly ToOrderRow[],
  key: ToOrderSortKey = "stockReady",
  asc = true,
): ToOrderRow[] {
  const pick = (r: ToOrderRow): string | number | null => {
    switch (key) {
      case "cust": return r.customer.toLowerCase();
      case "so": return r.so;
      case "qty": return r.qty;
      case "summary": return r.summary.toLowerCase();
      default: return r.stockReady;
    }
  };
  return [...rows].sort((a, b) => {
    const aDated = a.stockReady != null;
    const bDated = b.stockReady != null;
    if (aDated !== bDated) return aDated ? -1 : 1;

    const x = pick(a);
    const y = pick(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return asc ? x - y : y - x;
    const sx = String(x);
    const sy = String(y);
    if (sx === sy) return 0;
    return asc ? (sx < sy ? -1 : 1) : (sx > sy ? -1 : 1);
  });
}

// ── The projection ──────────────────────────────────────────────────────────

function buildSpec(members: readonly ToOrderLine[]): string {
  const first = members[0];
  const bits: string[] = [];
  const n = members.length;
  bits.push(`${n} Module${n === 1 ? "" : "s"}`);
  if (first.fabricName) bits.push(first.fabricName);
  if (first.legHeight) bits.push(/no\s*leg/i.test(first.legHeight) ? "No Leg" : `Leg ${first.legHeight}`);
  if (first.itemHeight) bits.push(`Height ${first.itemHeight}"`);
  return bits.join(" · ");
}

/**
 * Turn raw demand into the proposals the sidebar lists and the grid reviews.
 *
 * The engine runs first and owns every date; this function only reshapes what
 * it returns and adds the two things it does not know about — how a sofa's
 * module lines group into a build, and how builds group into a document.
 */
export function buildToOrder(input: BuildToOrderInput): ToOrderProposal[] {
  const eligible = input.lines.filter((l) => isToOrderCategory(l.category));
  if (eligible.length === 0) return [];

  const net = computeNetRequirements(
    eligible as unknown as DemandLine[],
    input.supply ?? {},
    input.options,
  );

  // Stock Ready and the order-by date both come from the engine's bundles.
  const bundleByLine = new Map<string, BundleRequirement>();
  for (const b of net.bundles) for (const id of b.lineIds) bundleByLine.set(id, b);
  const toOrderByLine = new Map<string, number>();
  for (const r of net.lines) toOrderByLine.set(r.line.lineId, r.toOrder);

  const supplierName = new Map(input.suppliers.map((s) => [s.id, s.name]));
  const missing = new Set(
    (input.missingProductionDays ?? []).map((m) => `${m.supplierId}::${m.category}`),
  );

  // group 1 — supplier × category
  const byPair = new Map<string, ToOrderLine[]>();
  for (const l of eligible) {
    // A line already covered by an open PO or by stock has left this workspace.
    if ((toOrderByLine.get(l.lineId) ?? 0) <= 0) continue;
    const k = `${l.supplierId}::${l.category}`;
    const arr = byPair.get(k);
    if (arr) arr.push(l);
    else byPair.set(k, [l]);
  }

  const proposals: ToOrderProposal[] = [];

  for (const [pairKey, pairLines] of byPair) {
    const [supplierId, category] = pairKey.split("::") as [string, ProductCategory];

    // group 2 — customer order. One row per order; for sofa that is one PO too.
    const byOrder = new Map<string, ToOrderLine[]>();
    for (const l of pairLines) {
      const arr = byOrder.get(l.orderId);
      if (arr) arr.push(l);
      else byOrder.set(l.orderId, [l]);
    }

    const rows: ToOrderRow[] = [];
    let orderBy: IsoDate | null = null;

    for (const [orderId, orderLines] of byOrder) {
      // group 3 — the physical thing. Module lines sharing a sofa_build_key are
      // ONE sofa; a line with no key stands alone.
      const byBuild = new Map<string, ToOrderLine[]>();
      for (const l of orderLines) {
        const k = l.buildKey ?? `line::${l.lineId}`;
        const arr = byBuild.get(k);
        if (arr) arr.push(l);
        else byBuild.set(k, [l]);
      }

      const builds: ToOrderBuild[] = [];
      let i = 0;
      for (const [key, members] of byBuild) {
        i += 1;
        const model = members[0].modelName ?? members[0].sku;
        builds.push({
          key,
          title: `${unitLabel(category, 1)} ${i} — ${model}`,
          spec: buildSpec(members),
          codes: members.map((m) => m.sku).join(" · "),
          lines: members.map((m) => ({
            lineId: m.lineId,
            sku: m.sku,
            qty: toOrderByLine.get(m.lineId) ?? m.qty,
            cost: m.cost,
          })),
        });
      }

      // Sofa counts builds; everything else counts pieces.
      const qty = isOnePoPerOrder(category)
        ? builds.length
        : orderLines.reduce((s, l) => s + (toOrderByLine.get(l.lineId) ?? l.qty), 0);

      const bundle = bundleByLine.get(orderLines[0].lineId);
      const stockReady = bundle?.arriveBy ?? null;
      for (const l of orderLines) {
        const rb = bundleByLine.get(l.lineId)?.raiseBy ?? null;
        if (rb && (orderBy == null || rb < orderBy)) orderBy = rb;
      }

      rows.push({
        orderId,
        so: orderLines[0].so,
        customer: orderLines[0].customerName ?? "—",
        qty,
        summary: composeSummary({
          model: orderLines[0].modelName,
          qty,
          category,
          spec: pickSpecToken(
            orderLines.map((l) => ({
              fabricName: l.fabricName,
              legHeight: l.legHeight,
              itemHeight: l.itemHeight,
            })),
          ),
        }),
        stockReady,
        builds,
      });
    }

    const name = supplierName.get(supplierId) ?? supplierId;
    proposals.push({
      key: pairKey,
      supplierId,
      supplierName: name,
      category,
      label: `${name} · ${categoryLabel(category)}`,
      orderBy,
      poCount: isOnePoPerOrder(category) ? rows.length : 1,
      rows: sortToOrderRows(rows),
      blocked: missing.has(pairKey) ? "production_days" : null,
    });
  }

  // Earliest order-by first; a proposal with no date at all sinks.
  return proposals.sort((a, b) => {
    if (a.orderBy == null && b.orderBy == null) return a.label < b.label ? -1 : 1;
    if (a.orderBy == null) return 1;
    if (b.orderBy == null) return -1;
    if (a.orderBy !== b.orderBy) return a.orderBy < b.orderBy ? -1 : 1;
    return a.label < b.label ? -1 : 1;
  });
}

export function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

// ── What Issue Purchase Order writes ────────────────────────────────────────

export interface PoToCreate {
  supplierId: string;
  /** Present when the document covers exactly one customer order. */
  so: number | null;
  soRefs: number[];
  customer: string;
  lines: { sku: string; qty: number; cost: number | null }[];
}

/**
 * Split a proposal into the documents `Issue Purchase Order` creates.
 *
 * The split IS the frozen boundary and nothing about it is typed by a human:
 * sofa yields one document per customer order, every other category yields one
 * document holding the supplier's whole demand. Same SKU twice in one document
 * is merged, so a factory reads one line per item.
 */
export function planPurchaseOrders(proposal: ToOrderProposal): PoToCreate[] {
  const fromRows = (rows: readonly ToOrderRow[]): PoToCreate["lines"] => {
    const bySku = new Map<string, { sku: string; qty: number; cost: number | null }>();
    for (const r of rows) {
      for (const b of r.builds) {
        for (const l of b.lines) {
          const hit = bySku.get(l.sku);
          if (hit) hit.qty += l.qty;
          else bySku.set(l.sku, { sku: l.sku, qty: l.qty, cost: l.cost });
        }
      }
    }
    return [...bySku.values()];
  };

  if (isOnePoPerOrder(proposal.category)) {
    return proposal.rows.map((r) => ({
      supplierId: proposal.supplierId,
      so: r.so,
      soRefs: r.so == null ? [] : [r.so],
      customer: r.customer,
      lines: fromRows([r]),
    }));
  }

  const soRefs = proposal.rows
    .map((r) => r.so)
    .filter((s): s is number => typeof s === "number");
  return [
    {
      supplierId: proposal.supplierId,
      so: soRefs.length === 1 ? soRefs[0] : null,
      soRefs,
      customer: proposal.supplierName,
      lines: fromRows(proposal.rows),
    },
  ];
}
