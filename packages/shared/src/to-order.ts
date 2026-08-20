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

  // ── The grid's six columns (Loo's frozen list, 2026-08-01): ☑ ·
  //    Preferred Delivery · SO No. · Model · Qty · PO No. Category is NOT a
  //    column (the left panel already said it) and Customer is not either
  //    (Loo: noise). PO No. rightmost = "did today's order happen". ───────
  colPreferred: "Customer Delivery",
  colSoNo: "SO No.",
  colModel: "Model",
  colQty: "Qty",
  colPoNo: "PO No.",

  noDeliveryDate: "No delivery date",

  destination: "Destination",
  /** Voiced in the Issue region when no destination is configured at all. */
  destinationRequired: "Destination not selected.",
  issue: "Issue Purchase Order",
  issueReview: "Review Purchase Orders",
  transactionCost: "Transaction Cost",
  commercialTreatment: "Commercial Treatment",
  normalPurchase: "Normal Purchase",
  freeOfCharge: "Free of Charge",
  freeOfChargeReason: "Free of Charge Reason",
  procurementPartner: "Procurement Partner",
  costRequired: "Cost required",

  // ── The Excel grid — Loo's final freeze, 2026-08-01: To Order DECIDES
  //    which customer orders become purchase orders today; Purchase Orders
  //    MANAGES the documents once they exist. Left panel = Action Launcher
  //    (TODAY · the three categories · + Create Purchase), Linear's density;
  //    right = the GitHub-Projects table, 40px rows; `Order By` NEVER
  //    reaches the screen — the operator sees the CUSTOMER's date only.
  //    Each word still owed a COPY-STANDARD row. ───────────────────────────
  /** The left panel's first row — today's whole run, all categories. */
  navToday: "Today",
  // ── The Work Queue (Jess's freeze, 2026-08-01): time views are INDEPENDENT
  //    sets, never cumulative — Today ⊄ Tomorrow. Combining windows is the
  //    grid's Excel filter's job, never the rail's. `All` carries no count
  //    (All is all; the number adds nothing). Each word owed a COPY-STANDARD
  //    row. ────────────────────────────────────────────────────────────────
  /**
   * The rail's first block — the PURCHASE CALENDAR (Jess, 2026-08-01,
   * final): rows are the UPCOMING PO days from Settings' PO Days, rolling
   * from today, plus a red Overdue row that the next run may never swallow.
   * Today/Tomorrow/This Week/Next Week retired the same day.
   */
  poScheduleHeading: "PO Schedule",
  /** The rail's second block heading — work ORDER, not a filter bar. */
  categoryHeading: "CATEGORY",
  categoryAll: "All",
  /** Accessory KINDS get their own rail rows (Jess, 2026-08-01) — planned
   *  ahead of the inventory-demand pipeline that will fill them. */
  categoryPillow: "Pillow",
  categoryMattressProtector: "Mattress Protector",
  colCustomer: "Customer",
  /**
   * `Updated 10:32 AM` — not a Refresh button. The plan updates itself; this
   * stamp answers the one AutoCount anxiety ("am I looking at the latest?").
   */
  updated: "Updated",
  // ── The PO column speaks BUSINESS, not Excel (Jess, 2026-08-01, final):
  //    an empty PO cell is not "no data" — it is WORK, and it says so. The
  //    filter lists `Yet to Order` + the real PO numbers; `(Blanks)` and a
  //    generic `Ordered` never appear (the number list IS ordered). ───────
  /** The group header of demand a human typed rather than a customer order. */
  readyStockGroup: "Ready Stock",
  yetToOrder: "Yet to Order",
  /**
   * The group header of a customer order that has SOME of its items on a
   * purchase order and some still to buy (Loo, 2026-08-03, from AutoCount's
   * own `Partial`). It is an ORDER-level fact and could never be said on a
   * row: a single item either has a purchase order or it does not.
   *
   * A fully-ordered group says nothing — its purchase-order numbers are
   * printed right beside it, and a word repeating what a number already
   * proves is noise.
   */
  partlyOrdered: "Partly ordered",
  /**
   * P18 — the label on the group header's SECOND date (Loo, 2026-08-05).
   *
   * NOT invented: `orders.proceed_date` is already spelt this way in four live
   * places — the Sales form's `PROCEED DATE · PRODUCTION START`, the order-entry
   * field config (`Proceed date · production start`), the Sales Order
   * Maintenance column (`Proceed Date`) and the ops CSV header (`Proceed`).
   *
   * It is LABELLED and the delivery date beside it is not, and that asymmetry
   * is the point: the header already carried one bare date, so a second bare
   * date would be two unexplained dates on one line. The label is what tells
   * them apart. The word is also deliberately NOT the bare `Proceed`, which
   * COPY-STANDARD owns as an order STATE — a different fact.
   */
  proceedDate: "Proceed date",
  /**
   * T1.1 (Loo, 2026-08-06) — the READY STOCK column's header.
   *
   * The same business term the rail and the group line already print for typed
   * demand, in its third role: *how many of this item are already standing in
   * the warehouse.* Loo asked for it by name — *"i need to add to show ready
   * stock like autocount"* — after the number spent its whole life behind a ⊞
   * that only appeared where stock existed: measured 2026-08-06, the warehouse
   * held **91 free units across 50 SKUs** and exactly ONE row on the page said
   * so.
   *
   * A buyer's first question is not *what do I order* — it is *must I order
   * this at all*, and AutoCount answers it with a column. So does this.
   */
  colReadyStock: "Ready Stock",
  /**
   * T3 (Loo, 2026-08-06) — the ON PO column's header.
   *
   * **The fact the engine computed and never showed anyone.**
   * `net-requirements.ts` has netted open purchase orders out of demand since
   * the day it was written (`coveredByOpenPo`), and the number left the engine
   * nowhere: a line whose remainder is 0 is dropped from the grid, and a partly
   * covered line prints its REDUCED quantity with nothing beside it. The buyer
   * reads `Qty 1` where the customer ordered 3 and cannot answer *why 1?* —
   * the only two answers on screen are `Ready Stock` (in the warehouse) and
   * this one (already bought, not yet arrived).
   *
   * `PO` is COPY-STANDARD's ruled word for the document, so the header composes
   * it rather than inventing a noun (`On Order` · `Incoming` · `Open PO` were
   * all available and all say the same thing in a word the dictionary does not
   * hold). The COPY-STANDARD row was written with this card.
   *
   * **Neutral ink, never green.** `Ready Stock` is green because it is
   * something you can take TODAY; this number is information — the goods are
   * bought and the operator can do nothing with them here.
   */
  colOnPo: "On PO",
  filterOverdue: "Overdue",
  /**
   * The empty state while a FILTER is narrowing — §8.2's law: no reachable
   * click may blank the table into a dead end, so the blank names its cause
   * and hands back the way out.
   */
  filtersEmpty: "No rows match the filters.",
  clearFilters: "Clear filters",
  salesOrderScope: "Sales Order",
  clearSalesOrderScope: "Clear Sales Order scope",
  scopeNotFound: "Sales Order not found.",
  scopeBlockedProductionDays: "Set a number before this demand can be issued.",
  scopeBlockedDeliveryDate: "No delivery date — this demand cannot be issued.",
  scopeUnresolved: "Purchasing cannot resolve this demand from the catalog.",
  scopeAlreadyCovered: "Demand is already covered by an open Purchase Order.",
  scopeAlreadyIssued: "Purchase Order already issued.",
  scopeNothingToBuy: "Nothing remains to buy for this Sales Order.",
  /** The ☑'s aria word — picking rows for THIS batch, nothing more. */
  select: "Select",
  /** The pill (`+ …`); appears only when something is selected. */
  issuePos: "Issue PO",
  /** The bottom bar's states. It exists only while it has something to say. */
  creatingPos: "Creating Purchase Orders…",
  createdWord: "Created",
  continueInPos: "Continue in Purchase Orders",
  retry: "Retry",
  createFailed: "failed",
  /**
   * The manual entrance — a real dialog from day one (Loo, 2026-08-01: the
   * entrance may never be missing). Its SAVE arrives with the unified
   * `purchase_demands` card; until then the Create button is disabled and
   * says so.
   */
  createPurchase: "Create Purchase",
  /**
   * The dialog's Source field — **the label is `Reason`, and that is a choice
   * between two words that were both already ruled** (card P15, 2026-08-04).
   *
   * The frozen field list in `CHECKPOINT-to-order.md` §0A calls this field
   * `Source`; this mirror has called it `Reason` since the dialog was drawn,
   * and the six option words below are named after it. `Source` has no entry
   * here and never appeared on a screen, so spelling it would have been a new
   * visible word — which P15's own Done-when forbids by name. The concept is
   * Source; the word an operator reads is `Reason`. That the two documents
   * disagree is reported by P15, not settled by it.
   */
  reason: "Reason",
  /**
   * The six. **FIVE of them can be recorded and one cannot**, and the split is
   * the database's, not this file's: `purchase_demands.purpose` has a CHECK
   * holding exactly `ready_stock` · `display` · `office` · `warranty` ·
   * `spare_parts` — 0323 opened four, and 0359 admitted `spare_parts` on the
   * Manual Purchase ruling (Jess, 2026-08-18).
   *
   * `reasonOther` still has NO value to be stored as and is NOT offered — see
   * `DEMAND_PURPOSES`, which is the list a control may render. It stays here
   * because it is a ruled word a later card may need; a word with no home in
   * the store is a word the server refuses by name, which is exactly the
   * failure 0322 paid for on the pool's reasons.
   */
  reasonReadyStock: "Ready Stock",
  reasonDisplay: "Display",
  reasonWarranty: "Warranty",
  reasonSpareParts: "Spare Parts",
  reasonOffice: "Office",
  reasonOther: "Other…",
  /** The customer lane's auto-stamp (0361) — never offered in a picker; a PO
   *  born from sales orders says so itself. */
  reasonCustomerSales: "Customer Sales",
  // ── P15 (Loo, 2026-08-04) — the item picker stops being one word per row ──
  /**
   * The picker's SKU column. **This is the card's first and worst defect**:
   * four different SKUs (`5539-L(RHF)` · `5539-2NA` · `5539-CNR` ·
   * `5539-Console`) all rendered as the single word `Booqit`, because
   * `railItemLabel` prints the MODEL and a size letter, and a part variant has
   * no size. An operator could not pick the right one, and buying the wrong
   * thing is worse than not knowing the stock. AutoCount leads its own picker
   * with `Item Code` for this reason.
   *
   * `SKU` is not invented: it is already the visible column word on the
   * Movements register (`OperationMovements.tsx`) and the stock import's own
   * header. It stays a technical term untranslated, as CLAUDE.md rules.
   */
  pickerColSku: "SKU",
  /**
   * `On Hand` — every unit of this SKU standing in the warehouse now, whatever
   * its condition. The spelling is the Stock register's own page title; the
   * sidebar tab spells it `On hand`, and THAT disagreement is reported by P15
   * rather than fixed here (it is the Stock lane's file).
   */
  pickerColOnHand: "On Hand",
  /**
   * `Reserved` and `Free` are the REGISTER's own status words, and their one
   * home is `OPS_STOCK_STATUS_LABEL` in `stock-hold.ts`. These two entries
   * mirror it so the picker reads one vocabulary, and a test asserts the
   * mirror equals the source — a copy that can drift is not a mirror.
   */
  pickerColReserved: "Reserved",
  pickerColFree: "Free",
  /**
   * The picker's own table, for a screen reader. **Never rendered**, which is
   * why it is not a new visible word — the same shape as `itemsTableLabel`
   * above. A table that gained a header row also needs a name, or a screen
   * reader announces "table" and nothing else.
   *
   * There is deliberately NO empty-state sentence: the picker showed an empty
   * box before P15 and shows one now. P15 does not list that as a defect, and
   * a sentence nobody has ruled may not appear on a screen.
   */
  pickerTableLabel: "Search results",
  /**
   * `Supplier` — ONE word with ONE home, used in two places: the Create
   * Purchase dialog's field and, since 2026-08-03, the grid's supplier column.
   * A second entry spelling the same word is how one concept ends up with two
   * spellings a rename only half fixes, so there is deliberately no
   * `colSupplier`.
   *
   * The column exists because supplier × category is what decides how many
   * purchase orders `Issue` produces, and that fact used to live ONLY in the
   * button's `title` tooltip — which a keyboard cannot reach and a screen
   * reader may not read (`01-design-tokens.md` §9).
   */
  supplierLabel: "Supplier",
  itemLabel: "Item",
  searchItem: "Search item…",
  requiredBy: "Required By",
  remark: "Remark",
  cancel: "Cancel",
  create: "Create",
  nextUpdate: "Available in next update.",

  // ── P19 (Loo, 2026-08-05) — Create Purchase takes MANY lines ─────────────
  /**
   * The control that adds a row to the line list. Rendered as `+ {lineAdd}`,
   * the same shape as `+ {createPurchase}` on the rail — the glyph is markup,
   * the WORD is here.
   *
   * **It is the one genuinely new word on this card, and Loo ruled it on
   * 2026-08-05 from three options with the alternatives' costs attached.**
   * The Sales Portal — the very form the comparison was made against — spells
   * the same gesture `Add line item`, and `Add item` was the third candidate;
   * he chose `Add line`, so the pair below reads as one act on one row rather
   * than borrowing another form's phrasing. It gains a COPY-STANDARD row in
   * the same card, because a word on a screen with no entry there is the gap
   * this module's own law exists to close.
   */
  lineAdd: "Add line",
  /**
   * The control that takes a row back out, before anything is submitted.
   *
   * **A SEPARATE ENTRY FROM `itemsRemove`, WHICH SPELLS THE SAME WORD, and the
   * split is this file's own rule rather than an oversight.** `itemsRemove` is
   * the PO Preview's item menu — taking a line off a purchase order that is
   * about to be issued. This one is a form control on a row nobody has saved.
   * Two concepts that happen to share a spelling are two entries (the
   * `cancelDemand` / `cancel` precedent, six entries above); the same concept
   * spelt twice is the drift `supplierLabel` warns about. A rename of either
   * must never silently rename the other.
   *
   * It is never offered on a line that has already been created: that row is a
   * record now, and a control implying it could be un-made would be a lie —
   * the row says `createdWord` instead.
   */
  lineRemove: "Remove",

  // ── P12 (Loo, 2026-08-04) — a typed demand can be cancelled, and so can the
  //    REMAINDER of one that was part-ordered. ─────────────────────────────
  /**
   * The row's button. `Cancel` is COPY-STANDARD's own verb for this act
   * (*"Cancel an order | **Cancel** | Void · Abandon · Kill"*), so no word is
   * invented here.
   *
   * IT IS A SEPARATE ENTRY FROM `cancel` ABOVE, WHICH SPELLS THE SAME WORD ON
   * PURPOSE. `cancel` is the Create Purchase dialog's abandon button and the
   * filter popover's clear label — form controls, which COPY-STANDARD exempts
   * from the verb dictionary BY NAME (*"a button inside a form that stores what
   * you just typed is `Save`, and one that abandons it is `Cancel` — those are
   * not actions"*). This one is the ACTION. Two concepts that happen to share a
   * spelling are two entries; the same concept spelt twice would be the drift
   * this file warns about under `supplierLabel`, and a rename of one of these
   * must never silently rename the other.
   */
  cancelDemand: "Cancel",
  /**
   * The confirm dialog — its title AND its confirm button, the same words in
   * both so the press and the promise cannot differ.
   *
   * The verb plus its object, where the row's button carries the verb alone.
   * That is C1's own shape (a party-free word in a tight slot, the fuller line
   * where it stands alone): in the grid the row IS the purchase and its
   * neighbours name it, while a dialog is read with nothing around it. The noun
   * is `Create Purchase`'s own — this is the exact inverse of the act that made
   * the row — and AutoCount, which the team already knows, carries `Cancel
   * Purchase Order` as a document of its own.
   */
  cancelPurchase: "Cancel Purchase",
  /**
   * The one field, and it is mandatory — the server refuses a blank one by name
   * and the table's `purchase_demands_cancel_pair` CHECK refuses the pair.
   *
   * Deliberately NOT the `reason` entry above: that one labels the create
   * dialog's PURPOSE picker (`Ready Stock` · `Display` · …), which asks what the
   * purchase is FOR. This asks why it is being stopped. Same word, different
   * question, so it gets its own home rather than borrowing one.
   */
  cancelReason: "Reason",

  // The Preview — what pressing Issue would create, before it exists.
  preview: "Purchase Order Preview",
  /**
   * The ☑'s meaning is frozen and narrow: MEMBERSHIP of this purchase order —
   * never a business decision (Loo, 2026-07-31: a checkbox that reads like
   * Hold / Skip / Supplier-has-no-stock is a question it cannot answer). It
   * is not a hold, not a cancellation and not a status — unticking changes
   * nothing about the customer's order, and the next recomputation finds the
   * demand still unordered and offers it again.
   */
  include: "Included in this Purchase Order",
  includeOffHelp: "Not on this issue. Nothing about the order changes.",

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
  unresolvedHelp: "Affected items stay blocked until supplier setup is corrected.",

  nextStep: "Next: confirm the ready date in Purchase Orders",
  openPurchaseOrders: "Open Purchase Orders",

  // ── T1 (Loo, 2026-08-06) — the AutoCount-aligned grid ────────────────────
  /**
   * The always-on strip under the grid: `Total · 21 units`. **Not a new
   * word** — COPY-STANDARD's Report table rules `Total` by name ("the last
   * row"), and AutoCount's own footer says it; this entry is the mirror.
   * The unit half is `unitsHeadline`, COPY-STANDARD's own Numbers pair.
   */
  total: "Total",
  /**
   * The date ▼'s custom-range section and its apply button — BOTH live on
   * Purchase Orders' date columns since 2026-08-02 (Jess's Excel date ▼,
   * frozen on the Register and "built to flow back to every date column in
   * the portal", `excel-date-filter.ts`'s own docblock). Mirrored here the
   * day the flow-back reached this page; no spelling is invented.
   */
  customDateRange: "Custom Date Range…",
  apply: "Apply",

  empty: "No purchase orders to issue.",
} as const;

