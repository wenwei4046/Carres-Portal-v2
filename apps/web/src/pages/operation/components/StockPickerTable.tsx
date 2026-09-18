// design-standard: not-a-list-page — this is a SECTION inside an expanded
// register row, not a page. It has no route, no shell and no page header: the
// Register above already owns all three, and wrapping a nested disclosure in a
// second ListPageShell would draw a page inside a page — the
// windows-inside-windows AutoCount pattern the Constitution rejects (§2).
import type { ReactNode, Ref } from "react";
import { READY_STOCK_CONDITION_ABSENT, readyStockConditionWord } from "@carres/shared";

/**
 * ⭐ THE STOCK PICKER — ONE TABLE, BOTH PURCHASING SURFACES
 * (owner rulings 2026-09-11 and 2026-09-18; UI MASTER §6.8, Purchasing §9.1).
 *
 * ── WHAT CHANGED ON 2026-09-18, AND WHY IT IS NOT A RESTYLE ─────────────────
 *
 * The retired table led with `Unit ID · Condition · Qty · Where · Owner`, and
 * the owner's review found the reading order wrong for the question the
 * operator is actually asking. Somebody choosing a sofa off the shelf asks, in
 * this order: *when did it land, where is it standing, who did it come from,
 * what document brought it, what grade is it?* The Unit ID is what they COPY
 * once they have chosen — it is identity, not a decision fact — so it rides on
 * line two of the document cell beside the reference it belongs with.
 *
 * ```
 * ☐ │ Goods Received Date │ Stock Location │ Supplier │ PO No / Ref No │ Condition
 *                                                       Unit ID
 * ```
 *
 * ── FOUR THINGS THIS TABLE REFUSES TO PRETEND ──────────────────────────────
 *
 *   · CONDITION IS NOT AVAILABILITY. Everything offered is already
 *     `available` (0371); the grade rides in its own column, from the ONE
 *     shared vocabulary (`readyStockConditionWord`, Law D). A `Display` Unit
 *     is fully available.
 *   · A COUNTED ROW IS NOT A UNIT (0453 · 0368). Bulk stock SHOWS — hiding
 *     893 pillows would make a full shelf read as an empty one — with its
 *     key, no Unit ID pretence, and no checkbox.
 *   · AN ABSENCE IS A FACT, NOT A BLANK — `docs/COPY-STANDARD.md`. Every one
 *     of the six columns can be missing, and each says so in its own words.
 *   · A DATE IS A DATE HERE. The receipt DAY is what a chooser needs; the
 *     stored timestamp is not discarded to produce it, and Receiving keeps
 *     printing the full `Goods Received Date` with its time.
 *
 * ── THE GEOMETRY IS THE APPROVED SO BATCH REFERENCE (UI MASTER §6.8) ───────
 *
 * 8px left/right cell padding, 1px dividers, a common two-line header height
 * at 11px/600 in normal casing, 13px values, 11px slate-11 on the second line,
 * one row height for every row in the table, and the checkbox vertically
 * centred against it. The widths are MEASURED CONTENT widths, not equal
 * shares: a column is as wide as the longest governed value it can hold.
 */

