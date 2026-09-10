// design-standard: not-a-list-page — this is a SECTION inside an expanded
// register row, not a page. It has no route, no shell and no page header: the
// Register above already owns all three, and wrapping a nested disclosure in a
// second ListPageShell would draw a page inside a page — the
// windows-inside-windows AutoCount pattern the Constitution rejects (§2). Its
// table follows GoodsMiniTable's grammar, its sibling.
import type { ReactNode } from "react";
import { READY_STOCK_CONDITION_ABSENT, readyStockConditionWord } from "@carres/shared";

/**
 * ⭐ READY STOCK — ONE TABLE, BOTH PURCHASING SURFACES (owner ruling
 * 2026-09-11: "Manual Purchase and SO Batch share the Register and
 * goods-table implementation and visual grammar. Preserve necessary business
 * differences.").
 *
 * SO Batch Purchase drew this box first (2026-09-10). The settled Manual
 * Purchase design needs the same box under its own goods, and a second
 * hand-rolled copy is exactly how `Display` becomes `Exhibition` on one page
 * and how one table grows a column the other never gets. So the box is
 * written ONCE and the two pages differ only where the BUSINESS differs.
 *
 * ── THE ONE BUSINESS DIFFERENCE, AND IT IS A CAPABILITY, NOT A COPY ─────────
 *
 *   SO BATCH   a customer item line is OWED goods, so a Unit can be committed
 *              to it. It passes `selection` and `lineColumn` and gets the
 *              leading ☑ and the `For item line` cell.
 *   MANUAL     an internal replenishment is owed by no Unit on the shelf. It
 *              passes NEITHER, and there is nothing here for it to press:
 *              viewing inventory is not purchasing selection and is not
 *              reservation. The same law `GoodsMiniTable` already states —
 *              selection is a capability a page ASKS for, never something the
 *              box assumes.
 *
 * ── FOUR THINGS THIS TABLE REFUSES TO PRETEND ──────────────────────────────
 *
 *   · CONDITION IS NOT AVAILABILITY. Everything offered is already
 *     `available` (0371); the grade rides beside it in its own column, from
 *     the ONE shared vocabulary (`readyStockConditionWord`, Law D). A
 *     `Display` Unit is fully available.
 *   · A COUNTED ROW IS NOT A UNIT (0453 · 0368). Bulk stock SHOWS — hiding
 *     893 pillows would make a full shelf read as an empty one — with its
 *     key, no Unit ID pretence, and no checkbox.
 *   · AN ABSENCE IS A FACT, NOT A BLANK — `docs/COPY-STANDARD.md`.
 *   · WHOSE GOODS THESE ARE IS PRINTED. Consignment stock is real stock and
 *     the operator must be able to see it belongs to a supplier.
 */

/** `Absence` is a FACT, not an apology — `docs/COPY-STANDARD.md`. */
function Absence({ children }: { children: ReactNode }) {
  return <span className="text-base-400">{children}</span>;
}

/** One offered row of free stock — an exact Unit, or a counted key. */
export interface ReadyStockTableRow {
  itemId: string;
  /** `U1-000-014`, a legacy `id-…` code, or a `QTY-…` key on a counted row. */
  unitCode: string | null;
  identityScope: "unit" | "quantity";
  sku: string;
  /** A GRADE, and not availability. */
  condition: string | null;
  siteName: string | null;
  ownership: "carres_owned" | "supplier_consignment";
  supplier: string | null;
  qty: number;
}

export interface ReadyStockTableSelection {
  isChosen: (itemId: string) => boolean;
  onToggle: (itemId: string) => void;
  /**
   * Why this Unit cannot be chosen, or null when it can. A blocked row keeps
   * its place and loses its checkbox — the fact belongs beside the goods.
   */
  blockedWord: (row: ReadyStockTableRow) => string | null;
}

/** The page-specific trailing column, when the page has one. */
export interface ReadyStockTableExtraColumn {
  header: string;
  width: number;
  cell: (row: ReadyStockTableRow) => ReactNode;
}

/** ☑ is chrome, so it is narrow and not one of the ruled columns. */
const SELECT_WIDTH = 36;
const RULED = [
  { key: "unit", label: "Unit ID", width: 140 },
  { key: "condition", label: "Condition", width: 110 },
  { key: "qty", label: "Qty", width: 110 },
  { key: "where", label: "Where", width: 150 },
  { key: "owner", label: "Owner", width: 120 },
] as const;
/** `Item` is the only flexible column and it is ALWAYS LAST (law ①). */
const ITEM_FLOOR = 200;