/**
 * ── The Source a typed demand may carry (card P15, Loo 2026-08-04) ──────────
 *
 * **THE MIRROR OF A DATABASE LIST, NOT A MENU SOMEBODY CHOSE.** The values are
 * `purchase_demands.purpose`'s CHECK, and the write door
 * (`purchasing_create_demand`, opened by 0323, widened by 0359) names the same
 * five. Three places must agree — the CHECK, the function's own gate, and this
 * — and 0322 is why: when the pool's reasons lived in four places and only two
 * were widened, every dropdown offered a word the server refused by name.
 *
 * This array is therefore the ONLY list a control may render.
 * `Other…` is a ruled WORD in `TO_ORDER_WORDS` and is deliberately not
 * here: neither has ever had a value to be stored as, and inventing one would
 * be a screen ruling on a business question ("other" than what?).
 *
 * THE ORDER IS THE DISPLAY ORDER and it is the frequency order, not the
 * CHECK's: Ready Stock is what almost every typed demand is, so it leads and
 * is the default; the other three are the exceptions this field exists to tell
 * apart.
 */
export const DEMAND_PURPOSES = [
  { value: "ready_stock", label: TO_ORDER_WORDS.reasonReadyStock },
  { value: "display", label: TO_ORDER_WORDS.reasonDisplay },
  { value: "warranty", label: TO_ORDER_WORDS.reasonWarranty },
  { value: "office", label: TO_ORDER_WORDS.reasonOffice },
  { value: "spare_parts", label: TO_ORDER_WORDS.reasonSpareParts },
] as const;