/** `Absence` is a FACT, not an apology — `docs/COPY-STANDARD.md`. */
function Absence({ children }: { children: ReactNode }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/** One offered row of stock — an exact Unit, or a counted key. */
export interface StockPickerRow {
  itemId: string;
  /** `U1-000-014`, a legacy `id-…` code, or a `QTY-…` key on a counted row. */
  unitCode: string | null;
  identityScope: "unit" | "quantity";
  sku: string;
  /** The physical receipt DATE, already `YYYY-MM-DD`. */
  goodsReceivedDate: string | null;
  /** Where the Unit is STANDING now — never the purchase's destination. */
  stockLocation: string | null;
  /** Who the goods came from, off the stock record. */
  supplier: string | null;
  /** The Unit's OWN source document or reference. */
  sourceRef: string | null;
  /** A GRADE, and not availability. */
  condition: string | null;
  ownership: "carres_owned" | "supplier_consignment";
  qty: number;
  /** Saved against the line this table is open under. */
  reservedForThisLine?: boolean;
}

export interface StockPickerSelection {
  isChosen: (itemId: string) => boolean;
  onToggle: (itemId: string) => void;
  /**
   * Why this Unit cannot be chosen, or null when it can. A blocked row keeps
   * its place and loses its checkbox — the fact belongs beside the goods.
   */
  blockedWord: (row: StockPickerRow) => string | null;
  /**
   * THE UNIT THE LAST ACT STOPPED ON (#1215). Amber, because it is an
   * exception to fix, not a failure of the goods. Only a page that can ACT
   * has one, which is why it rides with `selection`.
   */
  isRefused?: (itemId: string) => boolean;
  /** Disables every tick while a save is in flight, without hiding anything. */
  frozen?: boolean;
}

/** The page-specific trailing column, when the page has one. */
export interface StockPickerExtraColumn {
  header: string;
  headerLines?: readonly [string, string];
  width: number;
  cell: (row: StockPickerRow) => ReactNode;
}

/** ☑ is chrome, so it is narrow and not one of the ruled columns. */
const SELECT_WIDTH = 36;
/**
 * MEASURED CONTENT WIDTHS (rendered shell, Inter, 2026-09-18). A cross-year
 * date is 99px, so 120 holds it with the 16px of padding and the rule; the
 * longest live site name is `Carres Klang Warehouse`; the longest live
 * supplier is 17 characters, which is the 136px the reviewed sample used;
 * `PO-20260930-4827` is 127px and its Unit ID line is shorter; `Fair (used)`
 * is the longest governed grade. None of these is a hard limit — a longer
 * value takes the column's second line rather than an ellipsis.
 */
const RULED = [
  { key: "received", label: "Goods Received Date", lines: ["Goods Received", "Date"], width: 128 },
  { key: "where", label: "Stock Location", lines: ["Stock", "Location"], width: 152 },
  { key: "supplier", label: "Supplier", lines: ["Supplier", ""], width: 136 },
  { key: "ref", label: "PO No / Ref No", lines: ["PO No /", "Ref No"], width: 168 },
  /**
   * ⚠️ `Condition` IS LAST AND IT IS THE FLEXIBLE ONE, which is the fix for
   * the defect the review named: as a fixed 110px column at the end of a
   * scrolling table it was squeezed into two and three lines of a two-word
   * grade. It takes the remaining width and never wraps its own value.
   */
  { key: "condition", label: "Condition", lines: ["Condition", ""], width: null },
] as const;
const CONDITION_FLOOR = 132;

export default function StockPickerTable({
  label,
  rows,
  selection,
  extraColumn,
}: {
  /** The table's accessible name — `Ready Stock for MPR-20260918-4103`. */
  label: string;
  rows: StockPickerRow[];
  /** Present only on a page that can COMMIT a Unit. */
  selection?: StockPickerSelection;
  /** Present only on a page with a trailing fact of its own. */
  extraColumn?: StockPickerExtraColumn;
}) {
  const minWidth =
    RULED.reduce((n, c) => n + (c.width ?? CONDITION_FLOOR), 0) +
    (selection ? SELECT_WIDTH : 0) +
    (extraColumn ? extraColumn.width : 0);
  const headers: Array<{
    key: string;
    label: string;
    lines: readonly [string, string];
  }> = [
    ...RULED.map((c) => ({
      key: c.key,
      label: c.label,
      lines: [c.lines[0]!, c.lines[1]!] as const,
    })),
    ...(extraColumn
      ? [
          {
            key: "extra",
            label: extraColumn.header,
            lines: (extraColumn.headerLines ?? [extraColumn.header, ""]) as readonly [
              string,
              string,
            ],
          },
        ]
      : []),
  ];
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed text-left"
        style={{ minWidth }}
        aria-label={label}
        data-testid="stock-picker-table"
      >
        <colgroup>
          {selection ? <col style={{ width: SELECT_WIDTH }} /> : null}
          {RULED.filter((c) => c.key !== "condition").map((c) => (
            <col key={c.key} style={{ width: c.width ?? undefined }} />
          ))}
          {extraColumn ? <col style={{ width: extraColumn.width }} /> : null}
          {/* Condition is the one flexible track and it is ALWAYS LAST. */}
          <col style={{ minWidth: CONDITION_FLOOR }} />
        </colgroup>
        <thead className="border-y border-kit-slate-6 bg-kit-slate-2">
          <tr className="divide-x divide-kit-slate-6">
            {selection ? (
              <th className="px-2 py-1" aria-label="Choose Unit" scope="col" />
            ) : null}
            {/* Condition's header rides with the rest but its CELL is last, so
                the header list is reordered to match the colgroup exactly. */}
            {[
              ...headers.filter((h) => h.key !== "condition" && h.key !== "extra"),
              ...(extraColumn ? headers.filter((h) => h.key === "extra") : []),
              ...headers.filter((h) => h.key === "condition"),
            ].map((h) => (
              <th
                key={h.key}
                scope="col"
                /* ⭐ A COMMON TWO-LINE HEIGHT, RESERVED WHETHER OR NOT THE
                   HEADING USES IT (UI MASTER §6.8). A one-word heading beside
                   a two-word one used to sit at a different baseline and the
                   whole row read as two tables; the empty second line keeps
                   every header cell exactly as tall as its neighbours. */
                className="px-2 py-1 align-top text-label font-semibold text-kit-slate-11"
                /* ⭐ THE WHOLE HEADING IS ONE NAME, even when it is drawn on
                   two lines. Without this a screen reader — and any reader of
                   the DOM — gets `Goods ReceivedDate`, because two block spans
                   concatenate with no space between them. */
                title={h.label}
                aria-label={h.label}
              >
                <span className="block leading-[14px]">{h.lines[0]}</span>
                <span className="block leading-[14px]">{h.lines[1] || " "}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-kit-slate-6 text-body">
          {rows.map((u) => {
            const blocked = selection?.blockedWord(u) ?? null;
            const chosen = selection?.isChosen(u.itemId) ?? false;
            const refused = selection?.isRefused?.(u.itemId) ?? false;
            return (
              <tr
                key={u.itemId}
                data-testid={`stock-picker-unit-${u.itemId}`}
                data-chosen={chosen ? "true" : undefined}
                /* SELECTED UNIT: light-blue row with a thin blue rule top and
                   bottom — distinct from the purchasing selection above, and
                   from keyboard focus, which the browser's own ring draws.
                   The rule colour is read from the theme, not from a custom
                   property no stylesheet defines (the #1215 defect: an invalid
                   box-shadow is dropped whole, so the row had its fill and no
                   rule). Amber has only steps 3 and 11 by law, so the refused
                   row carries the fill alone rather than inventing a step. */
                className={
                  refused
                    ? "divide-x divide-kit-slate-6 bg-kit-amber-3"
                    : chosen
                      ? "divide-x divide-kit-slate-6 bg-kit-blue-3 shadow-[inset_0_1px_theme(colors.kit.blue.9),inset_0_-1px_theme(colors.kit.blue.9)]"
                      : "divide-x divide-kit-slate-6"
                }
                /* ONE ROW HEIGHT FOR EVERY ROW, tall enough for the document
                   cell's two lines so a Unit with no reference does not sit
                   shorter than its neighbour. */
                style={{ height: 42 }}
              >
                {selection ? (
                  <td className="px-2 text-center align-middle">
                    {blocked == null ? (
                      <input
                        type="checkbox"
                        className="align-middle"
                        aria-label={`Choose ${u.unitCode ?? "Unit"}`}
                        checked={chosen}
                        disabled={selection.frozen === true}
                        onChange={() => selection.onToggle(u.itemId)}
                      />
                    ) : (
                      <Absence>—</Absence>
                    )}
                  </td>
                ) : null}
                <td className="px-2 align-middle tabular-nums">
                  {u.goodsReceivedDate ?? <Absence>Not recorded</Absence>}
                </td>
                <td className="px-2 align-middle">
                  {u.stockLocation ?? <Absence>Not recorded</Absence>}
                </td>
                <td className="px-2 align-middle">
                  {u.supplier ? (
                    <span className="block truncate" title={u.supplier}>
                      {u.supplier}
                      {u.ownership === "supplier_consignment" ? (
                        /* WHOSE GOODS THESE ARE IS PRINTED. Consignment stock
                           is real stock and the operator must be able to see
                           they are committing a supplier's property. */
                        <span className="block text-label text-kit-slate-11">
                          Supplier-owned
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <Absence>Not recorded</Absence>
                  )}
                </td>
                <td className="px-2 align-middle">
                  {/* THE TWO IDENTIFIERS A PERSON COPIES, one above the other:
                      the document the goods arrived on, and the Unit itself.
                      Missing provenance is not a reason to invent a PO. */}
                  <span className="block font-mono">
                    {u.sourceRef ?? <Absence>Not recorded</Absence>}
                  </span>
                  <span className="block font-mono text-label text-kit-slate-11">
                    {/* A counted row's key is NOT a Unit ID and never prints
                        under this heading as if it were. The governed answer
                        for a quantity-scoped goods line is the absence dash —
                        `No Unit ID` would imply one is owed. */}
                    {u.identityScope === "unit" && u.unitCode ? (
                      u.unitCode
                    ) : (
                      <Absence>—</Absence>
                    )}
                  </span>
                </td>
                {extraColumn ? (
                  <td className="px-2 align-middle">
                    {blocked ? <Absence>{blocked}</Absence> : extraColumn.cell(u)}
                  </td>
                ) : null}
                <td className="px-2 align-middle">
                  {u.condition ? (
                    <span className="whitespace-nowrap">
                      {readyStockConditionWord(u.condition)}
                    </span>
                  ) : (
                    <Absence>{READY_STOCK_CONDITION_ABSENT}</Absence>
                  )}
                  {/* A counted row stands for several pieces; saying so here
                      keeps `Qty` off a table whose every other row is 1. */}
                  {u.identityScope !== "unit" ? (
                    <span className="block text-label text-kit-slate-11">
                      {`${u.qty} counted`}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The collapsible frame a stock section sits in, written once so the
 * purchasing pages cannot drift into three handles.
 *
 * `title` and `className` are defaulted to what Ready Stock has always
 * rendered, so Manual Purchase and SO Batch's own sections are byte-identical.
 * SO Batch's `Purchase order details` names itself, and hands its own spacing
 * to the connector stack that draws the line to it.
 */
export function StockDisclosure({
  testId,
  open,
  onToggle,
  title = "Ready Stock",
  className = "mt-2",
  headingRef,
  actions,
  children,
}: {
  testId: string;
  open: boolean;
  onToggle: () => void;
  title?: string;
  className?: string;
  headingRef?: Ref<HTMLDivElement>;
  /** The section's own controls, in its own header (UI MASTER §4.1). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      ref={headingRef}
      className={`${className} overflow-hidden rounded-control border border-kit-slate-6 bg-white`}
      data-testid={testId}
    >
      <div className="flex h-9 items-center gap-2 bg-kit-slate-2 pr-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          /* 36px, the section handle — the Unit rows below are the ruled 42px. */
          className="flex h-9 min-w-0 flex-1 items-center gap-2 px-3 text-left text-body font-semibold text-kit-slate-12 hover:bg-kit-slate-3"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open ? children : null}
    </div>
  );
}
