import { z } from "zod";
import { isOnePoPerOrder } from "./to-order";
import type { ProductCategory } from "./db-types";
import type { IsoDate } from "./working-days";
import {
  PURCHASE_DEMAND_TIMING_STATES,
  isPurchaseDemandTimingState,
  purchaseDemandRowSchema,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type PurchaseDemandTimingState,
} from "./purchase-demands";

/**
 * SO BATCH PURCHASE — the arrangement a buyer makes BEFORE a purchase order
 * exists (CARD-2026-08-22-purchasing-02; `docs/purchasing/MASTER.md` §§5.1,
 * 5.4, 9.1).
 *
 * ── WHAT THIS FILE IS ALLOWED TO KNOW ───────────────────────────────────────
 *
 * Exactly one thing: **where the goods the server says we must buy should be
 * sent.** It may check that an arrangement adds back to the server's own `Buy`,
 * and it may compose the `supplier × Deliver To` key the server will recompute
 * for itself. It may not net a quantity, resolve a supplier, price a line,
 * choose an arrival date or decide coverage — those are the engine's, and a
 * second implementation of any of them would be a second truth (Law D).
 *
 * `toBuy` arrives here as a NUMBER THIS FILE CANNOT EXPLAIN. That is the point:
 * every function below treats it as given, so there is nowhere for browser
 * arithmetic to grow.
 *
 * ── AND THE ARRANGEMENT IS NOT A STORED FACT ────────────────────────────────
 *
 * It lives in the operator's session until `Issue PO`. A refresh returns to the
 * server default, because *where this buy should go* only becomes truth when
 * the purchase order carries it. Persisting it would create a second demand
 * field that nothing recomputes.
 */

// ─── The words ───────────────────────────────────────────────────────────────

/**
 * Every word this destination spells that its own Register owns
 * (`docs/COPY-STANDARD.md` — the SO Batch Purchase / purchase-demand block).
 *
 * The six STATE words are not repeated here: they live in `purchase-demands.ts`
 * because the states are the demand's, not the page's, and respelling them is
 * exactly how two surfaces start disagreeing.
 */
export const SO_BATCH_PURCHASE_WORDS = {
  destination: "SO Batch Purchase",
  search: "Search Sales Order, customer, SKU or supplier…",
  empty: "No proceeded Sales Orders.",
  /** What the footer's bare numbers count — the Register's own row grain. */
  footerUnit: "Sales Orders",

  /**
   * Column heads, in the approved order (Card 02-B, owner ruling 2026-08-27;
   * `docs/purchasing/MASTER.md` §9.1). One row per proceeded Sales Order —
   * `Delivery Location` sits immediately after `Customer`, and the retired
   * heads (`Source SO` · `Required For` · `SKU / configuration` · `Required` ·
   * `Stock` · `Open PO` · `Buy` · `Goods Must Arrive` · `Work`) never return
   * as Register columns. Their FACTS survive off-screen: `goodsMustArrive`
   * keeps feeding the left rail and the Work Engine.
   */
  colStatus: "Status",
  colProceedDate: "Proceed Date",
  colPoNo: "PO No",
  colSoNo: "SO No",
  colCustomer: "Customer",
  colDeliveryLocation: "Delivery Location",
  colRequestedDelivery: "Requested Delivery Date",
  colSupplier: "Supplier",
  deliverTo: "Deliver To",
  colPoDeliveryDate: "PO Delivery Date",

  /**
   * The deterministic compact summaries a parent cell prints when one Sales
   * Order genuinely carries more than one value — the exact mapping lives in
   * the expansion, never in the cell.
   */
  multiple: "Multiple",

  /**
   * A purchase order exists, but the original date it was issued with is not
   * on file — the 0428 recovery recorded an unevidenced original as unknown
   * rather than back-filling it from a planning date (§5.7). 21 of 62 live
   * purchase orders are in this state.
   *
   * It is the SAME word the Purchase Orders register already prints for the
   * same fact, so the two columns cannot describe one PO differently. A cell
   * left BLANK keeps its own separate meaning: nothing has been ordered.
   */
  poDeliveryDateUnknown: "Not recorded",

  /* THE ROW INSPECTOR HAS NO WORDS OF ITS OWN (owner correction 2026-08-24).
     It draws `GoodsMiniTable`, the child table Sales Orders and Delivery draw,
     and that component owns its own headings. The eight labels that used to
     live here — REQUIRED · FROM STOCK · ON OPEN PO · BUY · Source ·
     Required for · Goods must arrive · Deliver to — are DELETED rather than
     kept beside the new truth: seven of the eight were re-printing a column
     the row already carried. */

  /** The destination editor. */
  split: "Split",
  splitTotal: "Total",

  /** The issue journey. */
  issuePo: "Issue PO",
  reviewTitle: "Review Purchase Orders",
  backToBuying: "Back to buying",
  previewNotSendable: "This is a preview. Issue PO creates the number.",
} as const;

// ─── The rail ────────────────────────────────────────────────────────────────