export type DemandPurpose = (typeof DEMAND_PURPOSES)[number]["value"];

/** The default a dialog opens on — and the value the RPC itself defaults to. */
export const DEMAND_PURPOSE_DEFAULT: DemandPurpose = "ready_stock";

/** Every storable Source value, for a zod enum and for a guard. */
export const DEMAND_PURPOSE_VALUES = DEMAND_PURPOSES.map((p) => p.value) as readonly string[];

export function isDemandPurpose(v: unknown): v is DemandPurpose {
  return typeof v === "string" && DEMAND_PURPOSE_VALUES.includes(v);
}

/**
 * What a PO's `purpose` (0361) prints as — the `Need for` fact on the PO
 * surfaces. `customer_sales` is the customer lane's auto-stamp; the five typed
 * purposes reuse the demand labels above (one dictionary, Law D). NULL — every
 * PO issued before 0361, deliberately not backfilled — prints nothing, and the
 * caller decides what nothing looks like.
 */
export function poPurposeLabelOf(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v === "customer_sales") return TO_ORDER_WORDS.reasonCustomerSales;
  return DEMAND_PURPOSES.find((p) => p.value === v)?.label ?? null;
}

/**
 * ── What the picker knows about one SKU (card P15) ──────────────────────────
 *
 * The three numbers are ONE read of the register (`ops_stock_items`) at the
 * warehouse To Order offers stock from, and `free` is P10's own rule reused
 * rather than re-derived — the card's Must-NOT says so by name, and a second
 * count is a second answer waiting to disagree.
 */
export interface DemandPickItem {
  /** The catalog code. The picker leads with it — P15's defect 1. */
  sku: string;
  /** `Sonic Q` — the model + size letter. Not unique, which is the whole point. */
  label: string;
  /** DERIVED from the SKU, never chosen. `null` means the SKU is unbuyable. */
  supplier: string | null;
  /** Units standing in the warehouse now, any condition. */
  onHand: number;
  /** Units spoken for by an order. */
  reserved: number;
  /** What the grid would offer — free, sound and at that warehouse. */
  free: number;
}

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

/**
 * `12 Orders` — the rail header's big fact: how many customer orders today's
 * run covers. The natural word, because it is what a purchaser SAYS (Loo,
 * 2026-07-31: "今天有 12 单要下"); the system word `SO` starts one level
 * down, on the category rows.
 */
export function ordersHeadline(n: number): string {
  return `${n} Order${n === 1 ? "" : "s"}`;
}

