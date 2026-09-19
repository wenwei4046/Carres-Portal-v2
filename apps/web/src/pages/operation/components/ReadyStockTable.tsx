// design-standard: not-a-list-page — this is a SECTION inside an expanded
// register row, not a page. It has no route, no shell and no page header: the
// Register above already owns all three, and wrapping a nested disclosure in a
// second ListPageShell would draw a page inside a page — the
// windows-inside-windows AutoCount pattern the Constitution rejects (§2). Its
// table follows GoodsMiniTable's grammar, its sibling.
import type { ReactNode, Ref } from "react";
import {
  READY_STOCK_CONDITION_ABSENT,
  SO_BATCH_PURCHASE_WORDS as W,
  readyStockConditionWord,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import SecondLine from "./register-cell";

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
  /** The physical receipt DATE. The picker prints it; the inventory read does not. */
  dateIn?: string | null;
  /**
   * The document the goods came in on, read from the register and never
   * invented. `undefined` = the read did not carry it; `null` = it carries no
   * document. Both print `Not recorded`, which is the truth in either case.
   */
  poNo?: string | null;
}

export interface ReadyStockTableSelection {
  isChosen: (itemId: string) => boolean;
  onToggle: (itemId: string) => void;
  /**
   * Why this Unit cannot be chosen, or null when it can. A blocked row keeps
   * its place and loses its checkbox — the fact belongs beside the goods.
   */
  blockedWord: (row: ReadyStockTableRow) => string | null;
  /**
   * THE UNIT THE LAST ACT STOPPED ON (#1215). Amber, because it is an
   * exception to fix, not a failure of the goods. Only a page that can ACT
   * has one, which is why it rides with `selection`.
   */
  isRefused?: (itemId: string) => boolean;
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

/**
 * ⭐ THE SO BATCH STOCK PICKER — owner ruling 2026-09-18, Purchasing §9.1.
 *
 * `☐ · Goods Received Date · Stock Location · Supplier · PO No / Ref No ·
 * Condition`, in that exact order, and it is a DIFFERENT QUESTION from the
 * inventory read above — which is why it is a layout of this one box rather
 * than a second box. The picker opens directly beneath ONE item line, so:
 *
 *   · `Item` and `Qty` are gone. Every row is the goods that line ordered, one
 *     exact Unit at a time; a column that would print the same words on every
 *     row in the width of a real answer is a column of noise.
 *   · `Owner` is gone and `Supplier` takes its place — the operator needs the
 *     PROVENANCE, and consignment goods still say so, beside the name.
 *   · `PO No / Ref No` and `Unit ID` share ONE cell, the document on line one
 *     and the Unit under it: they are the two identifiers a person copies, and
 *     a reader who has to look across the table to pair them pairs them wrongly.
 *   · The date is the physical RECEIPT date and carries no time on this
 *     surface (§9.1). A stored timestamp is never rewritten to fit a column.
 *
 * Manual Purchase passes no layout at all and renders byte-identically.
 *
 * WIDTHS ARE CONTENT, and a field keeps ONE default across these tables: a
 * cross-year date is the register's own 120, `PO-20260930-4827` its own 144,
 * and `Supplier` the reviewed 136 — which is a SAMPLE measurement, not a clip:
 * a longer real name takes an inline second line rather than an ellipsis.
 */
const PICKER = [
  { key: "received", label: W.stockColReceived, width: 120 },
  { key: "location", label: W.stockColLocation, width: 136 },
  { key: "supplier", label: W.stockColSupplier, width: 136 },
  { key: "reference", label: W.stockColReference, width: 144 },
  { key: "condition", label: W.stockColCondition, width: 110 },
] as const;

export default function ReadyStockTable({
  label,
  rows,
  selection,
  extraColumn,
  layout = "inventory",
}: {
  /** The table's accessible name — `Ready Stock for SO-1303`. */
  label: string;
  rows: ReadyStockTableRow[];
  /** Present only on a page that can COMMIT a Unit. */
  selection?: ReadyStockTableSelection;
  /** Present only on a page with a trailing fact of its own. */
  extraColumn?: ReadyStockTableExtraColumn;
  /**
   * `inventory` (the default) is the shipped shape Manual Purchase and the
   * order-level section draw. `picker` is SO Batch's approved six columns under
   * ONE item line (§9.1). Opt-in, so every existing caller is byte-identical.
   */
  layout?: "inventory" | "picker";
}) {
  const picker = layout === "picker";
  const ruled = picker ? PICKER : RULED;
  const minWidth =
    ruled.reduce((n, c) => n + c.width, 0) +
    (picker ? 0 : ITEM_FLOOR) +
    (selection ? SELECT_WIDTH : 0) +
    (extraColumn && !picker ? extraColumn.width : 0);
  if (picker) {
    return (
      /* CONTENT DECIDES THE WIDTH (ui MASTER §6.8): the table takes exactly the
         sum of its measured columns and the frame scrolls sideways if the
         window is narrower. `w-full` would stretch six content columns across a
         1440px canvas to fill it, which is the one thing the ruling names. */
      <div className="overflow-x-auto">
        <table
          className="table-fixed text-left"
          style={{ width: minWidth }}
          aria-label={label}
        >
          <colgroup>
            {selection ? <col style={{ width: SELECT_WIDTH }} /> : null}
            {ruled.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          {/* The child header treatment, exactly as the goods table above it:
              slate-3 fill, slate-11 ink, 11px/600, NORMAL casing. A neutral
              child header under the pale-blue main one (§6.8). */}
          <thead className="border-b border-kit-slate-5 bg-kit-slate-3">
            <tr className="divide-x divide-base-200">
              {selection ? <th className="px-2 py-1.5" aria-label="Choose Unit" /> : null}
              {ruled.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  /* The same reserved two-line header height every table in
                     this expansion carries, so three stacked boxes read as one
                     listing rather than three near-misses. */
                  className="px-2 py-1.5 align-bottom text-label font-semibold text-kit-slate-11"
                  style={{ height: 40 }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-200 text-body">
            {rows.map((u) => {
              const blocked = selection?.blockedWord(u) ?? null;
              const chosen = selection?.isChosen(u.itemId) ?? false;
              const refused = selection?.isRefused?.(u.itemId) ?? false;
              return (
                <tr
                  key={u.itemId}
                  data-testid={`ready-stock-unit-${u.itemId}`}
                  className={
                    refused
                      ? "divide-x divide-base-200 bg-kit-amber-3"
                      : chosen
                        ? "divide-x divide-base-200 bg-kit-blue-3"
                        : "divide-x divide-base-200"
                  }
                >
                  {selection ? (
                    <td className="px-2 py-2 text-center align-middle">
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
                  {/* GOODS RECEIVED DATE — the physical receipt, DATE only on
                      this surface. A missing date says so; no time is invented
                      and no stored timestamp is rewritten. */}
                  <td className="px-2 py-2 align-top">
                    {u.dateIn ? (
                      fmtDate(u.dateIn)
                    ) : (
                      <Absence>{W.stockNotRecorded}</Absence>
                    )}
                  </td>
                  {/* STOCK LOCATION — where the Unit actually stands today,
                      never the destination a purchase order asks for. */}
                  <td className="px-2 py-2 align-top">
                    {u.siteName ?? <Absence>{W.stockNotRecorded}</Absence>}
                  </td>
                  {/* SUPPLIER — the recorded provenance. Consignment goods
                      belong to their supplier and the operator must see it
                      before committing them (§7.7). */}
                  <td className="px-2 py-2 align-top">
                    {u.supplier ?? <Absence>{W.stockNotRecorded}</Absence>}
                    {u.ownership === "supplier_consignment" ? (
                      <div className="text-meta text-kit-slate-11">Supplier owned</div>
                    ) : null}
                  </td>
                  {/* ONE CELL, TWO LINES: the document, then the Unit under it.
                      Both print in FULL and stay selectable — a shortened
                      number names a document that does not exist. */}
                  <td className="px-2 py-2 align-top">
                    <div className="break-words">
                      {u.poNo ?? <Absence>{W.stockNotRecorded}</Absence>}
                    </div>
                    <SecondLine>
                      {/* 0453: a counted row's key is not a Unit ID and never
                          prints as one — what the goods ARE takes its place. */}
                      {u.identityScope === "unit" && u.unitCode ? u.unitCode : (blocked ?? "—")}
                    </SecondLine>
                    {/* ⭐ AND A ROW THAT LOST ITS CHECKBOX SAYS WHY. The approved
                        six columns hold no `why` column, and a Unit that cannot
                        be chosen with nothing beside it reads as a broken
                        control rather than as a fact about the goods. The
                        reason goes UNDER the Unit ID, in the quiet voice — the
                        identity is still the fact a person copies. */}
                    {blocked && u.identityScope === "unit" && u.unitCode ? (
                      <div className="mt-0.5 break-words text-meta">
                        <Absence>{blocked}</Absence>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {u.condition ? (
                      readyStockConditionWord(u.condition)
                    ) : (
                      <Absence>{READY_STOCK_CONDITION_ABSENT}</Absence>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
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
            const refused = selection?.isRefused?.(u.itemId) ?? false;
            return (
              <tr
                key={u.itemId}
                data-testid={`ready-stock-unit-${u.itemId}`}
                /* SELECTED UNIT: light-blue row with a thin blue rule top and
                   bottom — distinct from the purchasing selection above, and
                   from keyboard focus, which the browser's own ring draws.
                   ⚠️ `var(--kit-blue-9)` shipped here on 2026-09-10 and drew
                   NOTHING: the kit palette is a Tailwind colour scale and no
                   stylesheet defines that custom property — an invalid
                   box-shadow is dropped whole, so the selected row had its
                   fill and no rule (found and fixed in #1215). The token is
                   read from the theme instead: same locked value, and it
                   actually resolves. Amber has only steps 3 and 11 by law, so
                   the refused row carries the fill alone rather than inventing
                   a step. */
                className={
                  refused
                    ? "divide-x divide-base-200 bg-kit-amber-3"
                    : chosen
                      ? "divide-x divide-base-200 bg-kit-blue-3 shadow-[inset_0_1px_theme(colors.kit.blue.9),inset_0_-1px_theme(colors.kit.blue.9)]"
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
 * The collapsible frame a section sits in, written once so the purchasing
 * pages cannot drift into three handles.
 *
 * `title` and `className` are both defaulted to what Ready Stock has always
 * rendered, so Manual Purchase and SO Batch's own Ready Stock section are
 * byte-identical. SO Batch's `Purchase order details` names itself, and hands
 * its own spacing to the connector stack that draws the line to it.
 */
export function ReadyStockDisclosure({
  testId,
  open,
  onToggle,
  title = "Ready Stock",
  className = "mt-2",
  headingRef,
  children,
}: {
  testId: string;
  open: boolean;
  onToggle: () => void;
  title?: string;
  className?: string;
  headingRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={headingRef}
      className={`${className} overflow-hidden rounded-control border border-base-200 bg-white`}
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
        <span>{title}</span>
      </button>
      {open ? children : null}
    </div>
  );
}