/**
 * THE RAIL CONTRACT — latest Owner ruling 2026-08-30;
 * `docs/COPY-STANDARD.md` — the rail; `docs/purchasing/MASTER.md` §9.1).
 *
 * Purchasing fact sections, in their governed order. Work remains in the
 * central owner-resolved `My Work` / `Team Work` surfaces; the local rail must
 * not copy Sales, Catalog or Purchasing actions into a second work lens.
 * `TO ORDER` holds the one `All not
 * ordered` outstanding-only filter. `ORDER TIMING` holds the five timing rows,
 * every one of them orderable. `PRODUCT` holds the three Catalog categories —
 * the CATALOG's answer, never SKU-text inference. `SUPPLIER` holds the actual
 * supplier names the Register itself projects, alphabetical and never
 * hardcoded. `REGION` groups the order's recorded Delivery State using the
 * established operator vocabulary. `SETUP TO FIX` holds the one
 * Purchasing-owned setup blocker and renders ONLY while an affected Sales
 * Order exists — an exception section with nothing in it is noise wearing a
 * heading.
 *
 * The rail is NAVIGATION, not batch selection: one filter per section,
 * sections combine, and no rail row ever grows a checkbox — the page's only
 * checkboxes are the Register's `Issue PO` selection.
 */
export const SO_BATCH_RAIL = {
  toOrder: { heading: "TO ORDER", all: "All not ordered" },
  timing: { heading: "ORDER TIMING", states: PURCHASE_DEMAND_TIMING_STATES },
  product: {
    heading: "PRODUCT",
    all: "All products",
    /** The approved filters, in the approved order — Catalog categories. */
    categories: [
      { category: "mattress", word: "Mattress" },
      { category: "bedframe", word: "Bedframe" },
      { category: "sofa", word: "Sofa" },
    ],
  },
  supplier: { heading: "SUPPLIER", all: "All suppliers" },
  region: { heading: "REGION", all: "All regions" },
  setup: {
    heading: "SETUP TO FIX",
    states: ["no_production_days"] as readonly PurchaseDemandState[],
  },
} as const;

/** The three Catalog categories the `PRODUCT` section may filter by. */
export type SoBatchProductCategory =
  (typeof SO_BATCH_RAIL.product.categories)[number]["category"];

// ─── The rail filter — one selection per section, sections combine ───────────

/**
 * WHAT THE OPERATOR HAS PICKED (Card 02-C §8). One slot per section; `null`
 * (or `false`) is that section's `All`. Different sections combine with AND;
 * clearing every slot restores the complete permanent Register, Ordered
 * records included.
 */
export interface SoBatchRailFilter {
  /** `All not ordered` — the explicit outstanding-only filter. */
  notOrderedOnly: boolean;
  /** One `ORDER TIMING` row, or none. A second click clears it. */
  timing: PurchaseDemandTimingState | null;
  /** One `PRODUCT` category; `null` is `All products`. */
  product: SoBatchProductCategory | null;
  /** One supplier name; `null` is `All suppliers`. */
  supplier: string | null;
  /** One delivery-region label; `null` is `All regions`. */
  region: string | null;
  /** The one `SETUP TO FIX` row. */
  setup: boolean;
}

export const SO_BATCH_RAIL_CLEAR: SoBatchRailFilter = {
  notOrderedOnly: false,
  timing: null,
  product: null,
  supplier: null,
  region: null,
  setup: false,
};

const SO_BATCH_KLANG_VALLEY = "Klang Valley";
const SO_BATCH_OTHER_REGION = "Others";
const SO_BATCH_KLANG_VALLEY_STATES = new Set(["kuala lumpur", "selangor", "putrajaya"]);

/**
 * The Register already receives the server's parsed Delivery State. Region is
 * a presentation grouping over that fact: Klang Valley is grouped, every
 * outstation state keeps its own name, and an absent state stays findable as
 * `Others`. No address text or postcode is guessed in the browser.
 */
function soBatchRegionName(state: string | null): string {
  const recorded = state?.trim();
  if (!recorded) return SO_BATCH_OTHER_REGION;
  return SO_BATCH_KLANG_VALLEY_STATES.has(recorded.toLowerCase())
    ? SO_BATCH_KLANG_VALLEY
    : recorded;
}

/**
 * THE ONE SUPPLIER PROJECTION (Card 02-C §7). The `Supplier` column and the
 * `SUPPLIER` rail section both ask THIS function — the resolved
 * outstanding-demand suppliers plus the issued PO lineage suppliers — so the
 * rail can never learn a supplier the column does not print, and there is no
 * second browser-only supplier calculation.
 */
export function soBatchOrderSupplierNames(o: SoBatchOrderRow): (string | null)[] {
  return [...o.outstandingSuppliers, ...o.pos.map((p) => p.supplierName)];
}

/**
 * Units on one Sales Order line that still have no committed coverage.
 *
 * This is the one `All not ordered` arithmetic: customer quantity less the
 * Ready Stock ledger draw and less exact, non-cancelled PO lineage. A generic
 * open-PO SKU pool may suppress today's issue leaf, but it cannot claim that a
 * particular Sales Order was ordered when no `po_line_sources` row says so.
 */
export function soBatchOrderLineOutstandingQty(
  line: Pick<SoBatchOrderLineFact, "qty" | "stockTaken" | "pos">,
): number {
  const required = Math.max(0, line.qty - line.stockTaken);
  const linked = line.pos.reduce((sum, po) => sum + Math.max(0, po.qty), 0);
  return Math.max(0, required - linked);
}

/**
 * One Sales Order's rail-relevant facts, derived once from the server's own
 * rows — the leaf states the engine computed, the Catalog categories on the
 * order's lines (never SKU-text inference), and the Register's own supplier
 * projection. This file combines and counts them; it derives nothing new.
 */
