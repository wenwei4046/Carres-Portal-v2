import { fmtDate } from "@/lib/fmt-date";
/**
 * ⭐ THE CHILD MINI-TABLE — ONE IMPLEMENTATION, owner ruling 2026-08-15 (Chai).
 *
 * `▸` has exactly one job (CLAUDE.md §2): the order's own goods. This is the
 * box that job prints in, and it is written ONCE so that two pages cannot
 * drift into two mini-tables that almost agree.
 *
 * ```
 * [☑] │ Category │ Unit ID │ Deliver To │ SKU │ Qty │ Item
 * ```
 *
 * THREE LAWS, and every one of them is about READING TWO EXPANSIONS AT ONCE:
 *
 * ① ALIGNMENT. Every column but `Item` is a FIXED width, identical on every
 *   expanded row, so two orders opened together read as one listing instead of
 *   two tables that happen to be near each other. `Item` is the only flexible
 *   column and it is ALWAYS LAST — a flexible column in the middle would move
 *   every column after it and break exactly the thing the fixed widths buy.
 *   The cells carry the parent grid's own `0 8px`, so the 16px minimum gap the
 *   owner ruled is met AND the first child value lands directly under the
 *   parent's `SO No` text rather than eight pixels off it. (Where the BOX
 *   begins is the engine's job — `DataGrid` indents the expansion row by the
 *   ☐ · ▸ gutter so the box's left edge is the `SO No` column's left edge.)
 *
 * ② TWO TYPE LEVELS, NEVER THREE. The header is 11px grey in the parent
 *   header's own treatment; EVERY value is 13px. The old table had four sizes
 *   in six columns — an 11px `Category`, a 12px mono `SKU`, a 13px `Item` and
 *   a 12px configuration line — and four sizes in one box read as four ranks
 *   of importance that the data does not have. `Unit ID` and `SKU` keep the
 *   mono family (a code is scanned character by character); they lose the
 *   smaller size.
 *
 * ③ GRID LINES ARE THE READING GUIDE (owner correction 2026-08-20). The
 *   child remains a bordered nested object, but its six columns must not float
 *   in white space. Every header and value row carries the same visible
 *   vertical dividers, and multiple goods lines carry matching horizontal
 *   dividers, so the eye can follow one value to its heading without guessing.
 *
 * ④ SELECTION IS A CAPABILITY, NOT A COPY. A page that BUYS from these lines
 *   passes `selection` and gets the leading ☑ column; a truth register passes
 *   nothing and gets the same table without it (a register selects nothing).
 *   The header row never carries a checkbox — select-all belongs to the parent
 *   row, which is the whole-order switch. A line nothing can be bought for
 *   prints `—` in that cell and cannot be ticked.
 */
// design-standard: not-a-list-page — this is the CHILD of a register row, not
// a page. It has no destination, no toolbar and no header of its own; the
// register above it owns all three, and wrapping a disclosure in ListPageShell
// would draw a second page chrome inside one table cell.
import { Fragment, type ReactNode } from "react";
import Button from "@/components/kit/Button";
import Popover from "@/components/kit/Popover";
import { lineClass } from "@carres/shared";

/**
 * The owner's re-ruled column order (2026-08-15), and the measured widths.
 *
 * Widths are the CONTENT's, at the 13px body the values now print in, plus the
 * 16px the two paddings cost:
 *
 * ```
 *   Category    `Mattress protector`   115 + 16   →  132
 *   Unit ID     mono, a 14-char code   109 + 16   →  140  (13px mono ≈ 7.8/char)
 *   Deliver To  `AL Sungai Buloh ×10`  124 + 16   →  200  (a partner's own name
 *                                                          has no upper bound;
 *                                                          200 holds every one
 *                                                          in the table today)
 *   SKU         mono, `M1401F-K-SS`     94 + 16   →  152
 *   Qty         header floor            24 + 16   →   64
 *   Item        the flexible remainder             →  flex
 * ```
 */
const CHILD_COLUMNS = [
  { key: "category", label: "Category", width: 132 },
  { key: "unit", label: "Unit ID", width: 140 },
  { key: "deliverTo", label: "Deliver To", width: 200 },
  { key: "sku", label: "SKU", width: 152 },
  { key: "qty", label: "Qty", width: 64 },
  { key: "item", label: "Item", width: null },
] as const;

/**
 * ⭐ `Covered by` IS RETIRED — owner correction 2026-09-11.
 *
 * One heading answered three different questions at once: units already drawn
 * from the shelf, purchase orders already carrying the quantity, and `Not
 * ordered yet`. An operator reading `PO-20260820-4827` under *Covered by* could
 * not tell how MUCH of the line that document covers, and a line that was half
 * bought looked exactly like a line that was wholly bought.
 *
 * The facts did not go away; they went to explicit places. `Ordered Qty` states
 * how many units documents have carried for this line, `To buy` states the
 * remainder this page can still act on, and `Qty` stays the customer's original
 * order. Ready-Stock coverage is stated by the `Ready Stock` section below,
 * which owns that fact and can name the exact Units.
 *
 * ⭐ IT IS A NUMBER, NOT A LIST — owner correction 2026-09-11.
 *
 * It printed every purchase order covering the line, stacked inside the cell.
 * On a line fourteen documents touch, ONE item row became fourteen lines tall
 * and filled the screen — and the same fourteen numbers were then repeated in
 * the rows below it. A collection must never decide how tall an item row is.
 * The cell states the quantity, and is a DOOR to the read-only details where
 * each document is its own row. The evidence is not truncated; it is moved to
 * the table that is about documents.
 *
 * ⭐ AND IT IS `Ordered Qty`, NOT `On PO` — owner correction 2026-09-11.
 *
 * `On PO` is the dictionary's head for *how many of this item an OPEN purchase
 * order already covers* — the engine's pooled, netted, EFFECTIVE coverage. The
 * number this cell prints is a different one: the exact `po_line_sources`
 * lineage for this item line, which counts every NON-CANCELLED document,
 * `Completed` ones included, and is never netted by what has already arrived.
 * It is the HISTORICAL ordered quantity, and printing it under `On PO` said
 * "still on order" about goods that may be in the warehouse.
 *
 * `Ordered Qty` is the approved word for exactly that, already in the
 * dictionary and already used by Manual Purchase's own purchase-order lineage
 * table for the same relationship — beside `Already On PO` for the effective
 * coverage it is deliberately NOT. Nothing else moves: one figure, one head,
 * the same door.
 */