export default function ReadyStockTable({
  label,
  rows,
  selection,
  extraColumn,
}: {
  /** The table's accessible name — `Ready Stock for SO-1303`. */
  label: string;
  rows: ReadyStockTableRow[];
  /** Present only on a page that can COMMIT a Unit. */
  selection?: ReadyStockTableSelection;
  /** Present only on a page with a trailing fact of its own. */
  extraColumn?: ReadyStockTableExtraColumn;
}) {
  const minWidth =
    RULED.reduce((n, c) => n + c.width, 0) +
    ITEM_FLOOR +
    (selection ? SELECT_WIDTH : 0) +
    (extraColumn ? extraColumn.width : 0);
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed text-left"
        style={{ minWidth }}
        aria-label={label}
      >
        <colgroup>
          {selection ? <col style={{ width: SELECT_WIDTH }} /> : null}
          {RULED.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
          {extraColumn ? <col style={{ width: extraColumn.width }} /> : null}
          <col />
        </colgroup>
        <thead className="border-y border-base-200 bg-base-50">
          <tr className="divide-x divide-base-200">
            {selection ? <th className="px-2 py-1.5" aria-label="Choose Unit" /> : null}
            {[
              ...RULED.map((c) => c.label),
              ...(extraColumn ? [extraColumn.header] : []),
              "Item",
            ].map((h) => (
              <th
                key={h}
                scope="col"
                /* Long headings may wrap to two lines; the ruled row height
                   below is unaffected. */
                className="px-2 py-1.5 text-label font-semibold uppercase text-base-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-200 text-body">
          {rows.map((u) => {
            const blocked = selection?.blockedWord(u) ?? null;
            const chosen = selection?.isChosen(u.itemId) ?? false;
            return (
              <tr
                key={u.itemId}
                data-testid={`ready-stock-unit-${u.itemId}`}
                /* SELECTED UNIT: light-blue row with a thin blue rule top and
                   bottom — distinct from the purchasing selection above, and
                   from keyboard focus, which the browser's own ring draws. */
                className={
                  chosen
                    ? "divide-x divide-base-200 bg-kit-blue-3 shadow-[inset_0_1px_var(--kit-blue-9),inset_0_-1px_var(--kit-blue-9)]"
                    : "divide-x divide-base-200"
                }
                style={{ height: 38 }}
              >
                {selection ? (
                  <td className="px-2 text-center">
                    {blocked == null ? (
                      <input
                        type="checkbox"
                        aria-label={`Choose ${u.unitCode ?? "Unit"}`}
                        checked={chosen}
                        onChange={() => selection.onToggle(u.itemId)}
                      />
                    ) : (
                      <Absence>—</Absence>
                    )}
                  </td>
                ) : null}
                <td className="px-2">
                  {/* A counted row's key is NOT a Unit ID and never prints
                      under this heading as if it were. The governed answer for
                      a quantity-scoped goods line is the absence dash —
                      `No Unit ID` would imply one is owed. */}
                  {u.identityScope === "unit" && u.unitCode ? (
                    u.unitCode
                  ) : (
                    <Absence>—</Absence>
                  )}
                </td>
                <td className="px-2">
                  {u.condition ? (
                    readyStockConditionWord(u.condition)
                  ) : (
                    <Absence>{READY_STOCK_CONDITION_ABSENT}</Absence>
                  )}
                </td>
                <td className="px-2 tabular-nums">{u.qty}</td>
                <td className="px-2">
                  {u.siteName ?? <Absence>Not recorded</Absence>}
                </td>
                <td className="px-2">
                  {u.ownership === "supplier_consignment" ? (
                    <span title={u.supplier ?? undefined}>Supplier</span>
                  ) : (
                    "Carres"
                  )}
                </td>
                {extraColumn ? (
                  <td className="px-2">
                    {blocked ? <Absence>{blocked}</Absence> : extraColumn.cell(u)}
                  </td>
                ) : null}
                <td className="px-2">{u.sku}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The collapsible frame the section sits in — the Carres section connector
 * the expansion already uses between its sections, written once so the two
 * purchasing pages cannot drift into two handles.
 */
export function ReadyStockDisclosure({
  testId,
  open,
  onToggle,
  children,
}: {
  testId: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="mt-2 overflow-hidden rounded-control border border-base-200 bg-white"
      data-testid={testId}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        /* 36px, the section handle — the item rows below are the ruled 38px. */
        className="flex h-9 w-full items-center gap-2 bg-base-50 px-3 text-left text-body font-semibold text-base-900 hover:bg-base-100"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>Ready Stock</span>
      </button>
      {open ? children : null}
    </div>
  );
}
