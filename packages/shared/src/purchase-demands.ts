import { z } from "zod";
import type { IsoDate } from "./working-days";
import type { ProductCategory } from "./db-types";
import { isOnePoPerOrder, categoryLabel } from "./to-order";

/**
 * PURCHASE DEMANDS — the customer-demand REGISTER
 * (CARD-2026-08-20-purchase-demands; `docs/purchasing/MASTER.md` §3.1).
 *
 * The page answers ONE question: *what customer goods need buying, what
 * already covers them, and what must be fixed before they can be bought?*
 *
 * ── WHY THIS FILE HOLDS NO ARITHMETIC OF ITS OWN ────────────────────────────
 *
 * SO Batch Purchase and this Register read the SAME server recomputation
 * (`apps/api/src/lib/purchase-demand-read.ts` → `buildToOrder`). Nothing here
 * nets a quantity, allocates a unit or resolves a supplier — every number below
 * is carried off the engine's own build, and the only thing this file does is
 * DERIVE A STATE from facts and COMPOSE the words that state it.
 *
 * That is the whole reason the two surfaces cannot disagree: there is no second
 * implementation for them to disagree through (Law D — a derived fact has ONE
 * arithmetic).
 *
 * **There is no stored status.** A row's state is recomputed from current Sales
 * Order, Catalog, Stock, open-PO and Purchasing Settings facts on every read;
 * fix the supplier and the row moves without anybody clearing a flag.
 */

// ─── The words ───────────────────────────────────────────────────────────────

/**
 * Every visible word on the Purchase Demands surface (`docs/COPY-STANDARD.md`
 * — Purchase Demands block). Spelt ONCE here so no screen respells them.
 */
export const PURCHASE_DEMAND_WORDS = {
  page: "Purchase Demands",
  search: "Search purchase demands…",
  railHeading: "Work to do",
  railAll: "All demands",
  /** What the rail's bare numbers count. */
  footerUnit: "demand lines",
  openBatch: "Open SO Batch Purchase",
  empty: "No purchase demands.",
  /** Column heads. */
  colItem: "Item · Description",
  colVariant: "Variant",
  colCategory: "Category",
  colSku: "SKU",
  colSo: "SO No",
  colCustomer: "Customer",
  colCustomerDelivery: "Customer Delivery",
  colSupplier: "Supplier",
  colQtyNeeded: "Qty Needed",
  colReadyStock: "Ready Stock",
  colOnPo: "On PO",
  colToBuy: "To Buy",
  colCoverage: "Coverage",
  /** Governed absence words — never a bare dash. */
  noCustomerDate: "No delivery date yet",
  noSupplier: "No supplier yet",
  /** The coverage cell when the blocker also blocks the coverage arithmetic. */
  coverageUnknown: "Not counted yet",
  coverageNone: "Nothing covers it yet",
} as const;

// ─── The six states ──────────────────────────────────────────────────────────

/**
 * The six derived states a customer demand line can be in, once the Catalog
 * category has positively INCLUDED it. A positively non-procurable category
 * (Service, accessory, guarantee) never becomes a row at all.
 */
export type PurchaseDemandState =
  | "ready_to_buy"
  | "no_customer_date"
  | "no_sku"
  | "no_supplier"
  | "no_production_days"
  | "covered";

/**
 * Rail order, and the PRECEDENCE order of the derivation below.
 *
 * `covered` outranks `no_customer_date` on purpose: a line an open purchase
 * order already covers has nothing left to buy, so the missing date is not
 * stopping a purchase and printing it as a blocker would send somebody to fix
 * a thing that blocks nothing.
 */
export const PURCHASE_DEMAND_STATES: readonly PurchaseDemandState[] = [
  "ready_to_buy",
  "no_customer_date",
  "no_sku",
  "no_supplier",
  "no_production_days",
  "covered",
] as const;

/** The FACT line — line 1 of the governed two-line treatment. */
export const PURCHASE_DEMAND_STATE_WORDS: Record<PurchaseDemandState, string> = {
  ready_to_buy: "Ready to buy",
  no_customer_date: "Customer delivery date is missing",
  no_sku: "SKU not found",
  no_supplier: "Supplier not assigned",
  no_production_days: "Production days are missing",
  covered: "Covered — no buying needed",
};

/**
 * The RAIL word — the same fact, short enough for a 200px rail. The rail names
 * concrete facts; it may never say `Today`, `Needs attention`, `Follow up`,
 * `Pending` or `Waiting` (card §4).
 */
export const PURCHASE_DEMAND_RAIL_WORDS: Record<PurchaseDemandState, string> = {
  ready_to_buy: "Ready to buy",
  no_customer_date: "No customer date",
  no_sku: "No SKU",
  no_supplier: "No supplier",
  no_production_days: "No production days",
  covered: "Covered",
};