const FROM_STOCK_COLUMN = { key: "fromStock", label: "Ready Stock", width: 96 } as const;
/* 112, not 176 and not 88. The cell holds a QUANTITY, so it needs almost
   nothing — but the governed absence `Not ordered yet` measures 96px at the
   box's 13px, and anything under 96 + the cell's own 16px of padding wrapped
   it to two lines. A WORD deciding an item row's height is the same defect as
   a list of documents deciding it, only smaller. Measured on the rendered
   preview, 2026-09-11. */
const ORDERED_QTY_COLUMN = { key: "orderedQty", label: "Ordered Qty", width: 116 } as const;
/* 148, not 74. `To buy` carries two written lines under its figure when the
   number is the coverage a tick would buy AGAIN rather than a remainder, and
   the longer of them — `Issue PO buys again` — measures 118px at the box's
   13px. Below 148 (132 of content) it wrapped, which took the item row to 91px
   and made a note nobody reads out of the one sentence that says what the act
   DOES. Measured on the rendered preview, 2026-09-11. */
const TO_BUY_COLUMN = { key: "toBuy", label: "To buy", width: 148 } as const;

/**
 * ⭐ `Supplier Deliver To`, NOT `Deliver To` — owner ruling 2026-09-18
 * (`docs/COPY-STANDARD.md` — Purchasing UI dictionary).
 *
 * On a page where a customer's address and a supplier instruction sit in one
 * expansion, `Deliver To` said WHOSE destination only by where it happened to
 * be. The head now says it. SO Batch asks for the new word; every other caller
 * keeps the column it has until its own round.
 */
const SUPPLIER_DELIVER_TO_LABEL = "Supplier Deliver To";

/** Air between an item row and the picker its disclosure opened — the last
 *  stretch the connector crosses before it lands (§6.9). */
const DETAIL_GAP = 12;
/** The disclosure caret's centre, measured in from the right of its cell:
 *  8px cell padding + the button's own 4px + half the caret. Walked at 1440 in
 *  the rendered portal: the line's centre lands on the caret's centre. */
const CONNECTOR_INSET = 15;
/** Where the line starts: the cell's 8px of top padding plus the caret's own
 *  height, so it leaves from directly BENEATH the arrow and not from the top of
 *  the cell. Stated, never measured — a line that re-measures is a line that
 *  moves when a table loads. */
const CONNECTOR_TOP = 28;
/** And where it ENDS: past this cell's bottom edge, across the 1px row divider
 *  and the gap below, exactly on the TOP BORDER of the picker's frame. */
const CONNECTOR_BOTTOM = -(DETAIL_GAP + 1);

/**
 * ⭐ `Supplier` · `PO Delivery Date` — CARD 02-B's exact-mapping columns
 * (owner ruling 2026-08-27). Optional, exactly like `Covered by` and for the
 * same reason: when one Sales Order spans two purchase orders, the parent row
 * can only summarise (`2 suppliers` · `Multiple`), so the child box is where
 * the exact item-to-PO/supplier/date mapping lives. Both are fixed columns
 * inserted BEFORE `Item` — law ① keeps `Item` last and flexible. Sales Orders
 * and Delivery pass neither and render byte-identically.
 */
const SUPPLIER_COLUMN = { key: "supplier", label: "Supplier", width: 140 } as const;
const PO_DATE_COLUMN = { key: "poDeliveryDate", label: "PO Delivery Date", width: 150 } as const;

/**
 * ⭐ `PO No` — MANUAL PURCHASE'S OWN COLUMN (settled design, owner ruling
 * 2026-09-11). Optional, exactly like the three above and for law ④'s reason.
 *
 * SO Batch answers *what covers this item line* with `Covered by`, because a
 * customer line can be covered by Ready Stock OR a purchase order and the
 * operator needs both in one cell. A Manual Purchase line has no Ready Stock
 * coverage to state — an internal replenishment is not answered by the shelf
 * — so the honest column is the DOCUMENT, and the owner ruled `Covered by`
 * off this page for exactly that reason. It sits directly before
 * `PO Delivery Date`: the two are one document's facts, read together.
 */
const PO_NO_COLUMN = { key: "poNo", label: "PO No", width: 168 } as const;

/** ☑ is chrome, so it is narrow and it is not one of the six ruled columns. */
const SELECT_WIDTH = 36;

/**
 * The sum of the fixed columns plus a floor for `Item`. Below this the box
 * scrolls sideways rather than crushing a column — the portal's standing
 * answer everywhere else (Purchase Orders, To Order), never truncation.
 */
const ITEM_FLOOR = 220;