export interface SoBatchRailFacts {
  orderId: string;
  /** Has quantity without Ready Stock or exact PO lineage. */
  outstanding: boolean;
  /** Every leaf state under this order. */
  states: ReadonlySet<PurchaseDemandState>;
  /** The CATALOG's categories on the order's lines. */
  categories: ReadonlySet<ProductCategory>;
  /** `soBatchOrderSupplierNames`, deduplicated. */
  suppliers: ReadonlySet<string>;
  /** Region derived only from the order's recorded Delivery State. */
  region: string;
}

export function soBatchRailFacts(
  orders: readonly SoBatchOrderRow[],
  leafs: readonly PurchaseDemandRow[],
): SoBatchRailFacts[] {
  const statesByOrder = new Map<string, Set<PurchaseDemandState>>();
  for (const r of leafs) {
    let s = statesByOrder.get(r.orderId);
    if (!s) {
      s = new Set();
      statesByOrder.set(r.orderId, s);
    }
    s.add(r.state);
  }
  return orders.map((o) => ({
    orderId: o.orderId,
    outstanding: o.lines.some((line) => soBatchOrderLineOutstandingQty(line) > 0),
    states: statesByOrder.get(o.orderId) ?? new Set(),
    categories: new Set(
      o.lines
        .map((l) => l.category)
        .filter((c): c is ProductCategory => c != null),
    ),
    suppliers: new Set(
      soBatchOrderSupplierNames(o).filter((s): s is string => s != null && s !== ""),
    ),
    region: soBatchRegionName(o.deliveryState),
  }));
}

type SoBatchRailSection =
  | "toOrder"
  | "timing"
  | "product"
  | "supplier"
  | "region"
  | "setup";

/** Does this order pass every selected section — except, optionally, one? */
function railMatches(
  f: SoBatchRailFacts,
  filter: SoBatchRailFilter,
  except?: SoBatchRailSection,
): boolean {
  if (except !== "toOrder" && filter.notOrderedOnly && !f.outstanding) return false;
  if (except !== "timing" && filter.timing != null && !f.states.has(filter.timing)) {
    return false;
  }
  if (except !== "product" && filter.product != null && !f.categories.has(filter.product)) {
    return false;
  }
  if (except !== "supplier" && filter.supplier != null && !f.suppliers.has(filter.supplier)) {
    return false;
  }
  if (except !== "region" && filter.region != null && f.region !== filter.region) return false;
  if (except !== "setup" && filter.setup && !f.states.has("no_production_days")) return false;
  return true;
}

/**
 * WHAT THE RAIL PRINTS (Card 02-C §§7–8). Every count is UNIQUE Sales Orders —
 * never SKU quantities, demand lines, POs or notifications — and every
 * section's counts are computed under the OTHER sections' selections, so the
 * printed number predicts exactly the rows a click would show. The fixed rows
 * print their live count, zero included; a supplier row exists only while it
 * matches, except the selected supplier, which stays visible with `0`.
 */
export interface SoBatchRailModel {
  /** Orders passing every selected filter — what the Register shows. */
  visibleOrderIds: ReadonlySet<string>;
  notOrderedCount: number;
  timingCounts: Record<PurchaseDemandTimingState, number>;
  productCounts: Record<SoBatchProductCategory, number>;
  /** Actual names, alphabetical. Never hardcoded, never a placeholder. */
  suppliers: Array<{ name: string; count: number }>;
  /** Delivery regions, Klang Valley first and missing state last. */
  regions: Array<{ name: string; count: number }>;
  setupCount: number;
  /** Whether `SETUP TO FIX` renders at all: any affected Sales Order exists. */
  setupExists: boolean;
}

