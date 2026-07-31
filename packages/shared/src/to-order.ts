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
  /** Voiced in the Issue region when no destination is configured at all. */
  destinationRequired: "Destination not selected.",
  issue: "Issue Purchase Order",

  /**
   * The queue rail's own heading — what the left side IS. Ruled by Loo
   * 2026-07-31 with the Fiori-worklist rail; still owed a COPY-STANDARD row.
   */
  readyToIssue: "Ready to issue",

  // The Preview — what pressing Issue would create, before it exists.
  preview: "Purchase Order Preview",
  /**
   * The per-document switch. Its meaning is frozen and narrow: whether this
   * document goes out in THIS issue. It is not a hold, not an exclusion, not a
   * cancellation and not a status — unchecking changes nothing about the
   * customer's order, and a refresh puts it back.
   */
  include: "Include in this issue",
  includeOffHelp: "Not issued this time. Nothing about the order changes.",
  removedHeading: "Not on any purchase order",
  removedHelp: "Still waiting to be ordered. It comes back on the next refresh.",
  putBack: "Put back",

  // ── Items · the section an operator spends the review in ─────────────────
  // Ruled by Loo 2026-07-31. Each is still owed a COPY-STANDARD row.
  itemsHeading: "Items",
  itemsColRef: "Ref",
  itemsColItem: "Item",
  itemsColSize: "Size",
  itemsColQty: "Qty",
  /** The action column carries no header word — the ⋯ names itself. */
  itemsColAction: "",
  itemsMenu: "More",
  itemsSplit: "Create Another Purchase Order",
  itemsRemove: "Remove",
  /**
   * `Open order` is what COPY-STANDARD:826 rules for leaving a module. Loo
   * re-ruled it here on 2026-07-31: this page shows Purchase Orders, Sales
   * Orders and Delivery Orders, and one word for three documents is the
   * ambiguity that ruling exists to prevent.
   */
  itemsOpenOrder: "Open Customer Order",
  itemsEmpty: "Nothing on this purchase order.",
  itemsTableLabel: "Items on this purchase order",

  productionDaysRequired: "Production Days Required",
  productionDaysHelp: "Set production days in Settings.",

  // The 2026-07-30 regression, given a voice. A requirement the catalog could
  // not answer for used to be skipped in silence; it now stops the button and
  // names itself, because a purchase order that quietly omits a customer's
  // goods is worse than one that was never raised.
  unresolvedHelp: "Nothing can be issued until every item resolves.",

  nextStep: "Next: confirm the ready date in Purchase Orders",
  openPurchaseOrders: "Open Purchase Orders",

  empty: "No purchase orders to issue.",
} as const;

/**
 * `PO 2` — a queue-rail row. Small on purpose (Loo, 2026-07-31: the rail is
 * scanned for COUNTS, and a row is only the door to the workspace, where the
 * full `PO 2 of 3` still lives via `poIndexLabel`).
 */
export function poShortLabel(i: number): string {
  return `PO ${i}`;
}

/** `2 orders` — customer orders on one purchase order. */
export function countOrders(n: number): string {
  return `${n} order${n === 1 ? "" : "s"}`;
}

/** `5 items` — physical units on one purchase order. */
export function countItems(n: number): string {
  return `${n} item${n === 1 ? "" : "s"}`;
}

/** `7 working days` — the pair's production time, as the header states it. */
export function productionDaysLabel(n: number): string {
  return `${n} working day${n === 1 ? "" : "s"}`;
}

/** `1 Purchase Order` / `7 Purchase Orders` — the sidebar and the button. */
export function purchaseOrderCount(n: number): string {
  return `${n} Purchase Order${n === 1 ? "" : "s"}`;
}

/** `3 items could not be read` — the count is the point, so it leads. */
export function unresolvedHeadline(n: number): string {
  return `${n} item${n === 1 ? "" : "s"} could not be read`;
}