/**
 * `19 units` — the CATEGORY rail row's tooltip (P9, Loo 2026-08-04).
 *
 * THE NUMBER ON SCREEN IS BARE. Loo ruled it: `Mattress 19`, never
 * `Mattress 19 件`. So the rail prints the digit alone and the WORD lives
 * here, in the row's `title`, for a hover and a screen reader — which is
 * exactly where `ordersHeadline` already puts the PO Schedule block's word.
 *
 * That pairing is the whole point of this function existing. Two blocks of
 * right-aligned numbers sit one above the other in a 200px rail and they
 * count DIFFERENT THINGS: the calendar rows count customer ORDERS, the
 * category rows count UNITS. A bare `3` and a bare `3` are indistinguishable,
 * so the two tooltips must not be. `12 Orders` · `19 units` — COPY-STANDARD's
 * own pair, verbatim from its Numbers section (`3 units` / `12 orders`); no
 * word is invented here.
 */
export function unitsHeadline(n: number): string {
  return `${n} unit${n === 1 ? "" : "s"}`;
}

/**
 * `Mattress 7 · Bedframe 1 · Sofa 1` — what the ticked rows will buy, by
 * category (P9, Loo 2026-08-04).
 *
 * Bare numbers again, and the category's own word does the labelling — the
 * rail says `Mattress 19` and this says `Mattress 7`, one vocabulary.
 *
 * A category contributing NOTHING is dropped rather than printed as a zero,
 * and that is the opposite of the rail's rule ON PURPOSE. The rail is a fixed
 * vocabulary an operator navigates by, so `Sofa 0` must hold its place or the
 * rows move under the pointer. This line is a SENTENCE about one selection;
 * `Sofa 0` in it is a clause saying nothing, and five of them would bury the
 * two that matter.
 */
export function categoryUnitsLine(
  parts: readonly { word: string; units: number }[],
): string {
  return parts
    .filter((p) => p.units > 0)
    .map((p) => `${p.word} ${p.units}`)
    .join(" · ");
}

/** `5 SO` — a group header's count, and a future run's count. */
export function soCountLabel(n: number): string {
  return `${n} SO`;
}

// ── Ready stock, suggested (P10, Loo 2026-08-04) ────────────────────────────
//
// Loo's ruling 3: *"我要的就是有一个自动建议补货，不过我们可以手动选择要不要拉。"*
// The system SUGGESTS; the human decides. So there is no quantity box anywhere
// in these three strings — the number is the system's, and pressing the button
// is the whole of the operator's decision. That is what makes the REASON
// recorded by construction: there is only one thing the press can mean.
//
// ── P13 · THE WORD IS `Reserve`, NOT `Take` (Loo, 2026-08-04) ───────────────
//
// P10 shipped `Take`, and the order drawer's picker has said
// `Reserve {n} to {soRef}` for the SAME ACT since 2026-06-30. One act, two
// words, two screens. Loo ruled `Reserve`, for three reasons that are the
// record:
//
//   1. IT IS MORE ACCURATE. The goods do not leave — they are LOCKED until
//      delivery. `Take` reads as *already gone*, and an operator who believes
//      stock has left will not chase it.
//   2. IT CAME FIRST. Live since 2026-06-30; an older word that is not wrong
//      is not replaced.
//   3. IT NAMES THE PARTY. `Reserve 2 to SO-1209` says who it is for.
//
// THE DRAWER IS NOT TOUCHED. This card moves the NEWER screen onto the older
// one, never the reverse — `ReserveStockDialog` and `StockPickerGrid` keep
// their wording byte for byte, and a test asserts it.

/** `Carres Klang: 2 available` — the expanded row's one sentence. */
export function freeStockLine(warehouse: string, n: number): string {
  return `${warehouse}: ${n} available`;
}

/**
 * `2 on PO-2051` — the `On PO` cell's hover, or `null` when no purchase order
 * could be named (T3, 2026-08-06).
 *
 * **The number alone ships when the reference cannot be resolved.** The engine
 * nets an aggregate pool per SKU, so the purchase orders behind a covered unit
 * are known only because `buildToOrder` replays the engine's own allocation
 * order over the caller's per-PO list. A caller that hands no list gets no
 * title — an invented reference is worse than a bare number, because an
 * operator can phone a PO number that does not exist.
 *
 * The `·` separator is the grid's own (the order line already joins its
 * purchase orders with it).
 */
export function onPoLine(n: number, pos: readonly string[]): string | null {
  if (n <= 0 || pos.length === 0) return null;
  return `${n} on ${pos.join(" · ")}`;
}

/** `Reserve 2` — the button. It carries the number BECAUSE nothing else may. */
export function reserveFromStockLabel(n: number): string {
  return `Reserve ${n}`;
}

/**
 * `reserved 2 from stock` — why this row's quantity is smaller than what was
 * asked for. Without it the number simply falls, and a quantity that changes
 * with nothing saying so is the silent failure this module keeps paying for.
 *
 * It is the past tense of the BUTTON's own verb, so the fact and the act that
 * produced it read as one thing (P13; it said `took … from stock` before).
 */
export function reservedFromStockLabel(n: number): string {
  return `reserved ${n} from stock`;
}

/** The expand control's own word, for a screen reader — the number is the
 *  point, so it is in the label rather than a generic "expand row". */
export function stockExpandLabel(model: string, n: number): string {
  return `${model} — ${n} available`;
}

/**
 * What a drawn unit is COMMITTED to — `ops_stock_items.reserved_ref`, which a
 * warehouse person reads on the register.
 *
 * A customer requirement uses `SO-{so}`, the portal's own reference since 0137
 * and the one `lineReadiness`, the booking gate and the activity log already
 * match on — so a unit taken here is indistinguishable from one reserved
 * through the order drawer, which is correct: it is the same act.
 *
 * A typed demand has no customer and no SO. What it HAS is a destination, and
 * that is the true answer to "committed to what" — the same fact the grid's
 * group header already prints in place of a customer name.
 */
export function readyStockRef(destination: string | null | undefined): string {
  const d = (destination ?? "").trim();
  return d ? `${TO_ORDER_WORDS.readyStockGroup} · ${d}` : TO_ORDER_WORDS.readyStockGroup;
}

/**
 * P18 — how long an order has been waiting past its planned production start,
 * or `null` when that day has not come.
 *
 * **Loo ruled the conditional form on 2026-08-05** (option C of three). The
 * count is what turns a date into a purchasing signal — *production was
 * supposed to start 15 days ago and nobody has bought the goods* — but it only
 * means that once the date has PASSED. A proceed date still ahead of today has
 * waited nothing, and this is not hypothetical: measured on production the same
 * day, `SO-1256`'s proceed date was TOMORROW, so an unconditional count printed
 * `(-1 days)` on the live page.
 *
 * `null` therefore means *print the date alone*, and it covers all three cases
 * that deserve it — no proceed date at all, a date in the future, and the day
 * itself. **Zero is deliberately not returned**: `(0 days)` on the very morning
 * production is due to start would read as a complaint about an order that is
 * perfectly on time.
 *
 * Pure, and takes `today` rather than reading a clock, so a test can stand on a
 * fixed day and the page can pass the same `today` the row's `late` flag uses —
 * one day, one answer, no chance of the header disagreeing with the red date
 * beside it.
 */
