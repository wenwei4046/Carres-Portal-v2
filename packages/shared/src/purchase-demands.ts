import { z } from "zod";
import { countWorkingDays, type IsoDate } from "./working-days";
import type { ProductCategory } from "./db-types";
import { isOnePoPerOrder, categoryLabel } from "./to-order";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";

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
  colCustomerDelivery: "Requested Delivery Date",
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

// ─── The states — owner correction 2026-08-26 ────────────────────────────────

/**
 * THE ORDER TIMING CATEGORIES (Card 02-A; `docs/purchasing/MASTER.md` §9.1).
 *
 * Every one of them is ORDERABLE — the words say timing risk, never
 * `Cannot buy`, and Order By is a planned date, not an unlock date. They are
 * derived from the one server planning engine (`purchaseDemandTimingOf`
 * below, over the engine's own dates); there is no stored status.
 */
export type PurchaseDemandTimingState =
  | "can_order_early"
  | "safety_days_full"
  | "safety_days_low"
  | "safety_days_none"
  | "not_enough_production_time";

/**
 * The blockers. `no_production_days` and `no_pickup_partner` are the
 * Purchasing-owned setup blockers; the other three belong to Sales/Catalog and
 * are named on their own rows, never as Purchasing rail facets.
 */
export type PurchaseDemandBlockerState =
  | "no_customer_date"
  | "no_sku"
  | "no_supplier"
  | "no_cost"
  | "no_production_days"
  /** The supplier is collected from the factory and no collector is set. */
  | "no_pickup_partner";

export type PurchaseDemandState = PurchaseDemandTimingState | PurchaseDemandBlockerState;

/** The approved rail order of the `ORDER TIMING` section. */
export const PURCHASE_DEMAND_TIMING_STATES: readonly PurchaseDemandTimingState[] = [
  "can_order_early",
  "safety_days_full",
  "safety_days_low",
  "safety_days_none",
  "not_enough_production_time",
] as const;

export const PURCHASE_DEMAND_STATES: readonly PurchaseDemandState[] = [
  ...PURCHASE_DEMAND_TIMING_STATES,
  "no_customer_date",
  "no_sku",
  "no_supplier",
  "no_cost",
  "no_production_days",
  "no_pickup_partner",
] as const;

export function isPurchaseDemandTimingState(v: unknown): v is PurchaseDemandTimingState {
  return (
    typeof v === "string" &&
    (PURCHASE_DEMAND_TIMING_STATES as readonly string[]).includes(v)
  );
}

/**
 * The FACT line — line 1 of the governed two-line treatment.
 *
 * A FUNCTION of the governed Safety days value, not a constant: the two
 * safety-band words carry the number (`14 safety days left`), and a screen
 * that hard-coded 14 would lie the day the setting moved. The visible term is
 * `Safety days`; `buffer` never reaches a screen.
 */
export function purchaseDemandStateWords(
  safetyDays: number,
): Record<PurchaseDemandState, string> {
  return {
    can_order_early: "Can order early",
    safety_days_full: `${safetyDays} safety days left`,
    safety_days_low: `1–${Math.max(safetyDays - 1, 1)} safety days left`,
    safety_days_none: "No safety days left",
    /* Card 02-C (owner ruling 2026-08-27): `days`, never `time` — the same
       unit the arithmetic itself counts in. The state KEY keeps its wire
       spelling; only the visible words changed. */
    not_enough_production_time: "Not enough production days",
    no_customer_date: "Customer delivery date is missing",
    no_sku: "SKU not found",
    no_supplier: "Supplier not assigned",
    no_cost: "Catalog cost is missing",
    no_production_days: "Production days are missing",
    no_pickup_partner: "Collection is not configured",
  };
}

/**
 * The RAIL facets — the timing rows plus the one Purchasing-owned setup row.
 * A state absent here is a row fact, not a facet: a line Sales/Catalog let
 * through without its date, SKU or supplier is named on its row and fails
 * safely at its owning boundary (Card 02-A §5).
 */