/**
 * `13 lines · 14 units` — what the Items region holds.
 *
 * UNITS, not the category's own word. A line of 2 read exactly like a line of
 * 1 until 2026-07-31, so the number is the point; naming the goods again here
 * would repeat what every row already says in its own Item column.
 */
export function itemsCount(lines: number, units: number): string {
  return `${lines} line${lines === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"}`;
}

/** `Move to Purchase Order 2` — the target is named, never a submenu. */
export function moveToTarget(target: string): string {
  return `Move to ${target}`;
}

/**
 * `PO 1 of 3` — which document fills the workspace, and how many there are.
 * Was a literal typed inside the page (twice — the queue row and the PO bar);
 * moved here 2026-07-31 because a word that lives in markup is a word that
 * drifts. Still owed a COPY-STANDARD row.
 */
export function poIndexLabel(i: number, total: number): string {
  return `PO ${i} of ${total}`;
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
  /**
   * `product_skus.variant_kind`. `variant` means two different things by
   * category and only the catalog knows which: measured 2026-07-31, all 58
   * mattress + bedframe skus are `size` (`King` / `Queen`) and all 138 sofa
   * skus are `part` (`1A(LHF)`). A part code printed as a size is a sentence
   * the factory would act on, so the size is read through this and never
   * from `variant` alone.
   */
  variantKind: string | null;
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
  /** `product_models.name`, falling back to the sku. `B1201S` · `Booqit`. */
  model: string;
  /**
   * The size a factory has to cut to — `King`, `Queen`. NULL when the category
   * has no size (every sofa) rather than when nobody typed one, because the
   * two read the same on screen and only one of them is a data problem.
   */
  size: string | null;
  /** Units to make. NOT the number of lines — see `title`. */
  qty: number;
  /**
   * `1` / `2` when a sibling of the same customer order would read identically,
   * null otherwise. A table with its own Size column cannot use `title` (it
   * would print the size twice), so the disambiguator travels as a number and
   * the caller composes it with the unit word.
   */
  ordinal: number | null;
  /** `B1201S King` · `Sofa 2 — Booqit` when a sibling would read identically. */
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
  /**
   * The pair's production time in WORKING days — the number a manager set in
   * Settings, read back off the demand lines (one pair, one number). `null`
   * exactly when `blocked` — a missing number is never defaulted into a fact.
   */
  productionDays: number | null;
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

/**
 * What one physical thing is called, and the size a factory has to cut to.
 *
 * The size is read through `variantKind`, never off `variant` alone: the same
 * column holds `King` on a mattress and `1A(LHF)` on a sofa module, and a part
 * code printed under the word Size is an instruction, not a cosmetic slip.
 * A build spanning two sizes reports none rather than the first — a wrong size
 * is worse than a missing one, because only the missing one gets asked about.
 */
export function nameBuild(members: readonly { modelName: string | null; sku: string; variant: string | null; variantKind: string | null }[]): {
  model: string;
  size: string | null;
  named: string;
} {
  const model = members[0].modelName ?? members[0].sku;
  const sizes = new Set(
    members.filter((m) => m.variantKind === "size" && m.variant).map((m) => m.variant as string),
  );
  const size = sizes.size === 1 ? [...sizes][0]! : null;
  return { model, size, named: size ? `${model} ${size}` : model };
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

      // The ordinal (`Mattress 1`) exists to tell IDENTICAL siblings apart, and
      // nothing else. It read as a QUANTITY (Loo, 2026-07-31) while the real
      // quantity was on screen nowhere — 14 rows on a proposal the factory has
      // to build 16 units for. So it is now earned, not automatic: a build
      // names itself, and the ordinal is added only where a sibling of the same
      // order would print the same words.
      const nameCount = new Map<string, number>();
      for (const members of byBuild.values()) {
        const n = nameBuild(members).named;
        nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
      }

      let i = 0;
      for (const [key, members] of byBuild) {
        i += 1;
        const { model, size, named } = nameBuild(members);
        builds.push({
          key,
          model,
          size,
          ordinal: (nameCount.get(named) ?? 0) > 1 ? i : null,
          // A sofa build IS one sofa however many module lines it has; every
          // other category is one line whose own quantity is the answer.
          qty: isOnePoPerOrder(category)
            ? 1
            : members.reduce((s, m) => s + (toOrderByLine.get(m.lineId) ?? m.qty), 0),
          title:
            (nameCount.get(named) ?? 0) > 1
              ? `${unitLabel(category, 1)} ${i} — ${named}`
              : named,
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
      // Settings are per supplier × category, so every line in the pair
      // carries the same number; a blocked pair gets NO number — showing a
      // fallback here would be the silent 7 that P1 exists to refuse.
      productionDays: missing.has(pairKey) ? null : (pairLines[0]?.leadDays ?? null),
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
  return planFromDocuments(proposal, defaultDocuments(proposal));
}

// ── The documents an operator arranges before issuing ───────────────────────

/**
 * One physical thing on a future purchase order — a sofa build, or a single
 * line that stands alone. It is the unit an operator moves, splits and removes,
 * because it is the unit they can point at: *that* sofa, not "line 3 of 5".
 */
export interface ToOrderBuildRef {
  buildKey: string;
  orderId: string;
  so: number | null;
  customer: string;
  title: string;
  /** `B1201S` · `Booqit` — the model alone, for a table with its own Size column. */
  model: string;
  /** See `ToOrderBuild.ordinal`. */
  ordinal: number | null;
  /** Units to make. The preview printed a line count and called it items. */
  qty: number;
  /** `King` · `Queen`, or null where the category has no size at all. */
  size: string | null;
  lineIds: string[];
}

/**
 * A document the operator is about to create.
 *
 * **It exists only in the browser, for the length of one visit.** Splitting,
 * moving and removing rearrange these; a refresh throws them away and the
 * server's own suggestion comes back. Nothing about an arrangement is ever
 * stored, which is what keeps a Proposal a computed view rather than the Draft
 * PO this module deleted on 2026-07-30.
 */
export interface IssueDocument {
  key: string;
  /** Left OUT of this issue when false. Not a hold, not a status — this visit only. */
  include: boolean;
  buildKeys: string[];
}

export function toOrderBuilds(proposal: ToOrderProposal): ToOrderBuildRef[] {
  const out: ToOrderBuildRef[] = [];
  for (const r of proposal.rows) {
    for (const b of r.builds) {
      out.push({
        buildKey: b.key,
        orderId: r.orderId,
        so: r.so,
        customer: r.customer,
        title: b.title,
        model: b.model,
        ordinal: b.ordinal,
        qty: b.qty,
        size: b.size,
        lineIds: b.lines.map((l) => l.lineId),
      });
    }
  }
  return out;
}

/**
 * What the system suggests before anybody touches it: sofa one document per
 * customer order, everything else the supplier's whole demand in one.
 */
export function defaultDocuments(proposal: ToOrderProposal): IssueDocument[] {
  const builds = toOrderBuilds(proposal);
  if (!isOnePoPerOrder(proposal.category)) {
    if (builds.length === 0) return [];
    return [{ key: "d1", include: true, buildKeys: builds.map((b) => b.buildKey) }];
  }
  const byOrder = new Map<string, string[]>();
  for (const b of builds) {
    const arr = byOrder.get(b.orderId);
    if (arr) arr.push(b.buildKey);
    else byOrder.set(b.orderId, [b.buildKey]);
  }
  return [...byOrder.values()].map((buildKeys, i) => ({
    key: `d${i + 1}`,
    include: true,
    buildKeys,
  }));
}

export type IssuePlanError =
  | "no_documents"
  | "empty_document"
  | "duplicate_build"
  | "unknown_build"
  | "sofa_merge"
  | "batch_too_large";

export interface IssuePlanCheck {
  ok: boolean;
  code?: IssuePlanError;
  message?: string;
  /** How many documents the plan would create. */
  count: number;
}

/**
 * The batch RPC runs the whole issue in ONE transaction and caps it at 20.
 * Splitting a bigger issue across calls would trade the guarantee for
 * convenience, so a plan past the cap is refused rather than quietly chunked.
 */
export const ISSUE_BATCH_MAX = 20;

/**
 * The ONE rule both the button and the server ask.
 *
 * The server re-runs it against its OWN recomputation, so a browser left open
 * since this morning cannot order goods that have since been bought — every
 * build the plan names has to still be in the proposal the server just built.
 */
export function validateIssuePlan(
  proposal: ToOrderProposal,
  docs: readonly IssueDocument[],
): IssuePlanCheck {
  const live = new Map(toOrderBuilds(proposal).map((b) => [b.buildKey, b]));
  const active = docs.filter((d) => d.include);

  if (active.length === 0) {
    return { ok: false, code: "no_documents", message: "Nothing is selected to issue.", count: 0 };
  }
  if (active.length > ISSUE_BATCH_MAX) {
    return {
      ok: false,
      code: "batch_too_large",
      message: `${active.length} purchase orders is past the ${ISSUE_BATCH_MAX} a single issue can create at once.`,
      count: active.length,
    };
  }

  const seen = new Set<string>();
  for (const d of active) {
    if (d.buildKeys.length === 0) {
      return {
        ok: false,
        code: "empty_document",
        message: "A purchase order with nothing on it cannot be issued.",
        count: active.length,
      };
    }
    const orders = new Set<string>();
    for (const k of d.buildKeys) {
      if (seen.has(k)) {
        return {
          ok: false,
          code: "duplicate_build",
          message: "The same item is on two purchase orders.",
          count: active.length,
        };
      }
      seen.add(k);
      const b = live.get(k);
      if (!b) {
        return {
          ok: false,
          code: "unknown_build",
          message: "Something on this plan is no longer waiting to be ordered.",
          count: active.length,
        };
      }
      orders.add(b.orderId);
    }
    // A merged sofa purchase order is forbidden: fabric, size and configuration
    // make one dangerous, so a sofa document may hold exactly one customer order.
    if (isOnePoPerOrder(proposal.category) && orders.size > 1) {
      return {
        ok: false,
        code: "sofa_merge",
        message: "A sofa purchase order carries one customer order. Split them.",
        count: active.length,
      };
    }
  }

  return { ok: true, count: active.length };
}

/** Turn an arrangement into what the batch RPC is sent. Included documents only. */
export function planFromDocuments(
  proposal: ToOrderProposal,
  docs: readonly IssueDocument[],
): PoToCreate[] {
  const builds = new Map(toOrderBuilds(proposal).map((b) => [b.buildKey, b]));
  const lineById = new Map<string, { sku: string; qty: number; cost: number | null }>();
  for (const r of proposal.rows) {
    for (const b of r.builds) {
      for (const l of b.lines) lineById.set(l.lineId, { sku: l.sku, qty: l.qty, cost: l.cost });
    }
  }

  return docs
    .filter((d) => d.include && d.buildKeys.length > 0)
    .map((d) => {
      const bySku = new Map<string, { sku: string; qty: number; cost: number | null }>();
      const soRefs = new Set<number>();
      const customers = new Set<string>();
      for (const k of d.buildKeys) {
        const b = builds.get(k);
        if (!b) continue;
        if (b.so != null) soRefs.add(b.so);
        customers.add(b.customer);
        for (const id of b.lineIds) {
          const l = lineById.get(id);
          if (!l) continue;
          const hit = bySku.get(l.sku);
          if (hit) hit.qty += l.qty;
          else bySku.set(l.sku, { ...l });
        }
      }
      const refs = [...soRefs];
      return {
        supplierId: proposal.supplierId,
        so: refs.length === 1 ? refs[0] : null,
        soRefs: refs,
        customer: customers.size === 1 ? [...customers][0] : proposal.supplierName,
        lines: [...bySku.values()],
      };
    });
}