export function soBatchRailModel(
  facts: readonly SoBatchRailFacts[],
  filter: SoBatchRailFilter,
): SoBatchRailModel {
  const count = (section: SoBatchRailSection, has: (f: SoBatchRailFacts) => boolean) =>
    facts.filter((f) => railMatches(f, filter, section) && has(f)).length;

  const timingCounts = {} as Record<PurchaseDemandTimingState, number>;
  for (const s of PURCHASE_DEMAND_TIMING_STATES) {
    timingCounts[s] = count("timing", (f) => f.states.has(s));
  }
  const productCounts = {} as Record<SoBatchProductCategory, number>;
  for (const c of SO_BATCH_RAIL.product.categories) {
    productCounts[c.category] = count("product", (f) => f.categories.has(c.category));
  }

  const supplierCounts = new Map<string, number>();
  for (const f of facts) {
    if (!railMatches(f, filter, "supplier")) continue;
    for (const name of f.suppliers) {
      supplierCounts.set(name, (supplierCounts.get(name) ?? 0) + 1);
    }
  }
  /* The selected supplier stays visible with 0 while another section
     temporarily removes its matches — a filter the operator cannot see is a
     narrowing they cannot clear. */
  if (filter.supplier != null && !supplierCounts.has(filter.supplier)) {
    supplierCounts.set(filter.supplier, 0);
  }

  const regionCounts = new Map<string, number>();
  for (const f of facts) {
    if (!railMatches(f, filter, "region")) continue;
    regionCounts.set(f.region, (regionCounts.get(f.region) ?? 0) + 1);
  }
  if (filter.region != null && !regionCounts.has(filter.region)) {
    regionCounts.set(filter.region, 0);
  }
  const regionOrder = (name: string) => {
    if (name === SO_BATCH_KLANG_VALLEY) return -1;
    if (name === SO_BATCH_OTHER_REGION) return 1;
    return 0;
  };

  return {
    visibleOrderIds: new Set(
      facts.filter((f) => railMatches(f, filter)).map((f) => f.orderId),
    ),
    notOrderedCount: count("toOrder", (f) => f.outstanding),
    timingCounts,
    productCounts,
    suppliers: [...supplierCounts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    regions: [...regionCounts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => regionOrder(a.name) - regionOrder(b.name) || a.name.localeCompare(b.name)),
    setupCount: count("setup", (f) => f.states.has("no_production_days")),
    setupExists: facts.some((f) => f.states.has("no_production_days")),
  };
}

// ─── The Register row — one proceeded Sales Order (Card 02-B) ────────────────

/**
 * THE PERMANENT PURCHASING REGISTER (Card 02-B, owner ruling 2026-08-27;
 * `docs/purchasing/MASTER.md` §9.1).
 *
 * The right Register shows ONE ROW PER PROCEEDED PHYSICAL-GOODS SALES ORDER,
 * and the row never leaves when a purchase order is issued — the page is both
 * the buying surface and the permanent purchasing audit register. The leaf
 * demand rows (`PurchaseDemandRow`) remain the ONLY selection and issue
 * contract; the order row is presentation and aggregation over them plus the
 * authoritative PO lineage.
 *
 * ── STATUS IS DERIVED, NEVER STORED ─────────────────────────────────────────
 *
 * Three visible values — blank · `Partial` · `Ordered` — derived from exactly
 * two server quantities:
 *
 *   buyingRequiredQty   units that genuinely require purchasing
 *                       (demanded minus Ready-Stock coverage)
 *   sentCoveredQty      units of that requirement covered by a NON-CANCELLED
 *                       purchase order whose CURRENT PDF version has
 *                       confirmed-sent evidence (`po_sends.kind =
 *                       'confirmed_sent'` at `COALESCE(version, 1)`)
 *
 * `external_open` never counts. Supplier silence changes nothing. A numbered
 * but unsent PO leaves Status blank while appearing under `PO No`. A new
 * revision without its own confirmed send invalidates older-version
 * completeness. A Sales Order covered entirely by Ready Stock has nothing that
 * requires purchasing, so it is blank — visible, and unselectable.
 */
export type SoBatchOrderStatus = "blank" | "partial" | "ordered";

/** The visible Status words. Blank is BLANK — never `No buying needed`. */
export const SO_BATCH_ORDER_STATUS_WORDS: Record<SoBatchOrderStatus, string> = {
  blank: "",
  partial: "Partial",
  ordered: "Ordered",
};

export function soBatchOrderStatusOf(f: {
  buyingRequiredQty: number;
  sentCoveredQty: number;
}): SoBatchOrderStatus {
  if (f.buyingRequiredQty <= 0) return "blank";
  if (f.sentCoveredQty <= 0) return "blank";
  if (f.sentCoveredQty >= f.buyingRequiredQty) return "ordered";
  return "partial";
}

/** One linked purchase order, through `po_line_sources` lineage ONLY. */
export interface SoBatchOrderPoFact {
  /** The PO number — `purchase_orders.id`. */
  poId: string;
  /** Cancelled POs never reach this list at all. */
  status: "open" | "received";
  supplierId: string | null;
  supplierName: string | null;
  /** The destination the ISSUED document actually carries. */
  destinationId: string | null;
  /**
   * `purchase_orders.official_delivery_date` — the ORIGINAL supplier-facing
   * date, stamped at birth and never changed (0428/0430, MASTER §5.7).
   *
   * It is deliberately NOT `eta_date`: that is the LIVE planning arrival and
   * the ready-date door recomputes it, so a register drawing it would show a
   * "PO Delivery Date" that silently MOVED after the supplier was sent the
   * paper. `null` is a real answer — a PO whose original the 0428 recovery
   * could not evidence is recorded as unknown, and is printed as an absence
   * rather than back-filled from today's planning date.
   */
  officialDeliveryDate: IsoDate | null;
  /** TRUE = the current PDF version has confirmed-sent evidence. */
  sentCurrentVersion: boolean;
}

/**
 * One procurable customer line of the order, with its Ready-Stock coverage and
 * its exact PO lineage — the expansion's mapping truth. Quantities are SKU
 * units throughout, the same unit `po_line_sources.qty` speaks.
 */
export interface SoBatchOrderLineFact {
  orderLineId: string;
  sku: string;
  /** What the customer ordered on this line. */
  qty: number;
  /** Units already covered by Ready Stock (the pool ledger's own number). */
  stockTaken: number;
  item: string;
  variant: string | null;
  category: ProductCategory | null;
  /** Exact lineage: which POs cover this line, and how many units each. */
  pos: Array<{ poId: string; qty: number }>;
}

/** One right-Register row: one proceeded physical-goods Sales Order. */
export interface SoBatchOrderRow {
  orderId: string;
  so: number | null;
  customer: string | null;
  status: SoBatchOrderStatus;
  /** `orders.proceeded_at` — the actual Sales → Operations handoff. */
  proceededAt: string | null;
  /** `orders.delivery_date` — the customer's current request. */
  requestedDeliveryDate: IsoDate | null;
  /** The customer's delivery locality, formatted by the shared web rule. */
  deliveryCity: string | null;
  deliveryState: string | null;
  /** Non-cancelled lineage POs, sorted by PO number. */
  pos: SoBatchOrderPoFact[];
  lines: SoBatchOrderLineFact[];
  /** Suppliers resolved for the OUTSTANDING demand — the pre-issue answer. */
  outstandingSuppliers: string[];
}

export const soBatchOrderRowSchema = z.object({
  orderId: z.string(),
  so: z.number().nullable(),
  customer: z.string().nullable(),
  status: z.enum(["blank", "partial", "ordered"]),
  proceededAt: z.string().nullable(),
  requestedDeliveryDate: z.string().nullable(),
  deliveryCity: z.string().nullable(),
  deliveryState: z.string().nullable(),
  pos: z.array(
    z.object({
      poId: z.string(),
      status: z.enum(["open", "received"]),
      supplierId: z.string().nullable(),
      supplierName: z.string().nullable(),
      destinationId: z.string().nullable(),
      officialDeliveryDate: z.string().nullable(),
      sentCurrentVersion: z.boolean(),
    }),
  ),
  lines: z.array(
    z.object({
      orderLineId: z.string(),
      sku: z.string(),
      qty: z.number(),
      stockTaken: z.number(),
      item: z.string(),
      variant: z.string().nullable(),
      category: z
        .enum(["mattress", "bedframe", "sofa", "accessory", "service", "guarantee"])
        .nullable(),
      pos: z.array(z.object({ poId: z.string(), qty: z.number() })),
    }),
  ),
  outstandingSuppliers: z.array(z.string()),
});

/**
 * A parent cell's deterministic answer over a set of values. `none` prints the
 * grid's own `—`; `one` prints the value; `many` prints a compact summary —
 * `2 POs`, `2 suppliers`, `Multiple` — and the exact mapping lives in the
 * expansion. Values are deduplicated and sorted so two refreshes cannot
 * summarise one Sales Order two ways.
 */
export type SoBatchCellSummary =
  | { kind: "none" }
  | { kind: "one"; value: string }
  | { kind: "many"; count: number; values: string[] };

export function soBatchCellSummary(values: readonly (string | null)[]): SoBatchCellSummary {
  const distinct = [...new Set(values.filter((v): v is string => v != null && v !== ""))].sort(
    (a, b) => a.localeCompare(b),
  );
  if (distinct.length === 0) return { kind: "none" };
  if (distinct.length === 1) return { kind: "one", value: distinct[0]! };
  return { kind: "many", count: distinct.length, values: distinct };
}

/**
 * THE PARENT SELECTION LAW (Card 02-B §6). The parent checkbox represents ALL
 * eligible uncovered child demand under its Sales Order:
 *
 *   no eligible child   → unselectable (Ordered, or fully Ready-Stock covered)
 *   all selected        → checked
 *   some selected       → indeterminate
 *
 * `eligible` is `isSelectableForBuying` over the SAME leaf rows the issue
 * journey consumes — there is no second eligibility rule.
 */
export function soBatchOrderSelection(f: {
  eligibleIds: readonly string[];
  selectedIds: ReadonlySet<string>;
}): { selectable: boolean; checked: boolean; indeterminate: boolean } {
  const selectable = f.eligibleIds.length > 0;
  const on = f.eligibleIds.filter((id) => f.selectedIds.has(id)).length;
  return {
    selectable,
    checked: selectable && on === f.eligibleIds.length,
    indeterminate: on > 0 && on < f.eligibleIds.length,
  };
}

// ─── The wire: the SO Batch Purchase read ────────────────────────────────────

/**
 * THE SO BATCH PURCHASE READ (Card 02 §7.1; Card 02-B §8).
 *
 * `rows` remains the authoritative leaf truth — expansion, coverage,
 * destination allocation, selection and Issue PO all run on it, unchanged.
 * `registerRows` is ADDITIVE: the parent presentation and aggregation, one row
 * per proceeded Sales Order, composed by the same one server read.
 *
 * The rest: where goods may be sent, which of those is the standing default,
 * who currently holds PO Duty, who is covering it today, and whether THIS
 * reader may issue. `mayIssue` is a convenience — the API and the creation RPC
 * both refuse an unauthorised issue whatever the browser believes (Card §6;
 * 0379).
 */
export const soBatchPurchaseResponseSchema = z.object({
  today: z.string(),
  rows: z.array(purchaseDemandRowSchema),
  /** Card 02-B — one row per proceeded physical-goods Sales Order. */
  registerRows: z.array(soBatchOrderRowSchema),
  destinations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isDefault: z.boolean(),
      active: z.boolean(),
    }),
  ),
  defaultDestinationId: z.string().nullable(),
  /** The month's normal holder. `Team Work` groups by this person. */
  currentPoDuty: z.object({ userId: z.string(), name: z.string() }).nullable(),
  /**
   * ⭐ 0379 — the dated buddy cover who may act TODAY, when one is set. It is a
   * separate fact from the holder on purpose: the duty stays where management
   * put it, and the audit must still say who actually pressed Issue PO.
   */
  actingPoDuty: z.object({ userId: z.string(), name: z.string() }).nullable(),
  /**
   * A holder/cover ID exists, but its display name could not be resolved.
   * This is different from there being no configured PO duty holder.
   */
  poDutyNameUnavailable: z.boolean(),
  /** The authoritative duty resolver itself could not be read. */
  poDutyUnavailable: z.boolean(),
  mayIssue: z.boolean(),
  /** Who may collect from a factory, for the documents that need one. */
  procurementPartners: z.array(z.object({ id: z.string(), name: z.string() })),
  /**
   * Card 02-A — the governed Safety days value (`order_by_buffer_days`), so
   * the safety-band words follow the one setting instead of a hard-coded 14.
   * The browser only PRINTS it; the arithmetic stays on the server.
   */
  safetyDays: z.number().int(),
});

