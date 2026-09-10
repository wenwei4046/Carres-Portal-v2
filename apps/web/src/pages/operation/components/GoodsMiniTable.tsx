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
 * ⭐ `Covered by` — THE BUYING PAGE'S OWN COLUMN (Card 02 follow-up, 2026-08-24).
 *
 * Optional, exactly like `selection` and for the same reason (law ④): a page
 * that BUYS has to say what ALREADY covers a line, and a truth register does
 * not. Sales Orders and Delivery pass neither and render byte-identically to
 * what they rendered before.
 *
 * It sits beside `Unit ID` because the two answer one question — *what exists
 * for this line already* — an allocated Unit, or an open purchase order. It is
 * a fixed column and it is not last, because law ① keeps `Item` last.
 */
const COVERED_BY_COLUMN = { key: "coveredBy", label: "Covered by", width: 168 } as const;

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

/** ☑ is chrome, so it is narrow and it is not one of the six ruled columns. */
const SELECT_WIDTH = 36;

/**
 * The sum of the fixed columns plus a floor for `Item`. Below this the box
 * scrolls sideways rather than crushing a column — the portal's standing
 * answer everywhere else (Purchase Orders, To Order), never truncation.
 */
const FIXED_TOTAL = CHILD_COLUMNS.reduce((n, c) => n + (c.width ?? 0), 0);
const ITEM_FLOOR = 220;

/** One goods line, already resolved to strings by the page that owns the data. */
export interface GoodsMiniLine {
  /** Stable identity — the selection key, and React's key. */
  key: string;
  /** Already display-cased by `categoryWord`. */
  category: string;
  /** One printed line each; empty means the absence below is printed instead. */
  unitIds: string[];
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
  /** One printed line each. Read only when the table is asked for the column. */
  coveredBy?: string[];
  /** The governed word for a line nothing covers yet. */
  coveredByAbsence?: string;
  /** Card 02-B — read only when the table is asked for the column. */
  supplier?: string;
  supplierAbsence?: string;
  poDeliveryDate?: string;
  poDeliveryDateAbsence?: string;
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
  showCoveredBy = false,
  showSupplier = false,
  showPoDeliveryDate = false,
  onCoveredByClick,
  isCoveredByLinkable,
}: {
  /** The table's accessible name — `Goods on SO-1303`. */
  label: string;
  lines: GoodsMiniLine[];
  /** Present only on a page that buys from these lines. */
  selection?: GoodsMiniTableSelection;
  /** A page that BUYS asks for `Covered by`; a truth register does not. */
  showCoveredBy?: boolean;
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
}) {
  /* The six ruled columns, plus the buying page's own — `Covered by` after
     `Unit ID`, the mapping columns before `Item`, never after it (law ①). */
  type Column = { key: string; label: string; width: number | null };
  const columns: Column[] = showCoveredBy
    ? [CHILD_COLUMNS[0], CHILD_COLUMNS[1], COVERED_BY_COLUMN, ...CHILD_COLUMNS.slice(2)]
    : [...CHILD_COLUMNS];
  const itemAt = columns.length - 1;
  if (showPoDeliveryDate) columns.splice(itemAt, 0, PO_DATE_COLUMN);
  if (showSupplier) columns.splice(itemAt, 0, SUPPLIER_COLUMN);
  const minWidth =
    FIXED_TOTAL +
    ITEM_FLOOR +
    (selection ? SELECT_WIDTH : 0) +
    (showCoveredBy ? COVERED_BY_COLUMN.width : 0) +
    (showSupplier ? SUPPLIER_COLUMN.width : 0) +
    (showPoDeliveryDate ? PO_DATE_COLUMN.width : 0);
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
          {lines.map((line) => (
            <tr
              key={line.key}
              data-testid={line.testId}
              className="divide-x divide-base-200 align-top"
            >
              {selection ? (
                <td className="px-2 py-2 text-center">
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
              {/* ONE ink for every value — and ONE FACE (Jess, 2026-08-27:
                  "why all the font type different"). `font-mono` fell back to
                  the browser's monospace stack, so Unit ID, PO and SKU wore a
                  different typeface than the row they sit in. Carres has no
                  mono face — the register engine itself aliases --font-mono
                  to Inter — so an identifier is plain body text here too. */}
              <td className="px-2 py-2">{line.category}</td>
              <td className="px-2 py-2">
                {line.unitIds.length ? (
                  line.unitIds.map((id) => <div key={id}>{id}</div>)
                ) : (
                  <Absence>{line.unitAbsence}</Absence>
                )}
              </td>
              {showCoveredBy ? (
                <td className="px-2 py-2">
                  {line.coveredBy?.length ? (
                    line.coveredBy.map((po) =>
                      /* `Ready Stock` and anything else that is not a
                         document stays text — only a real PO number is a
                         door, and only the page knows which is which. */
                      onCoveredByClick && (isCoveredByLinkable?.(po) ?? false) ? (
                        <div key={po}>
                          <button
                            type="button"
                            className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
                            data-testid={`goods-covered-by-${po}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCoveredByClick(po);
                            }}
                          >
                            {po}
                          </button>
                        </div>
                      ) : (
                        <div key={po}>{po}</div>
                      ),
                    )
                  ) : (
                    <Absence>{line.coveredByAbsence ?? "—"}</Absence>
                  )}
                </td>
              ) : null}
              <td className="px-2 py-2">
                {line.deliverToNode != null ? (
                  line.deliverToNode
                ) : line.deliverTo.length ? (
                  line.deliverTo.map((d) => <div key={d}>{d}</div>)
                ) : (
                  <Absence>{line.deliverToAbsence}</Absence>
                )}
              </td>
              <td className="px-2 py-2">{line.sku}</td>
              <td className="px-2 py-2 tabular-nums">{line.qty}</td>
              {showSupplier ? (
                <td className="px-2 py-2">
                  {line.supplier ? (
                    line.supplier
                  ) : (
                    <Absence>{line.supplierAbsence ?? "—"}</Absence>
                  )}
                </td>
              ) : null}
              {showPoDeliveryDate ? (
                <td className="px-2 py-2">
                  {line.poDeliveryDate ? (
                    line.poDeliveryDate
                  ) : (
                    <Absence>{line.poDeliveryDateAbsence ?? "—"}</Absence>
                  )}
                </td>
              ) : null}
              <td className="px-2 py-2">
                <div className="font-medium text-base-900">{line.item}</div>
                {line.itemDetail ? (
                  <div className="mt-0.5 text-base-600">{line.itemDetail}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