/**
 * The OWNER RULE per blocker (card §4). A name resolves where a stored fact
 * carries one; where none does, the DUTY WORD stands — the Work Engine's own
 * law (`work-engine.ts` `ownerDuty`), never a hand-picked person.
 */
export const PURCHASE_DEMAND_OWNER_DUTY: Record<PurchaseDemandState, string | null> = {
  ready_to_buy: null,
  no_customer_date: "Responsible Salesperson",
  no_sku: "PO duty",
  no_supplier: "PO duty",
  no_production_days: "Purchasing Settings",
  covered: null,
};

export function isPurchaseDemandState(v: unknown): v is PurchaseDemandState {
  return (
    typeof v === "string" && (PURCHASE_DEMAND_STATES as readonly string[]).includes(v)
  );
}

// ─── The row ─────────────────────────────────────────────────────────────────

/**
 * One Register leaf: one customer's demand for one physical thing.
 *
 * A sofa's module lines are ONE row (the engine's build), exactly as SO Batch
 * Purchase groups them — one customer's matched set stays together. Every other
 * category is one row per order line.
 */
export interface PurchaseDemandRow {
  /** Stable row id — the engine's build key, or the order line id. */
  id: string;
  state: PurchaseDemandState;
  /** Every source order line behind this row. */
  lineIds: string[];
  orderId: string;
  so: number | null;
  customer: string | null;
  /** The customer's promised day. `null` = TBD or never set. */
  customerDelivery: IsoDate | null;
  /** `product_models.name` — or the raw SKU when Catalog has no such SKU. */
  item: string;
  /** `product_skus.variant` — the size or the module code. */
  variant: string | null;
  /** `null` exactly when Catalog has no such SKU. */
  category: ProductCategory | null;
  /** Every SKU behind the row — one for a line, N for a sofa build. */
  skus: string[];
  supplierId: string | null;
  supplier: string | null;
  /** What the customer asked for, in this row's own unit (1 sofa, N mattresses). */
  qtyNeeded: number;
  /**
   * Free ready stock that matches, open-PO cover, units already drawn, and what
   * is still to buy — ALL carried off the engine's build.
   *
   * `null` on a row the engine never saw: a line with no Catalog SKU, no
   * supplier or no production days is refused BEFORE allocation, so there is no
   * coverage answer to state. A number invented here would be a second
   * arithmetic, and a `0` would assert nothing covers it — which is not known.
   */
  readyStock: number | null;
  takenFromStock: number | null;
  onPo: number | null;
  poNumbers: string[];
  toBuy: number | null;
  /** WHO fixes the blocker — a real person when a stored fact names one. */
  ownerName: string | null;
  /** The duty word, when no person resolves. */
  ownerDuty: string | null;
}

// ─── The derivation ──────────────────────────────────────────────────────────

/** The facts a state is derived from. Nothing else may decide it. */
export interface PurchaseDemandStateInput {
  /** FALSE = the SKU is absent from Catalog. */
  inCatalog: boolean;
  /** FALSE = the SKU is a real Catalog product nobody has mapped a supplier to. */
  hasSupplier: boolean;
  /** FALSE = this supplier × category pair has no production days set. */
  hasProductionDays: boolean;
  /** TRUE = every unit is already covered (open PO, or already drawn stock). */
  fullyCovered: boolean;
  /** FALSE = the customer order has no agreed delivery day. */
  hasCustomerDate: boolean;
}

/**
 * THE ONE derivation. Precedence runs top to bottom, and it mirrors the ORDER
 * IN WHICH THE ENGINE ITSELF REFUSES a line: Catalog cannot classify it →
 * nobody has mapped a supplier → the pair has no production days → nothing is
 * left to buy → the customer has no date → it can be bought.
 */
export function purchaseDemandStateOf(f: PurchaseDemandStateInput): PurchaseDemandState {
  if (!f.inCatalog) return "no_sku";
  if (!f.hasSupplier) return "no_supplier";
  if (!f.hasProductionDays) return "no_production_days";
  if (f.fullyCovered) return "covered";
  if (!f.hasCustomerDate) return "no_customer_date";
  return "ready_to_buy";
}

/**
 * The quantities of ONE engine build, in the build's own unit.
 *
 * Every number is the engine's; the only composition is `qtyNeeded`, and it has
 * one branch that exists because the engine's `qty` changes UNIT on a modular
 * build: `1B(LHF) + CNR + 2A(RHF)` is ONE sofa while `coveredByOpenPo` counts
 * MODULES. Adding a module count to a sofa count would print a number that is
 * true of nothing, so a modular build states the sofa and stops.
 */