/** One goods line, already resolved to strings by the page that owns the data. */
export interface GoodsMiniLine {
  /** Stable identity — the selection key, and React's key. */
  key: string;
  /** Already display-cased by `categoryWord`. */
  category: string;
  /** One printed line each; empty means the absence below is printed instead. */
  unitIds: string[];
  /** Optional read-only inspection surface supplied by the owning page. */
  unitNode?: ReactNode;
  /** The governed word for an empty `Unit ID` on THIS kind of line. */
  unitAbsence: string;
  deliverTo: string[];
  deliverToAbsence: string;
  /**
   * Card 02-B — a line whose destination is still being ARRANGED renders its
   * own editable control instead of the printed strings. The page owns the
   * control (the existing `DestinationAllocationEditor`); this box only gives
   * it the cell. Absent = the strings render exactly as before.
   */
  deliverToNode?: ReactNode;
  /** Units of this line already answered off the shelf. Read with `showFromStock`. */
  fromStock?: number | null;
  /**
   * ⭐ THE READY STOCK CELL, DRAWN BY THE PAGE — owner ruling 2026-09-18.
   *
   * SO Batch's `Ready Stock` is no longer a number: it is two counts and a
   * disclosure that opens the stock picker under this very row. Both the counts
   * and the act belong to the page that can read and write stock, so the box
   * only gives it the cell. Absent = the plain figure renders exactly as before.
   */
  fromStockNode?: ReactNode;
  /**
   * ⭐ `Need PO` / `No PO needed` — the need for a NEW purchase order, never a
   * progress badge and never permission to buy. Read with `showStatus`.
   */
  status?: string;
  /** The remainder this page can still buy on this line. Read with `showToBuy`. */
  toBuy?: number | null;
  orderBy?: string | null;
  orderByAbsence?: string;
  /**
   * ⭐ THE SENTENCE UNDER `To buy`, when that number is NOT a remainder
   * (owner correction 2026-09-11).
   *
   * The engine prints the covering document's quantity under `To buy` when
   * every unit of a build is already on an open purchase order, because the
   * row stays buyable — the pool has no customer attribution, so the covering
   * document routinely belongs to somebody else. But a remainder and a re-buy
   * offer are opposite situations wearing the same number, and a screen that
   * cannot tell them apart invites a purchase nobody meant to make.
   *
   * The page supplies the words; this box only prints them, quietly, under the
   * figure they qualify. `toBuyNoteWhy` is the longer governed explanation,
   * carried as the cell's title — a sentence that wraps to three lines under a
   * one-digit number is a row-height defect wearing words.
   */
  toBuyNote?: readonly string[];
  toBuyNoteWhy?: string;
  /**
   * How many units of this line purchase orders have carried — the HISTORICAL
   * ordered quantity, not open-PO coverage. A NUMBER: the documents themselves
   * are named once, in the read-only details table the page draws beneath this
   * one. Read with `showOrderedQty`.
   */
  orderedQty?: number | null;
  /** The governed word for a line no document has ever carried. */
  orderedQtyAbsence?: string;
  /** Card 02-B — read only when the table is asked for the column. */
  supplier?: string;
  supplierAbsence?: string;
  poDeliveryDate?: string;
  poDeliveryDateAbsence?: string;
  /** The purchase orders THIS row's quantity went onto. Read only when the
   *  table is asked for `PO No`; empty prints the absence below. */
  poNos?: string[];
  poNoAbsence?: string;
  sku: string;
  qty: number;
  item: string;
  /** The configuration facts that identify the exact goods, already joined. */
  itemDetail?: string;
  /**
   * FALSE = nothing can be bought for this line (a Service). It prints `—` in
   * the ☑ cell and select-all skips it. Ignored when the page passes no
   * `selection` at all.
   */
  selectable: boolean;
  testId?: string;
}