export function purchaseDemandRailWords(
  safetyDays: number,
): Partial<Record<PurchaseDemandState, string>> {
  const words = purchaseDemandStateWords(safetyDays);
  return {
    can_order_early: words.can_order_early,
    safety_days_full: words.safety_days_full,
    safety_days_low: words.safety_days_low,
    safety_days_none: words.safety_days_none,
    not_enough_production_time: words.not_enough_production_time,
    no_production_days: "Production days not set",
  };
}

/**
 * The OWNER RULE per blocker (card §4). A name resolves where a stored fact
 * carries one; where none does, the DUTY WORD stands — the Work Engine's own
 * law (`work-engine.ts` `ownerDuty`), never a hand-picked person.
 */
export const PURCHASE_DEMAND_OWNER_DUTY: Record<PurchaseDemandState, string | null> = {
  can_order_early: null,
  safety_days_full: null,
  safety_days_low: null,
  safety_days_none: null,
  not_enough_production_time: null,
  no_customer_date: "Responsible Salesperson",
  no_sku: "PO duty",
  no_supplier: "PO duty",
  no_cost: "PO duty",
  no_production_days: "Purchasing Settings",
  no_pickup_partner: "Purchasing Settings",
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
  /**
   * CARD-2026-08-22-purchasing-02 — the date the goods must physically reach
   * Carres, CARRIED off the server's own arrival engine (`ToOrderRow.stockReady`
   * → `arriveBy`). The browser never subtracts a working day: the office week,
   * the holidays, the supplier's production days and the arrival buffer are all
   * server facts, and a second subtraction here would be a second answer.
   *
   * `null` when the customer order has no date to plan backwards from.
   */
  goodsMustArrive: IsoDate | null;
  /**
   * The engine reference an issue is actually built from. `null` on any line
   * the engine refused — which is precisely why such a line cannot be issued:
   * there is no build to turn into a purchase order.
   */
  issueRef: { proposalKey: string; buildKey: string } | null;
  /** The structured Work contract. `null` when nothing is owed on this line. */
  action: SoBatchPurchaseAction | null;
  /**
   * THE CATALOG COST PER SKU, so the 50/50 can ask for the one it does not have
   * (Card §5.2). `unitCost: null` is the whole point: a SKU Catalog has no price
   * for cannot be issued until the operator states a Transaction Cost or marks
   * it Free of Charge with a reason. A `0` here would be a price nobody set.
   *
   * It is the CATALOG's number, carried for display and for the unchanged-cost
   * comparison. The server re-reads it at issue and refuses a stale one.
   */
  /**
   * ⭐ THE PARTS INSIDE THIS BUYING LINE — one entry per SKU.
   *
   * A row is one BUILD, and a build can be a matched set: a sofa is one row and
   * three module codes. The row itself can only name the set, so this is where
   * the modules live and the issue authority can validate their Catalog cost.
   *
   * It was called `costs` and carried only the price, so the expand had no
   * quantity to print and re-stated the row's own numbers instead. One list,
   * three facts (Law D): what it is, how many, what Catalog charges.
   */
  parts: Array<{ sku: string; qty: number; unitCost: number | null }>;
  /**
   * Whether this supplier's goods are collected from the factory. The
   * collector is resolved from Purchasing Settings, never chosen per PO.
   */
  supplierKind: "own_logistics" | "factory_pickup" | null;
  /** The governed factory-collection rule from Purchasing Settings. */
  supplierCollection?: {
    procurementPartnerId: string;
    procurementPartnerName: string;
    fixedDestinationId: string | null;
  } | null;
  /** WHO fixes the blocker — a real person when a stored fact names one. */
  ownerName: string | null;
  /** The duty word, when no person resolves. */
  ownerDuty: string | null;
}

// ─── The action ──────────────────────────────────────────────────────────────