export type SoBatchPurchaseResponse = z.infer<typeof soBatchPurchaseResponseSchema>;

// ─── Destinations ────────────────────────────────────────────────────────────

export interface PurchasingDestination {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
}

export const purchasingDestinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  active: z.boolean(),
});

// ─── Selection ───────────────────────────────────────────────────────────────

export interface DestinationAllocation {
  destinationId: string;
  qty: number;
}

export interface SoBatchSelection {
  demandId: string;
  allocations: DestinationAllocation[];
}

/**
 * Whether this row may be ticked at all.
 *
 * Five conditions, and every one of them is the SERVER's fact: the state it
 * derived, the remainder it computed, the supplier it resolved and the build
 * reference it will accept back. A row missing any of them cannot be turned
 * into a purchase order, so offering a tick-box would be offering an act that
 * fails — the Register refuses it here and the API refuses it again.
 *
 * EVERY timing state is selectable (Card 02-A): the timing rows express risk,
 * never `Cannot buy`, and Order By is a planned date, not an unlock date.
 */
export function isSelectableForBuying(row: PurchaseDemandRow): boolean {
  return (
    isPurchaseDemandTimingState(row.state) &&
    row.toBuy != null &&
    row.toBuy > 0 &&
    row.supplierId != null &&
    row.issueRef != null
  );
}