export interface GoodsMiniTableSelection {
  selectedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

/**
 * ⭐ AN ABSENCE IS QUIETER THAN A FACT (the register's own rule, 2026-08-15),
 * and it holds inside the child box too: `Not allocated` keeps its word and
 * loses its weight, so a column of eight absences and two real unit codes
 * reads as two facts.
 */
function Absence({ children }: { children: ReactNode }) {
  /* `font-sans` because an absence is a WORD, not a code: `Not allocated` set
     in the `Unit ID` column's mono face reads like a unit somebody registered
     under that name. The column keeps mono for the codes it actually holds. */
  return (
    <span className="font-sans text-kit-slate-11" data-absence="true">
      {children}
    </span>
  );
}

/**
 * `Mattress`, never `MATTRESS` (owner ruling 2026-08-15). SHOUTING was the
 * fourth type level in a box the owner has now ruled to two: the category is a
 * plain fact in the same ink as every other value, and a fact is written the
 * way a person writes it.
 */
export function categoryWord(raw: string): string {
  const clean = raw.replace(/[_-]+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * ⭐ THE `Category` CELL HAS ONE ANSWER — extracted 2026-08-21 (DELIVERY CARD
 * 02), after Delivery Work shipped a second, worse one.
 *
 * The box is written once so two pages cannot drift into two mini-tables that
 * almost agree; the STRING in its first column has exactly the same problem,
 * and the second occurrence is the full stop (UI-KIT §6.1). Delivery Work's own
 * copy dropped the `lineClass` step and printed `Other goods` on every live row
 * — 90 of them — while the Sales Orders register, reading the identical line,
 * printed `Mattress`. Found on the production walk.
 *
 * FOUR SOURCES, IN FALLING ORDER OF AUTHORITY — the SAME ladder the SO detail
 * document reads (`categoryWord` in SalesOrderWorkspace), because a line that
 * says `Mattress` on the document and `Other goods` in a register footer is a
 * tally the operator trusts and cannot reproduce (found by Jess, 2026-08-24 —
 * `Other goods 44`):
 *   1. what the order line itself RECORDS (`attrs.category`);
 *   2. the CATALOG's word (`line.category`, resolved server-side through
 *      `skuCategories` — the one category reader, Law D). ABSENT = an older
 *      Worker that does not send it; NULL = asked, no catalog row — both fall
 *      through;
 *   3. the canonical SKU's own head (`mattress:` / `bedframe:` / `sofa:`);
 *   4. `lineClass` — the shared classifier, the only rung that can read an
 *      AutoCount SKU like `H1401F-K`.
 *
 * `unknown` prints `Other goods` and `acc` prints `Accessory`: a line nothing
 * recognises says so, and never borrows a category it did not earn.
 */
export function goodsCategoryOf(line: {
  sku: string;
  attrs?: Record<string, unknown> | null;
  category?: string | null;
}): string {
  const fromAttrs = typeof line.attrs?.category === "string" ? line.attrs.category : "";
  const fromCatalog = typeof line.category === "string" ? line.category.trim() : "";
  const fromSku = line.sku.includes(":") ? line.sku.split(":", 1)[0]! : "";
  const classified = lineClass(line.sku);
  const classifiedLabel =
    classified === "acc" ? "Accessory" : classified === "unknown" ? "Other goods" : classified;
  return categoryWord(fromAttrs || fromCatalog || fromSku || classifiedLabel);
}

export default function GoodsMiniTable({
  label,
  lines,
  selection,
  soBatchGoodsLayout = false,
  showStatus = false,
  detailRow,
  showSku = true,
  showFromStock = false,
  showOrderedQty = false,
  showToBuy = false,
  showOrderBy = false,
  identityFirst = false,
  salesOrderLayout = false,
  showSupplier = false,
  showPoDeliveryDate = false,
  showPoNo = false,
  showUnitId = true,
  showCategory = true,
  itemHeading,
  onPoClick,
  onOpenPoDetails,
}: {
  /** The table's accessible name — `Goods on SO-1303`. */
  label: string;
  lines: GoodsMiniLine[];
  /** Present only on a page that buys from these lines. */
  selection?: GoodsMiniTableSelection;
  /**
   * ⭐ SO BATCH'S APPROVED ACTIONABLE EXPANSION (Jess 2026-09-18, §9.1):
   * `☐ · Status · Category · Qty · Item · Ready Stock · Supplier ·
   * Supplier Deliver To`. Opt-in; Sales Orders, Delivery, Manual Purchase and
   * Purchase Orders pass nothing and render byte-identically.
   */
  soBatchGoodsLayout?: boolean;
  /** `Need PO` / `No PO needed` — the need for a new document, not permission. */
  showStatus?: boolean;
  /**
   * ⭐ THE ROW THAT OPENS UNDER AN ITEM — owner ruling 2026-09-18.
   *
   * The stock picker opens *directly beneath this item*, inside this table, so
   * it scrolls with the columns it is aligned to and the connector drawn from
   * the disclosure above it cannot drift. `null` = nothing is open on that line
   * and no row is rendered at all.
   */
  detailRow?: (line: GoodsMiniLine) => ReactNode;
  /**
   * SO Batch's approved expansion has no `SKU` column: the item and its
   * configuration identify the goods, and the code took the width the item
   * needs. Every other caller keeps it.
   */
  showSku?: boolean;
  /**
   * A page that BUYS asks for `Ordered Qty` and `To buy`; a truth register does
   * not. Together they state what `Covered by` used to hide: what the customer
   * ordered, what documents have ordered for the line, and what is left.
   */
  showFromStock?: boolean;
  showOrderedQty?: boolean;
  showToBuy?: boolean;
  showOrderBy?: boolean;
  /**
   * ⭐ IDENTITY FIRST — owner correction 2026-09-11, the buying page only.
   *
   * `Category` and `Unit ID` led the ruled order, so the first two things an
   * operator read about a line were the least identifying: a page of
   * `Mattress` · `Not allocated` before any SKU. The goods themselves come
   * first here — SKU, then the item and its configuration, then the numbers.
   * Law ① is kept: exactly ONE column is flexible, every other width is fixed,
   * so two expansions opened together still line up column for column. What
   * changes is WHICH column is flexible and where it sits, not how many.
   * Sales Orders, Delivery and Manual Purchase pass nothing and render
   * byte-identically to what they rendered before.
   */
  identityFirst?: boolean;
  /** Sales Orders: six fixed-content tracks, Item last; codes never wrap. */
  salesOrderLayout?: boolean;
  /**
   * ⭐ THE EXACT MAPPING IS ALSO A DOOR (YH, 2026-09-01).
   *
   * The register's `PO No` cell links only when an order has exactly ONE
   * purchase order; with several it prints "2 POs" and points the reader at
   * this expansion, which the blueprint names as the place the exact numbers
   * live. Those numbers were bare text, so the MORE work an order generated
   * the FEWER doors it had — the operator copied a PO number by eye and went
   * to look for it in Purchase Orders.
   *
   * Optional on purpose: a truth register that only STATES coverage passes
   * nothing and keeps the printed strings. Only a page that can navigate
   * supplies this.
   */
  onCoveredByClick?: (poId: string) => void;
  /**
   * Which `Covered by` entries are documents, decided by the page that built
   * the list. The column mixes real purchase orders with `Ready Stock` — an
   * answer, not a document — and only the caller knows which is which. This
   * box does not learn what a PO number looks like; a predicate that never
   * answers true simply leaves every entry as text.
   */
  isCoveredByLinkable?: (value: string) => boolean;
  /** Card 02-B — the exact-mapping columns the buying Register asks for. */
  showSupplier?: boolean;
  showPoDeliveryDate?: boolean;
  /** Manual Purchase's document column — the PO each allocation went onto. */
  showPoNo?: boolean;
  /**
   * ⭐ A PAGE MAY OMIT `Unit ID`, AND ONLY BECAUSE IT HAS NO SUCH FACT.
   *
   * Sales Orders, Delivery and SO Batch all reach a per-line Unit read, so
   * they keep the ruled column and default to it. Manual Purchase has none:
   * an internal purchase's goods become Units at RECEIVING, through the PO
   * line, and no door maps a request line to them. Drawing the column anyway
   * would print `Not allocated` on every row of every request forever — an
   * absence that states nothing, in the width of a real answer. The honest
   * move is to omit a column this page cannot answer, and to say so in the
   * MASTER rather than fake a read.
   */
  showUnitId?: boolean;
  /**
   * Purchase Orders (MASTER §9.3, Jess 2026-09-17) reads the ordered goods as
   * exactly `SKU · Item / configuration · Qty · Deliver To`: it omits Category
   * and names the item column for what it shows. Every other caller keeps both.
   */
  showCategory?: boolean;
  itemHeading?: string;
  /** Present only on a page whose `PO No` cell should navigate. */
  onPoClick?: (poId: string) => void;
  /**
   * Opens the read-only details where every document covering a line is its
   * own row. Absent = `Ordered Qty` prints its number as plain text, which is
   * what a page with nowhere to send the reader should do.
   */
  onOpenPoDetails?: () => void;
}) {
  /**
   * ⭐ ONE REGISTRY, TWO READING ORDERS — and every width still fixed but one.
   *
   * The ruled order (law ①) is what Sales Orders, Delivery and Manual Purchase
   * draw, unchanged. `identityFirst` is the buying page's order, where the
   * goods identify themselves before anything is said about them. Both are
   * declared as lists of keys rather than assembled by splicing an array at
   * computed offsets, which is how `Supplier` and `PO No` ended up depending
   * on whether `PO Delivery Date` happened to be asked for.
   */
  type Column = { key: string; label: string; width: number | null };
  const REGISTRY: Record<string, Column> = {
    category: { ...CHILD_COLUMNS[0] },
    unit: { ...CHILD_COLUMNS[1] },
    deliverTo: { ...CHILD_COLUMNS[2] },
    sku: { ...CHILD_COLUMNS[3] },
    qty: { ...CHILD_COLUMNS[4] },
    item: { ...CHILD_COLUMNS[5], ...(itemHeading ? { label: itemHeading } : {}) },
    supplier: { ...SUPPLIER_COLUMN },
    poNo: { ...PO_NO_COLUMN },
    poDeliveryDate: { ...PO_DATE_COLUMN },
    fromStock: { ...FROM_STOCK_COLUMN },
    orderedQty: { ...ORDERED_QTY_COLUMN },
    toBuy: { ...TO_BUY_COLUMN },
    orderBy: { key: "orderBy", label: "Order By", width: 104 },
    status: { key: "status", label: "Status", width: 112 },
  };
  /**
   * ⭐ THE SO BATCH GOODS ORDER — owner ruling 2026-09-18, Purchasing §9.1:
   * `☐ · Status · Category · Qty · Item · Ready Stock · Supplier ·
   * Supplier Deliver To`, exactly.
   *
   * FIVE COLUMNS LEFT, and none of the facts did.
   *   · `SKU` — the item and its configuration already identify the goods, and
   *     a code nobody types on this page took the width the item needs.
   *   · `Ordered Qty` and `PO Safety Days` — `Purchase order details` below is
   *     the table that is ABOUT documents, and the parent carries the margin.
   *   · `To buy` — the remaining purchasing quantity belongs where the act is:
   *     the selection bar and the issue review, on the AUTHORITATIVE
   *     recomputation. Removing the column removed no coverage arithmetic and
   *     no duplicate-order safeguard: `isSelectableForBuying`,
   *     `soBatchOrderLineOutstandingQty`, `fullyOnPo` and the issue door's own
   *     refusal are all untouched.
   *   · `Order By` — an engine/detail fact again, never a goods column.
   * `Ready Stock` widens because it stopped being a figure and became the door
   * to the stock picker; `Supplier` takes the reviewed 136 it has on the parent.
   */
  if (soBatchGoodsLayout) {
    REGISTRY.fromStock = { key: "fromStock", label: "Ready Stock", width: 136 };
    REGISTRY.supplier = { key: "supplier", label: "Supplier", width: 136 };
    REGISTRY.deliverTo = { key: "deliverTo", label: SUPPLIER_DELIVER_TO_LABEL, width: 200 };
    REGISTRY.qty = { key: "qty", label: "Qty", width: 64 };
    /* ⭐ `Item` TAKES A MEASURED WIDTH HERE, and law ① is kept a different way.
       The owner's order puts `Item` FOURTH of seven, so it cannot be the
       flexible last column any more — and a flexible column in the middle
       would move every column after it, which is the one thing law ① exists to
       stop. So every column is fixed and the TABLE takes the sum: two
       expansions opened together still line up column for column, and nothing
       stretches to fill a 1440px canvas (§6.8). A long model name wraps to a
       second line inside its cell; it is never clipped. */
    REGISTRY.item = { key: "item", label: itemHeading ?? "Item", width: 240 };
  }
  const order = soBatchGoodsLayout
    ? ["status", "category", "qty", "item", "fromStock", "supplier", "deliverTo"]
    : salesOrderLayout
    ? ["category", "unit", "deliverTo", "sku", "qty", "item"]
    : identityFirst
    ? ["sku", "item", "qty", "fromStock", "orderedQty", "toBuy", "orderBy", "deliverTo", "unit", "supplier", "poNo", "poDeliveryDate", "category"]
    : ["category", "unit", "orderedQty", "deliverTo", "sku", "qty", "fromStock", "toBuy", "orderBy", "supplier", "poNo", "poDeliveryDate", "item"];
  const asked: Record<string, boolean> = {
    unit: showUnitId,
    category: showCategory,
    supplier: showSupplier,
    poNo: showPoNo,
    poDeliveryDate: showPoDeliveryDate,
    fromStock: showFromStock,
    orderedQty: showOrderedQty,
    toBuy: showToBuy,
    orderBy: showOrderBy,
    status: showStatus,
    sku: showSku,
  };
  const columns: Column[] = order
    .filter((key) => asked[key] ?? true)
    .map((key) => REGISTRY[key]!);
  /** A PO number is a DOOR only where the page can open one. */
  const poLink = (poId: string) =>
    onPoClick ? (
      <button
        type="button"
        className="text-kit-blue-11 underline-offset-2 hover:underline"
        data-testid={`goods-po-no-${poId}`}
        onClick={(e) => {
          e.stopPropagation();
          onPoClick(poId);
        }}
      >
        {poId}
      </button>
    ) : (
      <span>{poId}</span>
    );
  /* Below this the box scrolls sideways rather than crushing a column. */
  const minWidth =
    columns.reduce((n, c) => n + (c.width ?? ITEM_FLOOR), 0) + (selection ? SELECT_WIDTH : 0);
  /* Content decides the width on the SO Batch layout; every other caller keeps
     `w-full` and its one flexible column. */
  const tableStyle = soBatchGoodsLayout ? { width: minWidth } : { minWidth };
  const tableClass = soBatchGoodsLayout
    ? "table-fixed text-left"
    : "w-full table-fixed text-left";
  return (
    /* ⭐ A BOX, NOT A CONTINUATION OF THE SHEET — owner correction 2026-08-15.
       The first shipped version fused it into the grid: two rules and nothing
       else, so the child header sat directly against the parent row and read
       as more of the same table. The child of a record is its OWN object, and
       the frame is what says so — the same `rounded-control` border the box
       has always carried, with the register's own breathing space above and
       below it (the ENGINE's, so every expansion sits the same way). The
       LEFT and RIGHT edges are untouched: the frame is drawn on the `SO No`
       column's left edge and the parent table's right edge. */
    <div
      /**
       * ⭐ THE ACTIVE GOODS CONTEXT HAS A BLUE BOUNDARY (§6.9, Jess
       * 2026-09-18). An expansion is a context the operator OPENED, and the
       * boundary is what says where it begins and ends when two are open at
       * once.
       *
       * ⛔ IT IS NOT EVIDENCE OF A SAVED RESERVATION, and nothing about it
       * changes when one is saved: the stock picker inside keeps its own
       * neutral white frame, and what a line actually holds is the `{n}
       * reserved` count and the Unit IDs in the picker — never a colour.
       */
      className={`overflow-x-auto rounded-control bg-white ${
        soBatchGoodsLayout ? "border border-kit-blue-6" : "border border-base-200"
      }`}
      data-testid="goods-mini-table"
    >
      <table
        className={tableClass}
        style={tableStyle}
        aria-label={label}
      >
        <colgroup>
          {selection ? <col style={{ width: SELECT_WIDTH }} /> : null}
          {columns.map((c) => (
            <col key={c.key}
              style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        {/* LEVEL ONE — the parent header's own treatment. ⭐ S5 (owner
            follow-up 2026-09-16): the parent Registers moved to DataGrid's
            `palette="slate"` header — slate-3 fill, slate-11 ink, 11px, 600,
            NORMAL casing — so this child header follows them. The eye should
            not have to learn a second header style eight pixels below the
            first. */}
        <thead className="border-b border-kit-slate-5 bg-kit-slate-3">
          <tr className="divide-x divide-base-200">
            {/* THE HEADER ROW CARRIES NO CHECKBOX (owner ruling). Select-all is
                the PARENT row's box — one whole-order switch, not two. */}
            {selection ? <th className="px-2 py-1.5" aria-label="Select goods line" /> : null}
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                /* The parent header's treatment, spelled in TOKENS: `text-label`
                   is the 11px the owner named, `text-base-500` its grey. The
                   parent's 0.06em tracking is a CSS-module value with no token
                   behind it, and inventing an arbitrary one here to chase the
                   last hundredth of an em would put a new literal into a scale
                   `01-design-tokens.md` has locked. Size, colour and case carry
                   the match — and the weight is 600, because §2.2 deleted 700
                   into 600 and the CSS module's own 700 predates that ruling. */
                className={`px-2 py-1.5 text-label font-semibold text-kit-slate-11${
                  soBatchGoodsLayout ? " align-bottom" : ""
                }`}
                /* ⭐ ONE HEADER HEIGHT FOR EVERY TABLE IN THE EXPANSION (§6.8).
                   `Supplier Deliver To` wraps to two lines and `Qty` does not;
                   without a reserved height the goods table and the stock
                   picker beneath it sat at two different header heights and
                   read as two near-miss listings. */
                style={soBatchGoodsLayout ? { height: 40 } : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* LEVEL TWO — every value, 13px. */}
        <tbody className="divide-y divide-base-200 text-body">
          {lines.map((line) => {
            /**
             * ⭐ ONE ROW PER DEMAND, AND NOTHING ELSE — 2026-09-11.
             *
             * This table used to expand one item line into N Unit rows that
             * each carried the SAME line key, selection state and destination
             * editor, so one ticked demand drew N ticked boxes and the
             * arrangement editor appeared again beside records of documents
             * already sent. The first correction gave the records their own row
             * KIND; the owner's correction goes further and gives them their
             * own TABLE, because a record of what was bought is not a quieter
             * kind of demand — it is a different question, and it belongs under
             * its own heading with `PO No` and `Unit ID` beside each other.
             *
             * What is left here is the actionable demand: one row per line, at
             * the height of its own item description and nothing else's.
             */
            const cell = (key: string) => {
              switch (key) {
                case "category":
                  return line.category;
                case "sku":
                  return <span className={salesOrderLayout ? "block max-w-full overflow-x-auto whitespace-nowrap font-medium" : "font-medium"} title={salesOrderLayout ? line.sku : undefined} tabIndex={salesOrderLayout ? 0 : undefined}>{line.sku}</span>;
                case "item":
                  return (
                    <>
                      <div className="font-medium text-base-900">{line.item}</div>
                      {line.itemDetail ? (
                        <div className="mt-0.5 text-base-600">{line.itemDetail}</div>
                      ) : null}
                    </>
                  );
                case "qty":
                  return <span className="tabular-nums">{line.qty}</span>;
                case "status":
                  return line.status ? (
                    <span data-testid={`goods-status-${line.key}`}>{line.status}</span>
                  ) : (
                    <Absence>—</Absence>
                  );
                case "fromStock":
                  /* THE PAGE DRAWS THIS CELL WHEN IT CAN ACT ON IT. Absent =
                     the plain figure, exactly as every other caller has it. */
                  if (line.fromStockNode != null) return line.fromStockNode;
                  return !line.fromStock ? (
                    <Absence>—</Absence>
                  ) : (
                    <span className="tabular-nums">{line.fromStock}</span>
                  );
                case "orderBy":
                  return <span className="tabular-nums">{line.orderBy ? fmtDate(line.orderBy) : line.orderByAbsence ?? "—"}</span>;
                case "toBuy":
                  /* ⭐ A NUMBER ONLY WHERE THERE IS ONE TO ACT ON, and the note
                     belongs to BOTH branches (owner correction 2026-09-11).
                     The absence used to return early, so a row whose figure had
                     deliberately been withheld printed a bare `—` with nothing
                     saying why — which is the same silence the page spent this
                     whole card removing. */
                  return (
                    <span title={line.toBuyNoteWhy}>
                      {line.toBuy == null || line.toBuy <= 0 ? (
                        <Absence>—</Absence>
                      ) : (
                        <span className="tabular-nums font-medium">{line.toBuy}</span>
                      )}
                      {line.toBuyNote?.length ? (
                        <div className="mt-0.5">
                          {/* Written AT the width it is read at — a sentence
                              left to wrap under a one-digit figure is a
                              row-height defect in words. */}
                          {line.toBuyNote.map((l) => (
                            <div key={l}>
                              <Absence>{l}</Absence>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </span>
                  );
                case "orderedQty": {
                  /* A QUANTITY, AND A DOOR TO THE DOCUMENTS. The purchase
                     orders are named once, in the read-only details table
                     below; a collection of them never sets this row's height. */
                  const qty = line.orderedQty ?? 0;
                  if (qty <= 0) return <Absence>{line.orderedQtyAbsence ?? "—"}</Absence>;
                  return onOpenPoDetails ? (
                    <button
                      type="button"
                      className="tabular-nums text-kit-blue-11 underline-offset-2 hover:underline"
                      data-testid={`goods-ordered-qty-${line.key}`}
                      title={`${qty} ordered on purchase orders — show the details`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPoDetails();
                      }}
                    >
                      {qty}
                    </button>
                  ) : (
                    <span className="tabular-nums">{qty}</span>
                  );
                }
                case "deliverTo":
                  /* THE ONE ARRANGEMENT EDITOR, on the one row that can act. */
                  return line.deliverToNode != null ? (
                    line.deliverToNode
                  ) : line.deliverTo.length ? (
                    line.deliverTo.map((d) => <div key={d}>{d}</div>)
                  ) : (
                    <Absence>{line.deliverToAbsence}</Absence>
                  );
                case "unit":
                  return line.unitNode != null ? line.unitNode : line.unitIds.length ? (
                    line.unitIds.map((id) => <div key={id}>{id}</div>)
                  ) : (
                    <Absence>{line.unitAbsence}</Absence>
                  );
                case "supplier":
                  return line.supplier ? (
                    line.supplier
                  ) : (
                    <Absence>{line.supplierAbsence ?? "—"}</Absence>
                  );
                case "poNo":
                  return line.poNos?.length ? (
                    line.poNos.map((po) => <div key={po}>{poLink(po)}</div>)
                  ) : (
                    <Absence>{line.poNoAbsence ?? "—"}</Absence>
                  );
                case "poDeliveryDate":
                  return line.poDeliveryDate ? (
                    line.poDeliveryDate
                  ) : (
                    <Absence>{line.poDeliveryDateAbsence ?? "—"}</Absence>
                  );
                default:
                  return null;
              }
            };
            const detail = detailRow?.(line) ?? null;
            return (
              <Fragment key={line.key}>
              <tr
                data-testid={line.testId}
                data-row="demand"
                /* A ticked demand reads as selected, in the register's own
                   selected fill — the same answer the parent row gives, so one
                   page has one selected colour. */
                className={`divide-x divide-base-200 align-top${
                  selection?.selectedKeys.has(line.key) ? " bg-kit-blue-3" : ""
                }`}
              >
                {selection ? (
                  /* ⭐ THE TICK IS VERTICALLY CENTRED (§6.8). A two-line item
                     description made a top-aligned checkbox sit beside the
                     model name and above the configuration, so the control
                     looked like it belonged to the first line of the cell
                     rather than to the row. */
                  <td className={salesOrderLayout ? "py-1 px-2 align-middle leading-tight text-center" : soBatchGoodsLayout ? "px-2 py-2 align-middle text-center" : "px-2 py-2 text-center"}>
                    {line.selectable ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${line.item}`}
                        checked={selection.selectedKeys.has(line.key)}
                        onChange={() => selection.onToggle(line.key)}
                      />
                    ) : (
                      <Absence>—</Absence>
                    )}
                  </td>
                ) : null}
                {columns.map((c) => {
                  /**
                   * ⭐ THE CONNECTOR IS THE TABLE'S, NOT THE PAGE'S (§6.9).
                   *
                   * Only this box knows where the `Ready Stock` column is, so
                   * only this box can draw a line that leaves from beneath that
                   * column's own arrow. It is drawn INSIDE the cell, in normal
                   * flow, so horizontal scrolling and resizing move it with the
                   * arrow by construction — a line placed from a measured pixel
                   * offset is the floating elbow one resize later.
                   *
                   * ONE UNBROKEN LINE: it starts under the caret, crosses
                   * whatever height the item row happens to have, and reaches
                   * `-DETAIL_GAP` — past this cell's own bottom edge, through
                   * the gap below, onto the TOP BORDER of the picker's frame.
                   * It exists only while that picker is open, so it can never
                   * run on into the next item.
                   */
                  const connects = soBatchGoodsLayout && detail != null && c.key === "fromStock";
                  return (
                  <td
                    key={c.key}
                    style={connects ? { position: "relative" } : undefined}
                    className={
                      salesOrderLayout
                        ? `px-2 py-2 whitespace-normal break-words${c.key === "unit" || c.key === "qty" ? " tabular-nums" : ""}`
                        : soBatchGoodsLayout
                        ? /* One row geometry for every line: the values sit at
                             the top of their cell so two-line items line up,
                             and `Qty` is centred with its tick because a lone
                             digit beside a two-line description reads as
                             belonging to the first line otherwise. Long names
                             wrap; nothing is clipped behind a hover title. */
                          `px-2 py-2 whitespace-normal break-words${
                            c.key === "qty" ? " align-middle text-center tabular-nums" : " align-top"
                          }`
                        : c.key === "unit" || c.key === "orderedQty" || c.key === "poNo"
                        ? "px-2 py-2 tabular-nums"
                        : "px-2 py-2"
                    }
                  >
                    {connects ? (
                      <span
                        aria-hidden
                        data-testid={`goods-connector-${line.key}`}
                        className="absolute w-px bg-kit-slate-6"
                        style={{ right: CONNECTOR_INSET, top: CONNECTOR_TOP, bottom: CONNECTOR_BOTTOM }}
                      />
                    ) : null}
                    {cell(c.key)}
                  </td>
                  );
                })}
              </tr>
              {/* ⭐ THE PICKER OPENS INSIDE THE TABLE, under the item it is
                  about (owner ruling 2026-09-18). A sibling box outside the
                  table would scroll separately from the columns the connector
                  is aligned to, which is exactly the floating elbow §6.9
                  forbids. `data-row="detail"` so a test can tell the two row
                  kinds apart without reading their contents. */}
              {detail ? (
                <tr data-row="detail" data-testid={`goods-detail-${line.key}`}>
                  <td
                    colSpan={columns.length + (selection ? 1 : 0)}
                    className="p-0"
                  >
                    <div style={{ paddingTop: DETAIL_GAP }}>{detail}</div>
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function UnitEvidence({ ids, unverified, mismatch, singleLineCodes = false }: { ids: string[]; unverified: string[]; mismatch: boolean; singleLineCodes?: boolean }) {
  if (ids.length === 0 && unverified.length === 0 && mismatch) return <p className="text-meta text-kit-amber-11">Unit ID count exceeds order quantity</p>;
  if (ids.length === 0 && unverified.length === 0) return <span data-absence="true" className="text-kit-slate-11">Not allocated</span>;
  if (ids.length === 1 && unverified.length === 0 && !mismatch) return <span className={singleLineCodes ? "block max-w-full overflow-x-auto whitespace-nowrap" : undefined} tabIndex={singleLineCodes ? 0 : undefined} title={singleLineCodes ? ids[0] : undefined}>{ids[0]}</span>;
  return <div>
    <Popover label="Unit ID" trigger={<Button size="sm" variant="ghost">Unit ID ({ids.length + unverified.length})</Button>}>
      <div className="max-h-64 overflow-y-auto text-body">
        {ids.map((id) => <div className={singleLineCodes ? "whitespace-nowrap" : undefined} key={id}>{id}</div>)}
        {unverified.length > 0 && <><p className="text-kit-amber-11">Unit ID link not verified</p>{unverified.map((id) => <div className={singleLineCodes ? "whitespace-nowrap" : undefined} key={id}>{id}</div>)}</>}
      </div>
    </Popover>
    {mismatch && <p className="text-meta text-kit-amber-11">Unit ID count exceeds order quantity</p>}
    {unverified.length > 0 && <p className="text-meta text-kit-amber-11">Unit ID link not verified</p>}
  </div>;
}