/**
 * THE WORK CONTRACT, STRUCTURED (`docs/purchasing/MASTER.md` §8.4).
 *
 * Eight fields, because a sentence is not a contract: the same row must be able
 * to tell My Work who owes it, Team Work whose pile it sits in, and the
 * operator what act closes it — without any of the three parsing prose. The
 * owner is METADATA and never appears inside `action`: an avatar renders the
 * person, and a name baked into the sentence cannot be re-rendered when the
 * roster changes or cover moves the work.
 */
export interface SoBatchPurchaseAction {
  trigger: PurchaseDemandState;
  /** The RULE that finds the owner — never the person, who may be absent. */
  ownerRule: string;
  ownerId: string | null;
  ownerName: string | null;
  /** The duty word, when the rule resolves to a duty rather than a person. */
  ownerDuty: string | null;
  /** The imperative act, in primary-school English. Carries no owner name. */
  action: string;
  /** The FACT that closes it — observed, never ticked. */
  completionFact: string;
  dueDate: IsoDate | null;
  sourceObject: { type: "sales_order"; id: string; number: string };
  cover: { normalOwnerId: string | null; actingOwnerId: string | null } | null;
}

/** The owner RULE per trigger (`docs/purchasing/MASTER.md` §§5.3, 9.1). Every
 *  timing state is the buy itself, so they all resolve to Current PO Duty. */
const BUY_OWNER_RULE = "Current PO Duty";
const ACTION_OWNER_RULE: Record<PurchaseDemandState, string> = {
  can_order_early: BUY_OWNER_RULE,
  safety_days_full: BUY_OWNER_RULE,
  safety_days_low: BUY_OWNER_RULE,
  safety_days_none: BUY_OWNER_RULE,
  not_enough_production_time: BUY_OWNER_RULE,
  no_customer_date: "Responsible Salesperson",
  no_sku: "Catalog/Master Data through Current PO Duty",
  no_supplier: "Current PO Duty",
  no_cost: "Catalog/Master Data through Current PO Duty",
  no_production_days: "Purchasing Settings authority",
  no_pickup_partner: "Purchasing Settings authority",
};

/**
 * The FACT that completes it. Every one of these is something the system can
 * OBSERVE — a date exists, a relationship exists, a document reached a
 * supplier. None of them is a person saying they are done.
 */
const BUY_COMPLETION_FACT = "Current PO version reached supplier with evidence";
const ACTION_COMPLETION_FACT: Record<PurchaseDemandState, string> = {
  can_order_early: BUY_COMPLETION_FACT,
  safety_days_full: BUY_COMPLETION_FACT,
  safety_days_low: BUY_COMPLETION_FACT,
  safety_days_none: BUY_COMPLETION_FACT,
  not_enough_production_time: BUY_COMPLETION_FACT,
  no_customer_date: "Requested Delivery Date exists",
  no_sku: "Approved SKU exists",
  no_supplier: "Approved supplier relationship exists",
  no_cost: "Approved Catalog cost exists",
  no_production_days: "Governed supplier/category days exist",
  no_pickup_partner: "Governed supplier collection rule exists",
};

/**
 * Compose one row's action.
 *
 * The four blocker sentences are `purchaseDemandHelpLine`'s, reused rather than
 * respelt — two spellings of one instruction is how a Register and a Work
 * queue start telling an operator different things. Every timing state gets the
 * same buying sentence, because it is not a blocker being fixed; it is the buy
 * itself, at whatever timing risk the state names.
 */