/**
 * Whether this row may be ticked ON THIS ORDER.
 *
 * `isSelectableForBuying` judges the DEMAND. This adds the one fact the demand
 * cannot see: whether the order it belongs to has already bought everything it
 * needed.
 *
 * WHY THE ROW ARITHMETIC IS NOT ENOUGH (YH, 2026-09-03 — "an ordered's
 * checkbox still tickable"). The two numbers are computed from different
 * facts and are allowed to disagree:
 *
 *   Status   per order line, `qty - stockTaken` against the units carried by
 *            this order's OWN `po_line_sources` lineage on confirmed-sent
 *            purchase orders. Customer-attributed and exact.
 *   `toBuy`  the engine's remainder, drained from a per-SKU pool with NO
 *            customer attribution.
 *
 * So an order whose own documents cover every unit it required could still
 * carry a leaf with `toBuy > 0`, and the checkbox appeared beside an `Ordered`
 * pill. Ticking it raises a SECOND purchase order for units this order has
 * already bought and sent — the one duplication the pooled arithmetic cannot
 * rule out on its own, because only lineage knows whose units they are.
 *
 * IT FAILS OPEN, deliberately. `ordered` requires lineage, and lineage exists
 * only from migration 0382 with no backfill. An order whose purchase orders
 * predate it scores `sentCoveredQty` 0, reads `blank`, and stays tickable —
 * which is right: nothing has PROVEN those units were bought for this
 * customer. This gate can therefore never hide genuine demand; it only refuses
 * a buy the order's own documents already account for.
 */
export function isSelectableForOrder(
  row: PurchaseDemandRow,
  orderStatus: SoBatchOrderStatus,
): boolean {
  return orderStatus !== "ordered" && isSelectableForBuying(row);
}

/** Everything to Carres Klang — the standing Purchasing default (MASTER §5.4). */
export function defaultAllocations(
  row: PurchaseDemandRow,
  defaultDestinationId: string,
): DestinationAllocation[] {
  const qty = row.toBuy ?? 0;
  if (qty <= 0) return [];
  return [{
    destinationId: row.supplierCollection?.fixedDestinationId ?? defaultDestinationId,
    qty,
  }];
}

/**
 * The whole row moves. Returns a NEW selection — the caller's array is left
 * alone, because a React state object that is mutated in place is a re-render
 * that never happens.
 */
export function setDestination(
  selection: SoBatchSelection,
  destinationId: string,
  qty: number,
): SoBatchSelection {
  return {
    demandId: selection.demandId,
    allocations: qty > 0 ? [{ destinationId, qty }] : [],
  };
}

/**
 * The inline split. Two lines aimed at one destination are MERGED and an empty
 * line is dropped — a purchase order that named the same place twice, or named
 * a place it sends nothing to, would be a document nobody could read.
 */
export function splitAllocation(
  selection: SoBatchSelection,
  allocations: readonly DestinationAllocation[],
): SoBatchSelection {
  const merged = new Map<string, number>();
  for (const a of allocations) {
    if (a.qty <= 0) continue;
    merged.set(a.destinationId, (merged.get(a.destinationId) ?? 0) + a.qty);
  }
  return {
    demandId: selection.demandId,
    allocations: [...merged].map(([destinationId, qty]) => ({ destinationId, qty })),
  };
}

export type AllocationCheck = { ok: true } | { ok: false; message: string };

/**
 * The one check this module owns: **does the arrangement add back to the
 * number the server gave us?**
 *
 * It is deliberately unable to compute the target. `row.toBuy` is read, never
 * derived; if the server changes its mind, this check changes with it, and the
 * API repeats the whole thing after its own recomputation anyway. The message
 * prints both numbers because an operator fixing a split needs to know the gap,
 * not that there is one.
 */
