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
import type { ReactNode } from "react";
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
 * The facts did not go away; they went to explicit places. `On PO` names the
 * documents and the quantity each one carries, `To buy` states the remainder
 * this page can still act on, and `Qty` stays the customer's original order —
 * three numbers that add up in front of the operator instead of one word that
 * hid the arithmetic. Ready-Stock coverage is stated by the `Ready Stock`
 * section below, which owns that fact and can name the exact Units.
 */
const FROM_STOCK_COLUMN = { key: "fromStock", label: "Ready Stock", width: 96 } as const;
const ON_PO_COLUMN = { key: "onPo", label: "On PO", width: 176 } as const;
const TO_BUY_COLUMN = { key: "toBuy", label: "To buy", width: 74 } as const;

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
  /**
   * ⭐ THE EVIDENCE ROWS — read-only, and they are NOT demand (2026-09-11).
   *
   * Each exact Unit this line already has, with the purchase order it came in
   * on. They render as their own rows UNDER the demand row, carrying no
   * checkbox and no arrangement editor, because they are records of what has
   * already happened. The defect this replaces: the table expanded one line
   * into N Unit rows that each carried the SAME line key, selection state and
   * `deliverToNode`, so one ticked demand drew N ticked boxes and N copies of
   * the Deliver To / Split editor beside historical records — the toolbar said
   * `1 selected` while the screen showed four.
   */
  units?: Array<{
    unitId: string;
    /** The document this Unit came in on, when the read can evidence one. */
    poNo?: string | null;
    /** Where that document sent it. Never the plan for the remaining demand. */
    deliverTo?: string | null;
    supplier?: string | null;
    poDeliveryDate?: string | null;
  }>;
  /** Units of this line already answered off the shelf. Read with `showFromStock`. */
  fromStock?: number | null;
  /** The remainder this page can still buy on this line. Read with `showToBuy`. */
  toBuy?: number | null;
  /** The documents already carrying part of this line, and how much each holds. */
  poAllocations?: Array<{ poId: string; qty: number }>;
  /** The governed word for a line no document carries yet. */
  onPoAbsence?: string;
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
    <span className="font-sans text-kit-slate-9" data-absence="true">
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
  showFromStock = false,
  showOnPo = false,
  showToBuy = false,
  identityFirst = false,
  showSupplier = false,
  showPoDeliveryDate = false,
  showPoNo = false,
  showUnitId = true,
  onPoClick,
}: {
  /** The table's accessible name — `Goods on SO-1303`. */
  label: string;
  lines: GoodsMiniLine[];
  /** Present only on a page that buys from these lines. */
  selection?: GoodsMiniTableSelection;
  /**
   * A page that BUYS asks for `On PO` and `To buy`; a truth register does not.
   * Together they state the arithmetic `Covered by` used to hide: what the
   * customer ordered, what documents already carry, what is left.
   */
  showFromStock?: boolean;
  showOnPo?: boolean;
  showToBuy?: boolean;
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
  /** Present only on a page whose `PO No` cell should navigate. */
  onPoClick?: (poId: string) => void;
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
    item: { ...CHILD_COLUMNS[5] },
    supplier: { ...SUPPLIER_COLUMN },
    poNo: { ...PO_NO_COLUMN },
    poDeliveryDate: { ...PO_DATE_COLUMN },
    fromStock: { ...FROM_STOCK_COLUMN },
    onPo: { ...ON_PO_COLUMN },
    toBuy: { ...TO_BUY_COLUMN },
  };
  const order = identityFirst
    ? ["sku", "item", "qty", "fromStock", "onPo", "toBuy", "deliverTo", "unit", "supplier", "poNo", "poDeliveryDate", "category"]
    : ["category", "unit", "onPo", "deliverTo", "sku", "qty", "fromStock", "toBuy", "supplier", "poNo", "poDeliveryDate", "item"];
  const asked: Record<string, boolean> = {
    unit: showUnitId,
    supplier: showSupplier,
    poNo: showPoNo,
    poDeliveryDate: showPoDeliveryDate,
    fromStock: showFromStock,
    onPo: showOnPo,
    toBuy: showToBuy,
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
      className="overflow-x-auto rounded-control border border-base-200 bg-white"
      data-testid="goods-mini-table"
    >
      <table
        className="w-full table-fixed text-left"
        style={{ minWidth }}
        aria-label={label}
      >
        <colgroup>
          {selection ? <col style={{ width: SELECT_WIDTH }} /> : null}
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        {/* LEVEL ONE — the parent header's own treatment: 11px, grey, the
            button family's uppercase tracking. The eye should not have to
            learn a second header style eight pixels below the first. */}
        <thead className="border-b border-base-200 bg-base-50">
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
                className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        {/* LEVEL TWO — every value, 13px. */}
        <tbody className="divide-y divide-base-200 text-body">
          {lines.flatMap((line) => {
            /**
             * ⭐ ONE DEMAND ROW, THEN ITS EVIDENCE — the 2026-09-11 correction.
             *
             * The demand row carries the checkbox, the arrangement editor and
             * the customer's own quantity. Every row after it is a RECORD: one
             * exact Unit, the document it came in on, where that document sent
             * it. A record cannot be bought again, so it carries no control at
             * all — which is precisely what the previous version got wrong.
             */
            const cell = (
              key: string,
              unit: NonNullable<GoodsMiniLine["units"]>[number] | null,
            ) => {
              const evidence = unit != null;
              switch (key) {
                case "category":
                  return evidence ? null : line.category;
                case "sku":
                  return evidence ? (
                    /* The record belongs to the line above it and says so
                       without repeating its identity. */
                    <Absence>↳</Absence>
                  ) : (
                    <span className="font-medium">{line.sku}</span>
                  );
                case "item":
                  return evidence ? null : (
                    <>
                      <div className="font-medium text-base-900">{line.item}</div>
                      {line.itemDetail ? (
                        <div className="mt-0.5 text-base-600">{line.itemDetail}</div>
                      ) : null}
                    </>
                  );
                case "qty":
                  return <span className="tabular-nums">{evidence ? 1 : line.qty}</span>;
                case "fromStock":
                  /* The shelf answered part of this line — a fact of the LINE,
                     never of one Unit record under it. */
                  return evidence || !line.fromStock ? (
                    <Absence>—</Absence>
                  ) : (
                    <span className="tabular-nums">{line.fromStock}</span>
                  );
                case "toBuy":
                  /* The remainder is the DEMAND's, never a record's. */
                  return evidence || line.toBuy == null || line.toBuy <= 0 ? (
                    <Absence>—</Absence>
                  ) : (
                    <span className="tabular-nums font-medium">{line.toBuy}</span>
                  );
                case "onPo":
                  if (evidence) {
                    return unit.poNo ? (
                      poLink(unit.poNo)
                    ) : (
                      <Absence>Not recorded</Absence>
                    );
                  }
                  return line.poAllocations?.length ? (
                    line.poAllocations.map((a) => (
                      <div key={a.poId}>
                        {poLink(a.poId)}
                        <span className="tabular-nums text-base-600">{` ×${a.qty}`}</span>
                      </div>
                    ))
                  ) : (
                    <Absence>{line.onPoAbsence ?? "—"}</Absence>
                  );
                case "deliverTo":
                  if (evidence) {
                    return unit.deliverTo ? unit.deliverTo : <Absence>—</Absence>;
                  }
                  /* THE ONE ARRANGEMENT EDITOR, on the one row that can act. */
                  return line.deliverToNode != null ? (
                    line.deliverToNode
                  ) : line.deliverTo.length ? (
                    line.deliverTo.map((d) => <div key={d}>{d}</div>)
                  ) : (
                    <Absence>{line.deliverToAbsence}</Absence>
                  );
                case "unit":
                  if (evidence) return unit.unitId;
                  return line.unitNode != null ? line.unitNode : line.unitIds.length ? (
                    line.unitIds.map((id) => <div key={id}>{id}</div>)
                  ) : (
                    <Absence>{line.unitAbsence}</Absence>
                  );
                case "supplier": {
                  const value = evidence ? unit.supplier : line.supplier;
                  return value ? value : <Absence>{line.supplierAbsence ?? "—"}</Absence>;
                }
                case "poNo":
                  if (evidence) {
                    return unit.poNo ? poLink(unit.poNo) : <Absence>{line.poNoAbsence ?? "—"}</Absence>;
                  }
                  return line.poNos?.length ? (
                    line.poNos.map((po) => <div key={po}>{poLink(po)}</div>)
                  ) : (
                    <Absence>{line.poNoAbsence ?? "—"}</Absence>
                  );
                case "poDeliveryDate": {
                  const value = evidence ? unit.poDeliveryDate : line.poDeliveryDate;
                  return value ? value : <Absence>{line.poDeliveryDateAbsence ?? "—"}</Absence>;
                }
                default:
                  return null;
              }
            };
            const row = (
              unit: NonNullable<GoodsMiniLine["units"]>[number] | null,
            ) => (
              <tr
                key={unit == null ? line.key : `${line.key}::${unit.unitId}`}
                data-testid={
                  unit == null ? line.testId : `${line.testId ?? line.key}-unit-${unit.unitId}`
                }
                data-row={unit == null ? "demand" : "evidence"}
                /* ⭐ A RECORD READS QUIETER THAN THE DEMAND IT BELONGS TO.
                   The tint is the table header's own grey, so the eye groups
                   the records under the white row above them without a new
                   colour joining the page. Reviewed on the rendered preview,
                   2026-09-11: at `base-50/60` the two row kinds were almost
                   the same weight and the group read as four sibling lines. */
                className={`divide-x divide-base-200 align-top${
                  unit != null
                    ? " bg-kit-slate-3"
                    : /* A ticked demand reads as selected, in the register's
                         own selected fill — the same answer the parent row
                         gives, so one page has one selected colour. */
                      selection?.selectedKeys.has(line.key)
                      ? " bg-kit-blue-3"
                      : ""
                }`}
              >
                {selection ? (
                  <td className="px-2 py-2 text-center">
                    {unit == null && line.selectable ? (
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
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={
                      c.key === "unit" || c.key === "onPo" || c.key === "poNo"
                        ? "px-2 py-2 tabular-nums"
                        : "px-2 py-2"
                    }
                  >
                    {cell(c.key, unit)}
                  </td>
                ))}
              </tr>
            );
            return [row(null), ...(line.units ?? []).map((u) => row(u))];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function UnitEvidence({ ids, unverified, mismatch }: { ids: string[]; unverified: string[]; mismatch: boolean }) {
  if (ids.length === 0 && unverified.length === 0 && mismatch) return <p className="text-meta text-kit-amber-11">Unit ID count exceeds order quantity</p>;
  if (ids.length === 0 && unverified.length === 0) return <span data-absence="true" className="text-kit-slate-9">Not allocated</span>;
  if (ids.length === 1 && unverified.length === 0 && !mismatch) return <span>{ids[0]}</span>;
  return <div>
    <Popover label="Unit ID" trigger={<Button size="sm" variant="ghost">Unit ID ({ids.length + unverified.length})</Button>}>
      <div className="max-h-64 overflow-y-auto text-body">
        {ids.map((id) => <div key={id}>{id}</div>)}
        {unverified.length > 0 && <><p className="text-kit-amber-11">Unit ID link not verified</p>{unverified.map((id) => <div key={id}>{id}</div>)}</>}
      </div>
    </Popover>
    {mismatch && <p className="text-meta text-kit-amber-11">Unit ID count exceeds order quantity</p>}
    {unverified.length > 0 && <p className="text-meta text-kit-amber-11">Unit ID link not verified</p>}
  </div>;
}