export function soBatchAction(f: {
  state: PurchaseDemandState;
  item: string;
  supplier: string | null;
  category: ProductCategory | null;
  ownerId: string | null;
  ownerName: string | null;
  orderId: string;
  so: number | null;
  dueDate: IsoDate | null;
  cover?: { normalOwnerId: string | null; actingOwnerId: string | null } | null;
}): SoBatchPurchaseAction | null {
  const trigger = f.state;
  const act = isPurchaseDemandTimingState(trigger)
    ? `Issue PO to ${f.supplier ?? "the supplier"}`
    : purchaseDemandHelpLine({
        state: trigger,
        item: f.item,
        supplier: f.supplier,
        category: f.category,
      });
  if (!act) return null;
  const duty =
    PURCHASE_DEMAND_OWNER_DUTY[trigger] ??
    (isPurchaseDemandTimingState(trigger) ? "PO duty" : null);
  return {
    trigger,
    ownerRule: ACTION_OWNER_RULE[trigger],
    ownerId: f.ownerId,
    ownerName: f.ownerName,
    ownerDuty: f.ownerName ? null : duty,
    action: act,
    completionFact: ACTION_COMPLETION_FACT[trigger],
    dueDate: f.dueDate,
    sourceObject: {
      type: "sales_order",
      id: f.orderId,
      number: f.so == null ? "" : `SO-${f.so}`,
    },
    cover: f.cover ?? null,
  };
}

// ─── The derivation ──────────────────────────────────────────────────────────

/** The facts a blocker is derived from. Nothing else may decide it. */
export interface PurchaseDemandBlockerInput {
  /** FALSE = the SKU is absent from Catalog. */
  inCatalog: boolean;
  /** FALSE = the SKU is a real Catalog product nobody has mapped a supplier to. */
  hasSupplier: boolean;
  /** FALSE = this supplier × category pair has no production days set. */
  hasProductionDays: boolean;
  /** FALSE = the customer order has no agreed delivery day. */
  hasCustomerDate: boolean;
}

/**
 * THE ONE blocker derivation. Precedence runs top to bottom, and it mirrors
 * the ORDER IN WHICH THE ENGINE ITSELF REFUSES a line: Catalog cannot
 * classify it → nobody has mapped a supplier → the pair has no production
 * days → the customer has no date. `null` = nothing blocks the line; it is
 * classified by `purchaseDemandTimingOf` instead.
 *
 * `covered` is not here any more: a fully covered / `Buy = 0` line does not
 * remain in SO Batch Purchase at all (Card 02-A §3) — it is found through
 * Purchase Orders, Stock and Order Route.
 */
export function purchaseDemandBlockerOf(
  f: PurchaseDemandBlockerInput,
): PurchaseDemandBlockerState | null {
  if (!f.inCatalog) return "no_sku";
  if (!f.hasSupplier) return "no_supplier";
  if (!f.hasProductionDays) return "no_production_days";
  if (!f.hasCustomerDate) return "no_customer_date";
  return null;
}

/** The engine dates an unblocked line is classified from. */
export interface PurchaseDemandTimingInput {
  today: IsoDate;
  /** The engine's Order By (`raiseBy`) — a planned date, never an unlock date. */
  orderBy: IsoDate | null;
  /** The engine's expected production completion if ordered today. */
  readyIfOrderedToday: IsoDate;
  customerDelivery: IsoDate;
  /** The governed Safety days value (`order_by_buffer_days`). */
  safetyDays: number;
  /** Malaysian public holidays — the same set the engine planned with. */
  holidays: ReadonlySet<string>;
}

/**
 * THE TIMING CLASSIFICATION (Card 02-A §4). The dates are the ENGINE's —
 * `raiseBy` and `promiseIfOrderedToday` off the same bundle that produced
 * `Goods Must Arrive` — and this function only compares them, so Safety days
 * are never subtracted twice. Safety days left are counted on the governed
 * OFFICE working calendar, because arranging a delivery is office work
 * (`docs/ACTION-FLOW-STANDARD.md` Law 2A).
 */