export function validateAllocations(
  row: PurchaseDemandRow,
  allocations: readonly DestinationAllocation[],
  destinations: readonly PurchasingDestination[],
): AllocationCheck {
  if (!isSelectableForBuying(row)) {
    return { ok: false, message: "This line cannot be bought yet." };
  }
  const target = row.toBuy ?? 0;
  if (allocations.length === 0) {
    return { ok: false, message: `Choose where the ${target} go.` };
  }
  const byId = new Map(destinations.map((d) => [d.id, d]));
  let total = 0;
  for (const a of allocations) {
    const dest = byId.get(a.destinationId);
    if (!dest) return { ok: false, message: "Choose a Deliver To that exists." };
    if (!dest.active) {
      return { ok: false, message: `${dest.name} is closed. Choose another Deliver To.` };
    }
    if (!Number.isInteger(a.qty) || a.qty <= 0) {
      return { ok: false, message: `${dest.name} needs a whole number above zero.` };
    }
    total += a.qty;
  }
  if (total !== target) {
    return { ok: false, message: `${total} of ${target} arranged.` };
  }
  return { ok: true };
}

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * ⭐ THE ONE DOCUMENT PARTITION — used by the browser AND the server.
 *
 * Four parts, and every one of them is load-bearing:
 *
 *   supplier      one PO has one supplier
 *   destination   one PO has one `Deliver To` (Card §4.2)
 *   category      a proposal is supplier × category, so a supplier's
 *                 mattresses and its bedframes are already separate documents
 *   source order  a SOFA is ONE PO PER CUSTOMER ORDER (locked 2026-07-27) —
 *                 a matched set is made and delivered together
 *
 * ── WHY THIS FUNCTION EXISTS AT ALL ─────────────────────────────────────────
 *
 * Measured 2026-08-24: the browser grouped by supplier × destination and the
 * server grouped by all four. So the operator could review ONE document, press
 * Issue, and be handed THREE. The reviewed PO count did not match what the
 * server created.
 *
 * A shared function is the only fix that stays fixed. Both sides now compute
 * the same key from the same facts, so `Issue N POs`, `1 of N`, the server's
 * grouping and `pos.length` cannot drift apart. The server still recomputes it
 * from its own recomputation — this is
 * agreement, not trust.
 */
export function documentPartitionKey(f: {
  supplierId: string;
  destinationId: string;
  category: ProductCategory | null;
  orderId: string;
}): string {
  /* A sofa is one PO per customer order; everything else consolidates across
     orders inside its category. */
  const perOrder = f.category != null && isOnePoPerOrder(f.category);
  return [
    f.supplierId,
    f.destinationId,
    f.category ?? "uncatalogued",
    perOrder ? f.orderId : "",
  ].join("::");
}

export interface SoBatchDocumentLine {
  demandId: string;
  orderId: string;
  so: number | null;
  item: string;
  variant: string | null;
  skus: string[];
  qty: number;
  goodsMustArrive: string | null;
  issueRef: { proposalKey: string; buildKey: string };
  /** The parts this line puts on the document — one per SKU, with the quantity
   *  the factory must make and the catalog cost behind it. */
  parts: Array<{ sku: string; qty: number; unitCost: number | null }>;
}

export interface SoBatchDocument {
  /** The four-part partition key (`documentPartitionKey`). */
  key: string;
  supplierId: string;
  supplierName: string | null;
  destinationId: string;
  /** Part of the partition, and what the server groups on. */
  category: ProductCategory | null;
  /** Set only when this category is one-PO-per-customer-order (sofa). */
  orderId: string | null;
  qty: number;
  lines: SoBatchDocumentLine[];
  /** Factory pickup needs a procurement partner before this can be issued. */
  supplierKind: "own_logistics" | "factory_pickup" | null;
  /** The governed factory-collection rule, shown as a read-only fact. */
  supplierCollection?: PurchaseDemandRow["supplierCollection"];
}

/**
 * The documents the operator is about to create, in the order their first line
 * was selected — so `1 of 3` means the same thing on every screen.
 *
 * A selection whose row is unknown or unbuyable is SKIPPED rather than guessed
 * at: a stale tick from before a refetch must not become a purchase order.
 */
export function groupSelectionsIntoDocuments(
  selections: readonly SoBatchSelection[],
  rowsById: ReadonlyMap<string, PurchaseDemandRow>,
): SoBatchDocument[] {
  const docs = new Map<string, SoBatchDocument>();
  for (const selection of selections) {
    const row = rowsById.get(selection.demandId);
    if (!row || !isSelectableForBuying(row) || row.supplierId == null || !row.issueRef) {
      continue;
    }
    for (const a of selection.allocations) {
      if (a.qty <= 0) continue;
      const key = documentPartitionKey({
        supplierId: row.supplierId,
        destinationId: a.destinationId,
        category: row.category,
        orderId: row.orderId,
      });
      let doc = docs.get(key);
      if (!doc) {
        doc = {
          key,
          supplierId: row.supplierId,
          supplierName: row.supplier,
          destinationId: a.destinationId,
          category: row.category,
          orderId:
            row.category != null && isOnePoPerOrder(row.category) ? row.orderId : null,
          qty: 0,
          lines: [],
          supplierKind: row.supplierKind,
          supplierCollection: row.supplierCollection ?? null,
        };
        docs.set(key, doc);
      }
      doc.qty += a.qty;
      doc.lines.push({
        demandId: row.id,
        orderId: row.orderId,
        so: row.so,
        item: row.item,
        variant: row.variant,
        skus: row.skus,
        qty: a.qty,
        goodsMustArrive: row.goodsMustArrive,
        issueRef: row.issueRef,
        parts: row.parts,
      });
    }
  }
  return [...docs.values()];
}