export function proceedWaitedDays(
  proceedDate: IsoDate | null | undefined,
  today: IsoDate | null | undefined,
): number | null {
  if (!proceedDate || !today) return null;
  // String compare is safe and intended on `YYYY-MM-DD`, and it is what the
  // page's own `late` flag already does — no Date object, so no timezone can
  // move the boundary.
  if (proceedDate >= today) return null;
  const days = isoDayDiff(proceedDate, today);
  return days != null && days > 0 ? days : null;
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. `null` if either is unparseable. */
function isoDayDiff(a: IsoDate, b: IsoDate): number | null {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/**
 * Why the unit left the free pool, for K4's ledger.
 *
 * P10 recorded this as `other` with a note, because K4's locked five had no
 * row for *"we had it on the shelf, so we did not raise a purchase order"* and
 * inventing a sixth would have been a ruling on a locked vocabulary. Loo made
 * that ruling on 2026-08-04 (P13), so the reason now says it itself.
 *
 * The note stays, and it says only what the reason CANNOT: WHICH build the
 * unit went to. It no longer repeats *taken instead of raising a purchase
 * order* — with the reason carrying that sentence, keeping it in the note
 * would write the same fact into the ledger twice.
 */
export const READY_STOCK_DRAW_REASON = "used_instead_of_ordering" as const;

export function readyStockDrawNote(label: string): string {
  return `To Order · ${label}`;
}

/** `8 pcs` — physical units, the factory's own count. */
export function pcsCount(n: number): string {
  return `${n} pcs`;
}

/**
 * `28 selected` — the toolbar's quiet fact (Jess, 2026-08-01: the old
 * `28 SO selected · → 10 Purchase Orders` was a formula, not a sentence —
 * arrows are engine language). The CONSEQUENCE moved onto the button.
 */
export function selectedShort(n: number): string {
  return `${n} selected`;
}

/**
 * `Issue 2 POs` — the button (Jess, 2026-08-01, FINAL of three rounds):
 * the caption says what is picked (`16 selected`), the button says what
 * the click creates, in the trade's own shorthand. One line, no
 * `Purchase Orders` spelt twice.
 */
export function issuePosShort(n: number): string {
  return `Issue ${n} PO${n === 1 ? "" : "s"}`;
}

/**
 * `3 Purchase Orders Created` — the bottom bar's completion line. The pill's
 * `→ 2 Purchase Orders` promise and this line come from the same shared
 * projection the server recomputes on issue — neither may ever lie.
 */
export function posCreatedLine(n: number): string {
  return `${purchaseOrderCount(n)} Created`;
}


/**
 * `Queen` → `Q` — the rail row's size letter. The rail is navigation, not
 * reading: the letter disambiguates (`Sonic Q` vs `Sonic K`) without the
 * width the full word costs. The Items table keeps the full word — a factory
 * cuts to `Queen`, an operator scans for `Q`.
 */
const SIZE_SHORT: Record<string, string> = {
  Queen: "Q",
  King: "K",
  Single: "S",
  "Super Single": "SS",
};

export function sizeShort(size: string | null): string | null {
  if (size == null) return null;
  return SIZE_SHORT[size] ?? size;
}

/** `Sonic Q` — a rail row's item label: model + size letter, nothing else. */
export function railItemLabel(model: string, size: string | null): string {
  const s = sizeShort(size);
  return s ? `${model} ${s}` : model;
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

// ── The PO Schedule (Jess's freeze, 2026-08-01, replacing the time buckets) ─
//
// The rail is a PURCHASE CALENDAR: one row per upcoming configured PO day
// (rolling from today — yesterday's Monday is never shown), plus OVERDUE.
//
// THE SNAP RULE, verbatim hers: *"Always snap to the nearest earlier PO day.
// Never move later."* Ordering early costs a few days of warehouse space;
// ordering late risks the customer's date.
//
// THE PROTECTION RULE: a demand whose snapped PO day has PASSED stays in
// OVERDUE — it is never silently rolled into the next run, or the operator
// reads "Friday" on work that is already two days late.

/** Where a demand sits on the purchase calendar. */
export type PoScheduleBucket = { kind: "overdue" } | { kind: "day"; day: IsoDate };

function addDaysIso(iso: IsoDate, days: number): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso: IsoDate): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

const WEEKDAY_WORDS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** `Wednesday` — a schedule row's word. The full date rides the row title. */
export function weekdayName(iso: IsoDate): string {
  return WEEKDAY_WORDS[weekdayOf(iso)]!;
}

/** Mon–Fri: the office's own week. Saturday/Sunday NEVER carry a PO run —
 *  the Carres office does not work them (Jess, 2026-08-01). */
const OFFICE_WEEKDAYS = [1, 2, 3, 4, 5] as const;

/**
 * The next instance of each configured PO weekday, from today INCLUSIVE,
 * ascending — a Tuesday under Mon/Wed/Fri reads Wed · Fri · Mon. An empty
 * configuration means "order any day": the calendar collapses to the next
 * WORKING day — never a Saturday, whatever today is.
 */
export function poScheduleDays(poDays: readonly number[], today: IsoDate): IsoDate[] {
  const wanted = poDays.length === 0 ? OFFICE_WEEKDAYS : poDays;
  const limit = poDays.length === 0 ? 1 : poDays.length;
  const days: IsoDate[] = [];
  for (let i = 0; i < 9 && days.length < limit; i += 1) {
    const d = addDaysIso(today, i);
    if (wanted.includes(weekdayOf(d))) days.push(d);
  }
  return days;
}

/** The latest allowed PO day ON OR BEFORE the raw date — never later. An
 *  empty configuration still refuses the weekend: a Saturday snaps to
 *  Friday. */
export function snapToPoDay(orderBy: IsoDate, poDays: readonly number[]): IsoDate {
  const wanted = poDays.length === 0 ? OFFICE_WEEKDAYS : poDays;
  for (let i = 0; i < 7; i += 1) {
    const d = addDaysIso(orderBy, -i);
    if (wanted.includes(weekdayOf(d))) return d;
  }
  return orderBy;
}

/**
 * Which calendar row a demand belongs to. A dateless demand lands on the
 * FIRST upcoming row — the engine cannot schedule it, so a human decides at
 * the next run, not never. A snapped day already past is OVERDUE, always.
 */
export function poScheduleBucket(
  orderBy: IsoDate | null,
  poDays: readonly number[],
  today: IsoDate,
): PoScheduleBucket {
  if (orderBy == null) return { kind: "day", day: poScheduleDays(poDays, today)[0]! };
  const snapped = snapToPoDay(orderBy, poDays);
  if (snapped < today) return { kind: "overdue" };
  return { kind: "day", day: snapped };
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
  /**
   * P18 — `orders.proceed_date`, the planned PRODUCTION START date Sales keys
   * on the New Sales Order form (`PROCEED DATE · PRODUCTION START`).
   *
   * An ORDER fact, so it is repeated on every line of the order and the engine
   * reads it off the first one — exactly like `so` and `customerName`. It is
   * NEVER an input to the engine's arithmetic: the raise-by date comes from the
   * customer deadline and the production days, and this is Sales' plan sitting
   * beside it. `null` on a Ready Stock demand, which has no order.
   */
  proceedDate?: IsoDate | null;
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
  /**
   * TRUE when this line is a READY STOCK demand a human typed, not a customer
   * requirement (Jess, 2026-08-03). It rides the SAME engine on purpose — her
   * frozen ruling is "ONE unified demand table … ONE engine eats it, no second
   * pipeline ever" — so everything downstream (the order-by date, the PO
   * grouping, Issue) works on it without knowing it is different.
   *
   * The flag exists so the SCREEN can say whose it is. Nothing else reads it.
   */
  readyStock?: boolean;
  /** Where the ready stock goes — the destination the buyer chose. */
  destinationName?: string | null;
  /**
   * P10 — which pool of FREE ready stock this line draws from.
   *
   * `order_lines.sku` and `ops_stock_items.sku` are two vocabularies (the
   * catalog code `H1401S-K` against the warehouse's own `HAVEN SOFTCLOUD
   * H1401S-K`), so the caller resolves them and hands the resolved key down.
   * The engine keys the free pool on THIS, not on `sku`: two lines whose SKU
   * strings differ but resolve to the same physical stock must drain ONE pool,
   * or the page offers the same two units to two rows.
   *
   * Absent → the line's own `sku`, which is the openPo pool's own key.
   */
  stockKey?: string;
  /**
   * P10 — units of this line's requirement ALREADY taken from ready stock.
   *
   * DISPLAY ONLY. The caller has already subtracted it from `qty`, because the
   * stores that record it are the caller's (`ops_stock_pool_usage` for a
   * customer line; `purchase_demands.remaining_qty`, which is generated in the
   * database, for a typed demand). Nothing in this file nets it, and
   * `consumeFreeStock` stays OFF — the ruling that goods are labelled per
   * order is untouched (Jess, 2026-07-21).
   */
  takenFromStock?: number;
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
  /**
   * P10 — FREE ready-stock RECORDS, keyed by `ToOrderLine.stockKey`, oldest
   * first. Records rather than a number, because the pool draw reserves a
   * record entire: what can be taken is a question about which records fit,
   * not about a total (see the allocation block).
   *
   * Absent → no row is offered anything and the grid is byte-identical to
   * what it rendered before P10 — which is what keeps `Take` a feature of a
   * warehouse that has stock, rather than a change to the page.
   */
  freeStock?: Record<string, readonly { id: string; qty: number }[]>;
  /**
   * T3 — the OPEN purchase-order lines behind `supply.openPoBySku`, keyed by
   * the same `sku` the pool is keyed on, in a stable caller-chosen order.
   *
   * The engine drains an aggregate NUMBER per SKU, so it cannot say which
   * document covered which unit. This list lets `buildToOrder` replay that
   * same draw — same order, same amounts — and name them exactly, without
   * changing the engine's allocation.
   *
   * Absent → the cover NUMBER still travels and the hover simply does not
   * exist. A reference is never guessed.
   */
  openPoRefs?: Record<string, readonly { poId: string; qty: number }[]>;
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
  /**
   * P10 — how many of this build's units free ready stock could cover TODAY.
   * Advisory: nothing is netted, the row's `qty` is untouched, and the number
   * exists so a human can decide. `0` means the row is visually untouched.
   *
   * **A build of more than one line always reads 0, and that is structural.**
   * Such a build is a sofa's modules: its quantity is ONE sofa while its
   * members are N different SKUs, so "take 1 from stock" would mean drawing a
   * unit of every module, and a partial match would reserve modules that
   * cannot make a sofa. A lone line has one SKU and one number, so the
   * arithmetic is unambiguous — the same discriminator P11 established for
   * the quantity itself.
   */
  freeStock: number;
  /**
   * P10 — the exact register records `freeStock` counts, FIFO. The take draws
   * THESE and nothing else, so the number a row shows and the units its button
   * reserves are one answer rather than two that have to agree.
   */
  freeStockItemIds: string[];
  /** P10 — units of this build already taken from ready stock (display only;
   *  `qty` is already net of it). */
  takenFromStock: number;
  /**
   * T3 — units of this build that an OPEN purchase order already covers.
   *
   * `qty` IS already net of it — the engine subtracted it before this file saw
   * the line, which is exactly why the number has to be carried: without it a
   * quantity that fell has nothing on screen saying what took it.
   *
   * **A build whose every line was FULLY covered is not here at all**, and that
   * is not a bug. Such a line has nothing left to buy, so it leaves the
   * workspace the same way a line covered by a reserved unit does. What
   * survives to carry a number above zero is a PARTLY covered line — 3 asked
   * for, 2 on a purchase order, 1 still to buy. The demand comes straight back
   * if that purchase order is cancelled: the engine reads `status = 'open'`
   * and nothing else, so nothing is lost, only unstated.
   */
  coveredByOpenPo: number;
  /**
   * T3 — the purchase orders `coveredByOpenPo` came from, in the engine's own
   * draw order. EMPTY when the caller passed no `openPoRefs`; the number ships
   * alone rather than with a guessed document.
   */
  coveredByOpenPoPos: string[];
  /**
   * ⭐ T6 (Loo, 2026-08-06) — EVERY unit of this build is already on an open
   * purchase order, so there is nothing left to buy.
   *
   * Such a build used to be DROPPED, and with it the whole customer order when
   * all of its lines were covered — measured on production the day this
   * shipped: **78 eligible demand lines, 41 covered, all 41 covered in full**,
   * so `SO-1210` simply vanished and the page answered *"where is SO-1210?"*
   * nowhere. Loo ruled it stays, with its real purchase-order number.
   *
   * It reaches the grid as a RECEIPT — the same shape an already-ordered row
   * has had since 2026-08-01 — which is what keeps it out of the selection, the
   * totals, the rail counts and `Issue` without a single new rule: every one of
   * those already asks *does this row have a purchase order?*
   *
   * **`coveredByOpenPoPos` may name a purchase order raised for ANOTHER
   * customer.** The engine nets per SKU, earliest deadline first, so the units
   * go to whoever needs them soonest — measured, 18 of 54 covered demand rows.
   * The number answers *where are these units coming from*, never *this is your
   * document*, and it can change between refreshes when a more urgent order
   * joins the pool. Nothing is lost when it moves; the allocation moved.
   */
  fullyOnPo?: boolean;
}

export interface ToOrderRow {
  orderId: string;
  so: number | null;
  customer: string;
  /** TRUE = a Ready Stock demand, not a customer order. */
  readyStock?: boolean;
  /** The chosen destination, on a Ready Stock row only. */
  destination?: string | null;
  /** Business unit: sofas, mattresses, bedframes — never module lines. */
  qty: number;
  summary: string;
  /** `arriveBy` from the engine. `null` when the customer order has no date. */
  stockReady: IsoDate | null;
  /**
   * The CUSTOMER's delivery date — the one date an operator sees (Loo,
   * 2026-08-01: the grid speaks business language; `Order By` is the
   * engine's and never reaches the screen). `null` when TBD.
   */
  delivery: IsoDate | null;
  /**
   * P18 — the ORDER's planned production-start date. Prints on the GROUP
   * HEADER, never on a row: every line under `SO-1209` shares it, so a column
   * would hold the width forever to say the same thing three times (Loo,
   * 2026-08-04). `null` on a Ready Stock demand.
   */
  proceedDate: IsoDate | null;
  /**
   * THIS ORDER's earliest raise-by — the engine's own date, carried ONLY so
   * the Work Queue can bucket the row into Today / Tomorrow / This Week /
   * Next Week. It is NEVER rendered: the GOLDEN RULE stands, the operator
   * sees the customer's date and nothing of the engine's arithmetic.
   */
  orderBy: IsoDate | null;
  builds: ToOrderBuild[];
  /** P10 — Σ of the builds'. Advisory; never netted out of `qty`. */
  freeStock: number;
  /** P10 — Σ of the builds'. `qty` is already net of it. */
  takenFromStock: number;
  /** T3 — Σ of the builds'. `qty` is already net of it. */
  coveredByOpenPo: number;
  /** T3 — the purchase orders behind it, deduped, in draw order. */
  coveredByOpenPoPos: string[];
}

/**
 * A row that already became a purchase order — read back so the grid can
 * answer "what did we order" without leaving the page (Jess, 2026-08-01:
 * Today + PO filter `Ordered` = 今天已经下了哪些). The server composes the
 * label in the same voice as the demand rows; recent only — real history
 * belongs to Purchase Orders.
 */
export interface ToOrderOrderedRow {
  /** `purchase_orders.id` — the PO number IS the primary key. */
  poId: string;
  /** The day the PO was created — the row's time bucket runs on this. */
  placedAt: IsoDate;
  category: ProductCategory;
  supplierId: string;
  /**
   * The factory's own name. On the wire since 2026-08-03 because the grid grew
   * a Supplier column: an ordered row can belong to a supplier that has no
   * demand today, so resolving the name from the live proposals alone would
   * print `—` on exactly the rows a purchaser is checking up on.
   */
  supplierName: string | null;
  orderId: string | null;
  customer: string | null;
  so: number | null;
  /** The customer's date, same meaning as a demand row's. */
  delivery: IsoDate | null;
  /**
   * P18 — the ORDER's planned production-start date, same meaning as a demand
   * row's.
   *
   * It rides the RECEIPT row too, and that is not tidiness: an order whose
   * every line has been bought has no demand rows left, so its group is made of
   * receipts alone. Carrying it on demand rows only would blank the header on
   * exactly the orders a purchaser is checking up on.
   */
  proceedDate: IsoDate | null;
  model: string;
  qty: number;
}

export interface ToOrderProposal {
  key: string;
  supplierId: string;
  supplierName: string;
  /** Governs whether an Issue document needs a procurement partner. */
  supplierKind?: "own_logistics" | "factory_pickup";
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

  /**
   * ── T3 — WHAT AN OPEN PURCHASE ORDER ALREADY COVERS ──────────────────────
   *
   * The engine has computed this per line since the day it was written and it
   * reached nobody: `buildToOrder` drops a fully covered line (nothing left to
   * buy) and prints a partly covered line's REDUCED quantity with nothing
   * beside it. So the grid says `Qty 1` where the customer ordered 3, and the
   * two units on `PO-2051` are stated on no screen — the buyer cannot answer
   * *why 1?* and cannot check the plan.
   *
   * NO NEW ARITHMETIC. `coveredByOpenPo` is read off the engine's result, and
   * the DOCUMENTS behind it are recovered by replaying the engine's own draw:
   * `net.lines` comes back in allocation order (earliest deadline, then
   * earliest placed — the same property P10's stock offer relies on), so
   * draining the caller's per-PO list in that order, by exactly the units the
   * engine allocated, names each line's purchase orders precisely. The engine
   * is untouched: it still drains one aggregate number per SKU.
   */
  const coveredByLine = new Map<string, number>();
  const poRefsByLine = new Map<string, string[]>();
  {
    const refPool = new Map<string, { poId: string; qty: number }[]>();
    for (const [sku, refs] of Object.entries(input.openPoRefs ?? {})) {
      refPool.set(
        sku,
        refs.map((r) => ({ poId: r.poId, qty: Math.max(0, r.qty) })),
      );
    }
    for (const r of net.lines) {
      coveredByLine.set(r.line.lineId, r.coveredByOpenPo);
      let need = r.coveredByOpenPo;
      if (need <= 0) continue;
      const recs = refPool.get(r.line.sku);
      if (!recs) continue;
      const named: string[] = [];
      for (const rec of recs) {
        if (need <= 0) break;
        if (rec.qty <= 0) continue;
        const take = Math.min(need, rec.qty);
        rec.qty -= take;
        need -= take;
        named.push(rec.poId);
      }
      if (named.length > 0) poRefsByLine.set(r.line.lineId, named);
    }
  }
  /** Deduped, order preserved — one purchase order is named once. */
  const namePos = (ids: readonly string[]): string[] => [...new Set(ids)];

  /**
   * T6 — what a line's row says under `Qty`: what is still to BUY, or, when a
   * purchase order already covers every unit, what that purchase order carries.
   * One expression, so the quantity a receipt shows and the quantity that made
   * it a receipt can never disagree.
   */
  const shownQtyOf = (m: { lineId: string; qty: number }): number => {
    const buy = toOrderByLine.get(m.lineId) ?? m.qty;
    return buy > 0 ? buy : (coveredByLine.get(m.lineId) ?? 0);
  };

  /**
   * P10 — WHAT FREE READY STOCK COULD COVER, offered and never taken.
   *
   * `consumeFreeStock` stays OFF (Jess, 2026-07-21: goods are labelled per
   * order and auto-eating them without a WMS confuses goods-in/out). Her
   * ruling is right and it is untouched — the defect P10 fixes is that a
   * decision reserved for a human was never SHOWN to the human. So the free
   * pool is allocated exactly as the engine allocates the others, and the
   * result is put ON the row instead of subtracted FROM it.
   *
   * THREE PROPERTIES, and each is why this is here rather than in the caller:
   *
   * 1. `net.lines` comes back in the engine's OWN allocation order (earliest
   *    deadline, then earliest placed), so the units are offered in the same
   *    order open POs are — the customer waiting longest is offered them
   *    first, and no two rows are ever offered the same unit.
   *
   * 2. **Whole records only.** A register record is ONE record of N units
   *    (0218), and the pool draw reserves a record entire. Offering 2 out of a
   *    record of 555 would reserve 553 units nobody asked for, so a record
   *    that does not fit what is still needed is skipped rather than split.
   *
   * 3. **The ids come out with the number.** The offer and the act read the
   *    same list, so what a row shows IS what its button draws — the property
   *    P9 established on this page, held by construction rather than by two
   *    computations agreeing.
   */
  const offerByLine = new Map<string, { qty: number; itemIds: string[] }>();
  if (input.freeStock) {
    // A module line is not offerable — see `ToOrderBuild.freeStock`. Marked
    // from the SAME grouping the builds are made from, so the two cannot drift.
    const groupSize = new Map<string, number>();
    const groupOf = (l: ToOrderLine) => `${l.orderId}::${l.buildKey ?? `line::${l.lineId}`}`;
    for (const l of eligible) groupSize.set(groupOf(l), (groupSize.get(groupOf(l)) ?? 0) + 1);

    const pool = new Map<string, { id: string; qty: number }[]>();
    for (const [k, recs] of Object.entries(input.freeStock)) pool.set(k, [...recs]);

    for (const r of net.lines) {
      const line = r.line as ToOrderLine;
      const need = r.toOrder;
      if (need <= 0) continue;
      if ((groupSize.get(groupOf(line)) ?? 1) > 1) continue;
      const recs = pool.get(line.stockKey ?? line.sku);
      if (!recs || recs.length === 0) continue;
      let qty = 0;
      const itemIds: string[] = [];
      for (let i = 0; i < recs.length && qty < need; i += 1) {
        const rec = recs[i]!;
        if (qty + rec.qty > need) continue; // would over-reserve — skip, never split
        qty += rec.qty;
        itemIds.push(rec.id);
      }
      if (qty <= 0) continue;
      pool.set(
        line.stockKey ?? line.sku,
        recs.filter((rec) => !itemIds.includes(rec.id)),
      );
      offerByLine.set(line.lineId, { qty, itemIds });
    }
  }

  const supplierName = new Map(input.suppliers.map((s) => [s.id, s.name]));
  const missing = new Set(
    (input.missingProductionDays ?? []).map((m) => `${m.supplierId}::${m.category}`),
  );

  // group 1 — supplier × category
  const byPair = new Map<string, ToOrderLine[]>();
  for (const l of eligible) {
    // T6 — a line with nothing left to buy STAYS when an open purchase order
    // is the reason (it becomes a receipt below); it leaves only when there is
    // no reason to show at all.
    if (
      (toOrderByLine.get(l.lineId) ?? 0) <= 0 &&
      (coveredByLine.get(l.lineId) ?? 0) <= 0
    )
      continue;
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
          // A sofa build IS one sofa however many MODULE LINES it has — that
          // rule collapses `1B(LHF)` + `CNR` + `2A(RHF)` into one physical
          // sofa, and it is frozen and correct.
          //
          // It may only be applied to a group that HAS modules. The grouping
          // key is `buildKey ?? line::<lineId>`, so a sofa line with no build
          // key becomes a group of ONE — a typed ready stock demand, or a
          // customer line for a non-modular sofa. Collapsing a group of one to
          // `1` threw its quantity away silently (P11): type 5, the PO says 1.
          //
          // So the discriminator is the MODULES, not the category: a group of
          // more than one line is a build and collapses; a lone line carries
          // its own quantity, exactly as every other category does. A group of
          // more than one can only exist under a real build key — a synthetic
          // `line::` key is unique per line — so this cannot collapse anything
          // that is not a build.
          /**
           * T6 — the number this build is ABOUT. Normally what is still to
           * buy; on a build every unit of which is already on an open purchase
           * order, what that purchase order carries. A receipt states the
           * quantity it bought, exactly as an already-ordered row does — and a
           * `0` under `Qty` would be an answer nobody asked for.
           */
          qty:
            isOnePoPerOrder(category) && members.length > 1
              ? 1
              : members.reduce((s, m) => s + shownQtyOf(m), 0),
          fullyOnPo: members.every(
            (m) =>
              (toOrderByLine.get(m.lineId) ?? m.qty) <= 0 &&
              (coveredByLine.get(m.lineId) ?? 0) > 0,
          ),
          title:
            (nameCount.get(named) ?? 0) > 1
              ? `${unitLabel(category, 1)} ${i} — ${named}`
              : named,
          spec: buildSpec(members),
          codes: members.map((m) => m.sku).join(" · "),
          /**
           * WHAT A PURCHASE ORDER WOULD CARRY — so a member with nothing left
           * to buy is not on it. T6 keeps a covered MODULE inside its build
           * (the sofa is still one sofa, and the build must name every part it
           * is made of); this list is the order CONTENT, and a line of zero
           * units is a line the factory should never be sent.
           *
           * A fully covered build keeps its members here for the same reason
           * its `qty` states what was bought: it is a receipt, it is refused by
           * `validateIssuePlan`, and an empty list would describe nothing.
           */
          lines: (members.every(
            (m) =>
              (toOrderByLine.get(m.lineId) ?? m.qty) <= 0 &&
              (coveredByLine.get(m.lineId) ?? 0) > 0,
          )
            ? members
            : members.filter((m) => (toOrderByLine.get(m.lineId) ?? m.qty) > 0)
          ).map((m) => ({
            lineId: m.lineId,
            sku: m.sku,
            qty: shownQtyOf(m),
            cost: m.cost,
          })),
          // A build of MODULES gets no offer — see the field's own comment.
          // `offerByLine` already refuses one; asking here too would be a
          // second rule to keep in step, so it reads the one answer.
          freeStock: offerByLine.get(members[0]!.lineId)?.qty ?? 0,
          freeStockItemIds: offerByLine.get(members[0]!.lineId)?.itemIds ?? [],
          takenFromStock: members.reduce((s, m) => s + (m.takenFromStock ?? 0), 0),
          // T3 — how many units an open purchase order already covers. On a
          // PARTLY covered build it stands beside the remainder it explains
          // (`On PO 2` next to `Qty 1`); on a fully covered one (T6) it IS the
          // build, and `fullyOnPo` below says so.
          coveredByOpenPo: members.reduce(
            (s, m) => s + (coveredByLine.get(m.lineId) ?? 0),
            0,
          ),
          coveredByOpenPoPos: namePos(
            members.flatMap((m) => poRefsByLine.get(m.lineId) ?? []),
          ),
        });
      }

      // The row is the sum of the things under it. It used to be computed a
      // second time from the lines (and, for sofa, as `builds.length`), which
      // is two counts that have to agree; summing the builds makes the row and
      // its builds agree BY CONSTRUCTION. For every non-sofa category the
      // answer is unchanged — each line is its own build, so the sum is the
      // same sum over the same lines.
      const qty = builds.reduce((s, b) => s + b.qty, 0);

      const bundle = bundleByLine.get(orderLines[0].lineId);
      const stockReady = bundle?.arriveBy ?? null;
      /** This ORDER's earliest raise-by — the row's own time bucket runs on it. */
      let rowOrderBy: IsoDate | null = null;
      for (const l of orderLines) {
        const rb = bundleByLine.get(l.lineId)?.raiseBy ?? null;
        if (rb && (orderBy == null || rb < orderBy)) orderBy = rb;
        if (rb && (rowOrderBy == null || rb < rowOrderBy)) rowOrderBy = rb;
      }

      rows.push({
        orderId,
        so: orderLines[0].so,
        customer: orderLines[0].customerName ?? "—",
        // A Ready Stock row has no customer and no SO; what it HAS is a
        // destination, and that is what the group header says instead.
        readyStock: orderLines[0].readyStock === true ? true : undefined,
        destination: orderLines[0].destinationName ?? undefined,
        // An ORDER fact, read off the first line exactly like `so` and
        // `customer` above — every line of the order carries the same value.
        proceedDate: orderLines[0].proceedDate ?? null,
        // The earliest customer deadline across the order's lines — the
        // business date the operator sees (the engine's own dates never do).
        delivery: orderLines.reduce<IsoDate | null>(
          (min, l) =>
            l.deadline != null && (min == null || l.deadline < min) ? l.deadline : min,
          null,
        ),
        orderBy: rowOrderBy,
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
        // Summed from the builds for the same reason `qty` is (P11): a row and
        // the things under it agree by construction, never by two counts
        // happening to match.
        freeStock: builds.reduce((s, b) => s + b.freeStock, 0),
        takenFromStock: builds.reduce((s, b) => s + b.takenFromStock, 0),
        coveredByOpenPo: builds.reduce((s, b) => s + b.coveredByOpenPo, 0),
        coveredByOpenPoPos: namePos(builds.flatMap((b) => b.coveredByOpenPoPos)),
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
  /**
   * T6 — every unit is already on an open purchase order, so this build is a
   * RECEIPT and may not be issued. It rides the ref because the issue gate
   * reads refs, not builds, and a rule the gate cannot see is not a rule.
   */
  fullyOnPo?: boolean;
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
        fullyOnPo: b.fullyOnPo,
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
  | "batch_too_large"
  /** T6 — the build is on the sheet as a receipt; every unit is already bought. */
  | "already_on_po";

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
      /**
       * T6 — a fully covered build is on the sheet now, as a RECEIPT. The page
       * cannot tick one (`selectable` refuses a row with a purchase order), so
       * this can only be reached by a stale tab or a hand-made request — and
       * either way it would buy goods that are already bought. Refused HERE,
       * server-side, because a rule that lives only in the browser is not a
       * rule.
       */
      if (b.fullyOnPo) {
        return {
          ok: false,
          code: "already_on_po",
          message: "Something on this plan is already on a purchase order.",
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