export function purchaseDemandTimingOf(
  f: PurchaseDemandTimingInput,
): PurchaseDemandTimingState {
  if (f.orderBy != null && f.today < f.orderBy) return "can_order_early";
  if (f.orderBy != null && f.today === f.orderBy) return "safety_days_full";
  if (f.readyIfOrderedToday > f.customerDelivery) return "not_enough_production_time";
  const left = countWorkingDays(f.readyIfOrderedToday, f.customerDelivery, {
    offDays: PURCHASING_OFFICE_OFF_DAYS,
    holidays: f.holidays,
  });
  if (left === 0) return "safety_days_none";
  if (left > f.safetyDays) return "can_order_early";
  if (left === f.safetyDays) return "safety_days_full";
  return "safety_days_low";
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
  /* A build every unit of which sits on an open purchase order is STILL
     buyable. `toBuy` used to be forced to 0 here, which made the row fail
     `isSelectableForBuying` and disappear from SO Batch Purchase entirely.

     The coverage that produced `fullyOnPo` is a GLOBAL, per-SKU pool: the
     engine drains `openPoBySku` earliest-deadline-first with no customer link
     at all, so the purchase order "covering" this order may have been raised
     for somebody else and may stop covering it on the next refresh (T6,
     `to-order.ts`). A buyer looking at their own Sales Order could not see
     that, could not act on it, and was given no sentence saying why — the row
     simply had no tick. YH ruled on 2026-09-03 that a line with a supplier, a
     cost and a price is buyable, and that the buyer decides whether the pooled
     coverage is good enough. This states the quantity and lets them choose.

     `qtyNeeded` below still reads `build.qty` for a covered build rather than
     adding the coverage back: `build.qty` is already what the covering
     purchase order carries (T6), so adding `coveredByOpenPo` to it would count
     the same units twice. `onPo` continues to report the coverage, so the row
     shows both numbers and the operator can see they overlap. */
  const toBuy = build.qty;
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
    case "no_cost":
      return `Set the cost of ${row.item} in Catalog`;
    case "no_production_days":
      return `Add production days for ${row.supplier ?? "the supplier"} · ${
        row.category ? categoryLabel(row.category) : "the category"
      }`;
    /* COPY-STANDARD line 900 owns this pair, and its `todo` says "Set its
       collector and destination in Purchasing Settings". `its` works there
       because the refusal's first line names the supplier. Here the first line
       is a state word with no name in it, so the supplier is named again
       rather than left dangling. */
    case "no_pickup_partner":
      return `Set the collector for ${row.supplier ?? "the supplier"} in Purchasing Settings`;
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
  const counts = Object.fromEntries(
    PURCHASE_DEMAND_STATES.map((s) => [s, 0]),
  ) as Record<PurchaseDemandState, number>;
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
  "can_order_early",
  "safety_days_full",
  "safety_days_low",
  "safety_days_none",
  "not_enough_production_time",
  "no_customer_date",
  "no_sku",
  "no_supplier",
  "no_cost",
  "no_production_days",
  "no_pickup_partner",
]);

export const soBatchPurchaseActionSchema = z.object({
  trigger: purchaseDemandStateSchema,
  ownerRule: z.string(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  ownerDuty: z.string().nullable(),
  action: z.string(),
  completionFact: z.string(),
  dueDate: z.string().nullable(),
  sourceObject: z.object({
    type: z.literal("sales_order"),
    id: z.string(),
    number: z.string(),
  }),
  cover: z
    .object({
      normalOwnerId: z.string().nullable(),
      actingOwnerId: z.string().nullable(),
    })
    .nullable(),
});

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
  goodsMustArrive: z.string().nullable(),
  issueRef: z
    .object({ proposalKey: z.string(), buildKey: z.string() })
    .nullable(),
  action: soBatchPurchaseActionSchema.nullable(),
  parts: z.array(z.object({ sku: z.string(), qty: z.number(), unitCost: z.number().nullable() })),
  supplierKind: z.enum(["own_logistics", "factory_pickup"]).nullable(),
  supplierCollection: z
    .object({
      procurementPartnerId: z.string(),
      procurementPartnerName: z.string(),
      fixedDestinationId: z.string().nullable(),
    })
    .nullable()
    .optional(),
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

/* THE SO BATCH PURCHASE READ (`soBatchPurchaseResponseSchema`) moved to
   `so-batch-purchase.ts` with Card 02-B: the response now carries the order
   Register rows that file defines, and the import must not cycle. */