export function purchaseDemandQuantities(build: {
  qty: number;
  freeStock: number;
  takenFromStock: number;
  coveredByOpenPo: number;
  fullyOnPo?: boolean;
  lines: readonly unknown[];
}, category: ProductCategory): {
  qtyNeeded: number;
  readyStock: number;
  takenFromStock: number;
  onPo: number;
  toBuy: number;
} {
  const modular = isOnePoPerOrder(category) && build.lines.length > 1;
  const fully = build.fullyOnPo === true;
  const toBuy = fully ? 0 : build.qty;
  const qtyNeeded = modular || fully
    ? build.qty
    : build.qty + build.coveredByOpenPo + build.takenFromStock;
  return {
    qtyNeeded,
    readyStock: build.freeStock,
    takenFromStock: build.takenFromStock,
    onPo: build.coveredByOpenPo,
    toBuy,
  };
}

// ─── The words a row composes ────────────────────────────────────────────────

/**
 * Line 2 of the governed two-line treatment — the HELP, in the imperative, in
 * primary-school English. `null` on a row that needs no fixing.
 *
 * `Check the supplier for {model}` is the Work Engine's own dictionary row
 * (`docs/COPY-STANDARD.md` — `Check the supplier`), reused verbatim rather than
 * respelt.
 */
export function purchaseDemandHelpLine(row: {
  state: PurchaseDemandState;
  item: string;
  supplier: string | null;
  category: ProductCategory | null;
}): string | null {
  switch (row.state) {
    case "no_customer_date":
      return "Ask customer for a delivery date";
    case "no_sku":
      return "Add this item to the SKU catalog";
    case "no_supplier":
      return `Check the supplier for ${row.item}`;
    case "no_production_days":
      return `Add production days for ${row.supplier ?? "the supplier"} · ${
        row.category ? categoryLabel(row.category) : "the category"
      }`;
    default:
      return null;
  }
}

/**
 * The Coverage cell, in words. Composed from the engine's numbers only.
 *
 * A row the engine never saw says so rather than printing `0`: not knowing and
 * knowing there is nothing are different answers, and only one of them is true.
 */
export function purchaseDemandCoverageLine(row: {
  readyStock: number | null;
  takenFromStock: number | null;
  onPo: number | null;
  poNumbers: readonly string[];
}): string {
  if (row.onPo == null) return PURCHASE_DEMAND_WORDS.coverageUnknown;
  const parts: string[] = [];
  if ((row.takenFromStock ?? 0) > 0) parts.push(`${row.takenFromStock} from stock`);
  if (row.onPo > 0) {
    parts.push(
      row.poNumbers.length > 0
        ? `${row.onPo} on ${row.poNumbers.join(" · ")}`
        : `${row.onPo} on purchase order`,
    );
  }
  if ((row.readyStock ?? 0) > 0) parts.push(`${row.readyStock} free in stock`);
  return parts.length > 0 ? parts.join(" · ") : PURCHASE_DEMAND_WORDS.coverageNone;
}

// ─── Pure grouping + filtering ───────────────────────────────────────────────

export interface PurchaseDemandVariantGroup {
  key: string;
  variant: string | null;
  rows: PurchaseDemandRow[];
  qtyNeeded: number;
  toBuy: number;
}

export interface PurchaseDemandItemGroup {
  key: string;
  item: string;
  category: ProductCategory | null;
  variants: PurchaseDemandVariantGroup[];
  rows: PurchaseDemandRow[];
  qtyNeeded: number;
  readyStock: number;
  onPo: number;
  toBuy: number;
  /** TRUE when the item has exactly one variant — the tree may collapse it
   *  straight to the SO/customer leaves (card §4). */
  singleVariant: boolean;
}

/**
 * item/model parent → variant → SO/customer leaves.
 *
 * SHORTAGES FIRST: an item with something still to buy sorts above one that is
 * covered, then the largest shortage, then the item name — so the work is at
 * the top without a Priority column ever being invented.
 */