// ─── The selection bar ───────────────────────────────────────────────────────

export interface SoBatchSelectionSummary {
  lines: number;
  units: number;
  documents: number;
  /** Empty when nothing is selected — a bar that says `0 selected` is noise. */
  text: string;
}

export function soBatchSelectionSummary(
  selections: readonly SoBatchSelection[],
  rowsById: ReadonlyMap<string, PurchaseDemandRow>,
): SoBatchSelectionSummary {
  const documents = groupSelectionsIntoDocuments(selections, rowsById);
  const lines = new Set(documents.flatMap((d) => d.lines.map((l) => l.demandId))).size;
  const units = documents.reduce((s, d) => s + d.qty, 0);
  if (lines === 0) return { lines: 0, units: 0, documents: 0, text: "" };
  return {
    lines,
    units,
    documents: documents.length,
    text: `${lines} selected · ${units} ${units === 1 ? "unit" : "units"} · Issue ${
      documents.length
    } ${documents.length === 1 ? "PO" : "POs"}`,
  };
}

// ─── The wire ────────────────────────────────────────────────────────────────

export const destinationAllocationSchema = z.object({
  destinationId: z.string().uuid(),
  qty: z.number().int().positive(),
});

export const soBatchSelectionSchema = z.object({
  demandId: z.string().min(1),
  allocations: z.array(destinationAllocationSchema).min(1),
});

// ─── The lines one document actually carries ─────────────────────────────────

/** One customer order's claim on a purchase-order line (0382). */
export interface PoLineSource {
  orderId: string;
  /** The customer-facing number. `null` on an order that has none yet. */
  so: number | null;
  /** `order_lines.id` — validated against its order in SQL, never trusted. */
  orderLineId: string;
  qty: number;
}

/** One line of one purchase order, with the lineage behind every unit. */
export interface PoDocumentLine {
  sku: string;
  qty: number;
  /** The catalog cost the engine read for this SKU. `null` = Catalog has none. */
  cost: number | null;
  /** Which customer order each unit is for. Sums to `qty`, always. */
  sources: PoLineSource[];
}

/** What the caller allocated to ONE document, per demand. */
export interface PoDocumentAllocation {
  /** The build behind this demand — the thing being made. */
  build: {
    key: string;
    /** Units the server says are still to buy on this build. */
    qty: number;
    lines: readonly { lineId: string; sku: string; qty: number; cost: number | null }[];
  };
  orderId: string;
  so: number | null;
  /** Units of that build going to THIS document's destination. */
  qty: number;
}

export type PoDocumentLines =
  | { ok: true; lines: PoDocumentLine[] }
  | { ok: false; code: "nothing_to_issue" | "partial_split_not_allowed" };

/**
 * COMPOSE ONE DOCUMENT'S LINES FROM WHAT WAS ALLOCATED TO IT — not from the
 * whole build (Card closure §4 · §5; 0382).
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 *
 * Measured 2026-08-24: the issue endpoint grouped allocations into documents
 * and then asked `planFromDocuments` for each group's lines. That function
 * answers *what does this BUILD contain*, so a build of 11 split 10 + 1 across
 * two destinations produced **two purchase orders of 11** — 22 units bought for
 * an 11-unit demand. The split the Card promised was the one thing that broke
 * it.
 *
 * Lines are therefore composed from the ALLOCATION. And because the aggregate
 * loses which customer each unit belongs to, the lineage is composed with it in
 * the same pass — one walk, so a line and its sources cannot disagree.
 *
 * ── AND A SET IS NOT SPLIT ──────────────────────────────────────────────────
 *
 * A build of several order lines is a matched set: a sofa's modules are made
 * and delivered together (locked 2026-07-27). Its `qty` is 1, so a partial
 * allocation cannot arise from the arrangement rules — but a hand-made request
 * could ask for one, and there is no honest way to cut two modules in half.
 * It is refused by name rather than guessed at.
 */
export function composeDocumentLines(
  allocations: readonly PoDocumentAllocation[],
): PoDocumentLines {
  const bySku = new Map<string, PoDocumentLine>();
  for (const a of allocations) {
    if (a.qty <= 0) continue;
    const buildLines = a.build.lines;
    if (buildLines.length === 0) continue;
    /* A SET GOES WHOLE OR NOT AT ALL. */
    if (buildLines.length > 1 && a.qty !== a.build.qty) {
      return { ok: false, code: "partial_split_not_allowed" };
    }
    for (const l of buildLines) {
      /* One line: the allocation IS the quantity. A set: the line's own,
         because the whole set is on this document. */
      const qty = buildLines.length === 1 ? a.qty : l.qty;
      if (qty <= 0) continue;
      let hit = bySku.get(l.sku);
      if (!hit) {
        hit = { sku: l.sku, qty: 0, cost: l.cost, sources: [] };
        bySku.set(l.sku, hit);
      }
      hit.qty += qty;
      hit.sources.push({
        orderId: a.orderId,
        so: a.so,
        orderLineId: l.lineId,
        qty,
      });
    }
  }
  const lines = [...bySku.values()];
  if (lines.length === 0) return { ok: false, code: "nothing_to_issue" };
  return { ok: true, lines };
}