export function groupPurchaseDemands(
  rows: readonly PurchaseDemandRow[],
): PurchaseDemandItemGroup[] {
  const byItem = new Map<string, PurchaseDemandRow[]>();
  for (const r of rows) {
    const k = `${r.category ?? "uncatalogued"}::${r.item}`;
    const arr = byItem.get(k);
    if (arr) arr.push(r);
    else byItem.set(k, [r]);
  }
  const groups: PurchaseDemandItemGroup[] = [];
  for (const [key, itemRows] of byItem) {
    const byVariant = new Map<string, PurchaseDemandRow[]>();
    for (const r of itemRows) {
      const vk = r.variant ?? "";
      const arr = byVariant.get(vk);
      if (arr) arr.push(r);
      else byVariant.set(vk, [r]);
    }
    const variants: PurchaseDemandVariantGroup[] = [...byVariant].map(([vk, vRows]) => ({
      key: `${key}::${vk}`,
      variant: vRows[0]!.variant,
      rows: vRows,
      qtyNeeded: vRows.reduce((s, r) => s + r.qtyNeeded, 0),
      toBuy: vRows.reduce((s, r) => s + (r.toBuy ?? 0), 0),
    }));
    variants.sort((a, b) => (a.variant ?? "").localeCompare(b.variant ?? ""));
    groups.push({
      key,
      item: itemRows[0]!.item,
      category: itemRows[0]!.category,
      variants,
      rows: itemRows,
      qtyNeeded: itemRows.reduce((s, r) => s + r.qtyNeeded, 0),
      readyStock: itemRows.reduce((s, r) => s + (r.readyStock ?? 0), 0),
      onPo: itemRows.reduce((s, r) => s + (r.onPo ?? 0), 0),
      toBuy: itemRows.reduce((s, r) => s + (r.toBuy ?? 0), 0),
      singleVariant: variants.length === 1,
    });
  }
  groups.sort((a, b) => {
    if (a.toBuy !== b.toBuy) return b.toBuy - a.toBuy;
    return a.item.localeCompare(b.item);
  });
  return groups;
}

/** Multi-select rail filter. An empty selection means EVERY state. */
export function filterPurchaseDemands(
  rows: readonly PurchaseDemandRow[],
  states: ReadonlySet<PurchaseDemandState>,
): PurchaseDemandRow[] {
  if (states.size === 0) return [...rows];
  return rows.filter((r) => states.has(r.state));
}

export function purchaseDemandStateCounts(
  rows: readonly PurchaseDemandRow[],
): Record<PurchaseDemandState, number> {
  const counts = {
    ready_to_buy: 0,
    no_customer_date: 0,
    no_sku: 0,
    no_supplier: 0,
    no_production_days: 0,
    covered: 0,
  } satisfies Record<PurchaseDemandState, number>;
  for (const r of rows) counts[r.state] += 1;
  return counts;
}

/**
 * The 32px status footer (`docs/ui/MASTER.md` — REGISTER STATUS FOOTER). It
 * states the listing's own units, and makes a narrowed listing explicit.
 */
export function purchaseDemandFooter(
  filtered: readonly PurchaseDemandRow[],
  total: readonly PurchaseDemandRow[],
): string {
  const lineWord = filtered.length === 1 ? "demand line" : "demand lines";
  const scope =
    filtered.length === total.length
      ? `${filtered.length} ${lineWord}`
      : `${filtered.length} of ${total.length} demand lines`;
  const needed = filtered.reduce((s, r) => s + r.qtyNeeded, 0);
  const toBuy = filtered.reduce((s, r) => s + (r.toBuy ?? 0), 0);
  return `${scope} · ${needed} ${needed === 1 ? "unit" : "units"} needed · ${toBuy} ${
    toBuy === 1 ? "unit" : "units"
  } to buy`;
}

// ─── The wire ────────────────────────────────────────────────────────────────

export const purchaseDemandStateSchema = z.enum([
  "ready_to_buy",
  "no_customer_date",
  "no_sku",
  "no_supplier",
  "no_production_days",
  "covered",
]);

export const purchaseDemandRowSchema = z.object({
  id: z.string(),
  state: purchaseDemandStateSchema,
  lineIds: z.array(z.string()),
  orderId: z.string(),
  so: z.number().nullable(),
  customer: z.string().nullable(),
  customerDelivery: z.string().nullable(),
  item: z.string(),
  variant: z.string().nullable(),
  /* The catalog's own enum, so the wire type and the domain type are ONE type
     — a widened `string` here would make every consumer re-narrow it. `null`
     is the SKU the catalog has never heard of. */
  category: z
    .enum(["mattress", "bedframe", "sofa", "accessory", "service", "guarantee"])
    .nullable(),
  skus: z.array(z.string()),
  supplierId: z.string().nullable(),
  supplier: z.string().nullable(),
  qtyNeeded: z.number(),
  readyStock: z.number().nullable(),
  takenFromStock: z.number().nullable(),
  onPo: z.number().nullable(),
  poNumbers: z.array(z.string()),
  toBuy: z.number().nullable(),
  ownerName: z.string().nullable(),
  ownerDuty: z.string().nullable(),
});

export const purchaseDemandsResponseSchema = z.object({
  today: z.string(),
  rows: z.array(purchaseDemandRowSchema),
  /** The warehouse the free-stock offer was counted at, by its own name. */
  stockWarehouse: z.string().nullable(),
});

export type PurchaseDemandsResponse = z.infer<typeof purchaseDemandsResponseSchema>;
