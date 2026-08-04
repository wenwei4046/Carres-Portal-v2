/**
 * DataTable — the ONE list table (UI-KIT §7, card D0.5c).
 *
 * **Extracted from the Orders table, not designed fresh** — §7 says so by name,
 * because a `DataTable` designed in the abstract will not fit the one table the
 * portal actually depends on, and D6 would rebuild it. Everything below is a
 * property `OperationOrdersControl` already has, moved into a component:
 *
 *   · `table-fixed` + a PERCENTAGE colgroup, so the table is always exactly the
 *     container width and NEVER scrolls horizontally on any screen — long
 *     content ellipsis-truncates instead (Loo, 2026-07-09);
 *   · rows 40px FIXED, `whitespace-nowrap`, each cell clipping its own overflow
 *     — content adapts to the row, never the reverse (SIZING LAW §3);
 *   · a sticky head at §4.4's layer 1, taken from `overlay-layer.ts` rather than
 *     typed as a number;
 *   · whole-row selection with a select-all that shows the indeterminate DASH on
 *     a partial tick;
 *   · §3.5's washes — one faint blue tint on hover, the stronger `blue-3` on the
 *     selected row, never grey.
 *
 * **Columns are DATA, and the header word comes from the column def.** That is
 * not tidiness: C1 found `Manage` surviving in a hand-written `<th>` while the
 * Columns popover already read the def — one column, two words, because the
 * header was typed twice. Here there is only one place it can be typed.
 *
 * **This file spells no word.** Every label is the caller's, from
 * COPY-STANDARD.
 *
 * **What it deliberately does NOT do.** It does not format a value: money is
 * `Money`/`.t-num` and a date is `fmtDate()` (§2.3 · §2.4), and a table that
 * formatted them would be a second date spelling. It offers `align` and
 * `numeric` — where the value sits and whether its figures line up — and stops.
 *
 * **Nothing is migrated onto this in D0.5c.** The Orders table keeps its own
 * markup until **D6**, which is the card that re-lays that page out.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **D0.5d — the grid powers AutoCount has** (Loo, 2026-08-04): row expand ·
 * column resize · column reorder · footer totals. Two of the card's five are
 * not props here, and both are said out loud rather than quietly dropped —
 * layout MEMORY is refused by §0.4 (below), and the RECORD BAR was measured to
 * exist already in `PageShell.footer` + `PageShell.chips` (see `records`).
 *
 * **Every one of them is an OPTIONAL prop and no existing signature moved**,
 * which is not tidiness — it is the only reason a kit card could run at all.
 * Three live pages render through this file today and two of them are FROZEN
 * (To Order, Jess 2026-08-01; Purchase Orders, Phase 2, 2026-08-03). A changed
 * signature reaches a frozen page; a new optional prop cannot. Pass none of
 * them and this component emits byte-identical markup to D0.5c's.
 *
 * **Layout MEMORY is deliberately absent, and it is the finding this card
 * carries.** §0.4 rules that *"the UI, the workflow and the
 * navigation … no per-user store of UI shape"*, and guard rule L enforces it.
 * Remembering a per-operator column order in `localStorage` is that store, and
 * moving it from `pages/**` into the kit would satisfy the guard while breaking
 * the law the guard exists to serve. So the drag is a WITHIN-SESSION affordance:
 * a reload restores the company's shape, and two operators still see one tool.
 * Whether §0.4 bends for a grid is Loo's, not a build card's.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Button from "./Button";
import Checkbox from "./Checkbox";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import Loading from "./Loading";
import Popover from "./Popover";
import SearchInput from "./SearchInput";
import { applyColumnOrder, moveColumnOrder, resizeColumnPair } from "./grid-layout";
import { Z_TABLE_FOOTER, Z_TABLE_HEADER } from "./overlay-layer";

/** A column may not be dragged under this, as a percentage of the table. */
const MIN_COLUMN_PCT = 4;

/**
 * A column's Excel filter (Jess, 2026-08-01 — the AutoCount workspace: every
 * column sorts by header click and filters by its ▼). The kit renders the
 * popover — a value checklist with an optional search — and NOTHING more: the
 * page owns which rows survive, exactly as it owns formatting. Option LABELS
 * are the caller's (COPY-STANDARD speaks business — `Yet to Order`, never
 * `(Blanks)`).
 */
export interface ColumnFilter {
  options: readonly { value: string; label: string }[];
  /** Empty set = no filter — every row passes. */
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  /** What the popover is, for a screen reader — e.g. `Filter Model`. */
  label: string;
  /** The clear action's word — the CALLER's, this file spells nothing. */
  clearLabel: string;
  /** Present = a search box above the checklist. The placeholder is the word. */
  searchPlaceholder?: string;
  /**
   * Excel's `Custom Date Range…` (Jess, 2026-08-02 — the PO Issued ▼). The kit
   * renders two date fields + an apply button under the checklist and reports
   * the pair; the PAGE owns what the pair means (it stores the range as one of
   * its own filter values, so chips and Clear keep working unchanged).
   */
  range?: {
    /** The section's word — the caller's (e.g. `Custom Date Range…`). */
    label: string;
    from: string | null;
    to: string | null;
    onApply: (from: string, to: string) => void;
    /** The apply action's word — the caller's. */
    applyLabel: string;
  };
}

export interface Column<Row> {
  key: string;
  /** The header word — typed ONCE, here. COPY-STANDARD owns it. */
  label: string;
  /**
   * A number = percentage of the table width. A string = raw CSS width —
   * fixed `"150px"` interior columns + one `"auto"` tail is the
   * international recipe: content columns hug their content on ANY screen
   * and the LAST column absorbs the slack (Jess, 2026-08-01 — percentage
   * columns inflate on wide monitors and open holes between neighbours).
   */
  width: number | string;
  align?: "left" | "right";
  /** Tabular figures, so a column of numbers lines up (§2.3). */
  numeric?: boolean;
  /** A tooltip on the header only — never the only copy of a rule. */
  headerTitle?: string;
  /** Header click sorts (asc ⇄ desc). Needs the table's `sort`/`onSortChange`. */
  sortable?: boolean;
  filter?: ColumnFilter;
  cell: (row: Row) => ReactNode;
}

export interface TableSort {
  key: string;
  dir: "asc" | "desc";
}

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  /** Stable identity — selection and React keys both read it. */
  rowId: (row: Row) => string;
  /** §8.2: clicking a row opens its record on the FIRST tab. */
  onRowOpen?: (row: Row) => void;
  /** Present = the table is selectable. Absent = no checkbox column at all. */
  selection?: {
    selected: ReadonlySet<string>;
    onToggleRow: (id: string) => void;
    onToggleAll: () => void;
    /** What the select-all box is called for a screen reader. */
    label: string;
    /**
     * Rows that can be picked at all. A row failing this renders an EMPTY
     * cell (not a disabled box) and leaves the select-all arithmetic — a
     * done row is not "unselected", it is out of the question.
     */
    selectable?: (row: Row) => boolean;
  };
  /** Shown INSTEAD of rows. §9: an empty state is an answer, not an apology. */
  empty: ReactNode;
  loading?: boolean;
  /** What the table is, for a screen reader. */
  label: string;
  /** The active sort. The PAGE sorts the rows; the kit only shows the arrow.
   *  A third click on the same header CLEARS it (`null`) — back to the
   *  page's own default order. */
  sort?: TableSort | null;
  onSortChange?: (next: TableSort | null) => void;
  /**
   * A 2px bar down the left edge of a row: THIS ROW IS LATE.
   *
   * It exists because a page can know a row is late for a reason that never
   * reaches a cell. To Order is the case that asked for it (Loo, 2026-08-03):
   * its rail lights `Overdue` in red while every visible date on the row is
   * still comfortably in the future — because "overdue" means the ORDER-BY
   * date has passed, and the order-by date deliberately never renders. The
   * row therefore stated its urgency nowhere.
   *
   * ONE tone on purpose. Red already has exactly one job in this portal
   * (late · act now); a second tone here would turn the accent into
   * decoration, which `01-design-tokens.md` §2.2 bans.
   *
   * Rows without it get a TRANSPARENT bar of the same width, so nothing on
   * the table shifts when one row is late and its neighbour is not.
   */
  rowLate?: (row: Row) => boolean;
  /**
   * A row that is over — cancelled, dead — renders washed out (2990s' own
   * recipe: the row stays on the register, greyed, so it reads as history
   * without a word). The PAGE owns which rows qualify.
   *
   * `rowLate` and `rowMuted` arrived on the same day from two different pages
   * and are deliberately BOTH kept: one says *act now*, the other says *this
   * is history*. They are opposite ends of the same axis and no row can
   * honestly be both, but the kit does not police that — the page knows.
   */
  rowMuted?: (row: Row) => boolean;
  /**
   * Rows that belong together get ONE header line above them, and the facts
   * that would otherwise repeat down the sheet move onto it.
   *
   * AutoCount's own shape (Loo, 2026-08-03, from its `SO Batch Posting`
   * screen): its row IS the customer order and the items open underneath, so
   * the customer's name, the order number and the date are stated once. Our
   * grid was one row per ITEM, so a customer with three pieces printed their
   * name three times and there was nowhere to say "this order is already
   * partly ordered" — that fact belongs to the order, not to any one piece.
   *
   * `keyOf` decides where a group ends: the header is emitted whenever the key
   * changes from the previous row, so the PAGE's own sort decides grouping and
   * the kit never re-orders anything.
   */
  group?: {
    keyOf: (row: Row) => string;
    /** Rendered inside one full-width cell. The caller owns every word. */
    header: (row: Row) => ReactNode;
  };
  /**
   * **D0.5d power 3 — a row opens.** AutoCount's `SO Batch Posting` ⊞: the row
   * is the record and its detail unfolds underneath, in place, without leaving
   * the list. This is the power **P10 is waiting on**, which is why it is the
   * first of the five and why its content is not negotiable: the kit renders
   * the control, the caller renders EVERYTHING inside.
   *
   * Controlled, like `selection`, and for the same reason — the page already
   * knows which record it is working on, and a component holding a second copy
   * of that is a second source of truth. Absent = no control column at all,
   * which is what keeps the three live pages untouched.
   *
   * The expanded cell is the ONE cell in this table that may be taller than
   * 40px and may wrap: it is not a row of the list, it is the record. The
   * 40px law binds the rows you scan, or nothing could ever open.
   */
  expansion?: {
    /** Which rows are open. */
    expanded: ReadonlySet<string>;
    onToggle: (id: string) => void;
    /** The whole contents. The kit renders no part of it and no word of it. */
    render: (row: Row) => ReactNode;
    /** What the control does, for a screen reader — the CALLER's word. */
    label: (row: Row) => string;
    /** A row with nothing to open gets no control, not a dead one. */
    expandable?: (row: Row) => boolean;
  };
  /**
   * **D0.5d power 1 — the operator drags the grid.** Drag a header's right
   * edge to resize; drag the header itself to reorder. Absent = the columns
   * render exactly as the caller declared them and nothing is draggable.
   *
   * **A resize takes width from the RIGHT NEIGHBOUR and never from the table.**
   * §7's first rule is that a list table never scrolls sideways, and a column
   * that simply grew would break it on the first drag. See `resizeColumnPair`.
   *
   * **It is NOT remembered between sessions, and that is why it needs no reset
   * control.** §0.4 rules out a per-user store of UI shape, so a reload puts
   * the company's grid back — the reset already exists and costs no pixels, no
   * word and no new affordance. There is no `storageKey` here and there is
   * deliberately nowhere to put one.
   */
  layout?: {
    /** What a resize handle is, for a screen reader — the caller's word. */
    resizeLabel: string;
    /** What a draggable header is, for a screen reader — the caller's word. */
    reorderLabel: string;
  };
  /**
   * **D0.5d power 4 — the totals strip inside the grid**, pinned under the last
   * row the way the head is pinned over the first.
   *
   * **Which columns aggregate, and what an aggregate MEANS, is entirely the
   * caller's** — the kit does not sum, does not count and does not format
   * (§7: money is `Money` and a date is `fmtDate()`). A column the caller
   * returns nothing for renders an empty cell, so the strip lines up with the
   * numbers above it whether or not every column has one.
   */
  totals?: {
    /** What the strip is, for a screen reader — the caller's word. */
    label: string;
    cell: (column: Column<Row>, rows: readonly Row[]) => ReactNode;
  };
  /*
   * **D0.5d power 5 — the record bar — is NOT here, because it already
   * exists.** Measured 2026-08-04 before a line was written: `PageShell` ships
   * `footer`, a 36px band whose own doc comment reads *"Count + pagination"*,
   * already inside §1.3's height budget — and `OperationToOrder` already
   * renders it. Its sibling `chips` is the clearable filter statement, live on
   * three pages. A `records` prop here would have put a second 36px bar under
   * the first, spelling one thing twice in two components, which is the §6.6
   * failure this whole line was opened to stop. The card's own rule applies to
   * the card: never rebuild anything a doc marks ALREADY EXISTS.
   */
  /**
   * **How the table spends the width it is given** (card P16, Loo's ruling
   * 2026-08-04: *"A table's WIDTH does not decide a COLUMN's width. Content
   * does."*).
   *
   *   · `"fill"` (DEFAULT, and the only behaviour before P16) — the widths in
   *     `Column.width` are shares of the container, and any width the columns
   *     do not claim is handed back out among them. Percentages, and pixels
   *     above their `min-w`, both grow. Purchase Orders and Receiving are on
   *     this and are untouched.
   *
   *   · `"content"` — every column gets exactly the width its def asks for and
   *     NOTHING MORE, and the leftover goes to a trailing FILLER that carries
   *     no word, no data, no sort and no filter. Trailing whitespace is the
   *     point, not a defect: it says the page holds these business facts and
   *     no more.
   *
   * **The filler is what makes the rule enforceable rather than a hope.** In
   * `table-fixed`, spare width is shared out over the columns unless something
   * `auto` is there to take it — so without a filler, "size a column to its
   * content" is a number the browser immediately overrides. It is deliberately
   * NOT a column: it never enters `columns`, so it cannot be sorted, filtered,
   * hidden or reordered, and a page cannot accidentally put a fact in it.
   *
   * It also fixes the kit's own two columns at pixels, because a 3%/4% share
   * of a table that no longer stretches is a disclosure control in 20px.
   */
  sizing?: "fill" | "content";
}

/**
 * One column's ▼ — an Excel AutoFilter as a checkbox popover. Lit blue while
 * it is narrowing, because a filter you cannot see is a lie the table tells.
 */
function HeaderFilter({ colKey, filter }: { colKey: string; filter: ColumnFilter }) {
  const [needle, setNeedle] = useState("");
  const [rangeFrom, setRangeFrom] = useState(filter.range?.from ?? "");
  const [rangeTo, setRangeTo] = useState(filter.range?.to ?? "");
  const shown = needle.trim()
    ? filter.options.filter((o) => o.label.toLowerCase().includes(needle.trim().toLowerCase()))
    : filter.options;
  const active = filter.selected.size > 0;
  return (
    <Popover
      label={filter.label}
      trigger={
        /* A COMPACT 24px trigger, not a padded Button — on a narrow column
         * the button's own padding is what pushed the header word off the
         * numbers' edge (Jess, 2026-08-01). Excel's vocabulary stands: a
         * quiet ▼ on the column, the funnel only while it is narrowing. */
        <button
          type="button"
          aria-label={filter.label}
          data-testid={`table-filter-${colKey}`}
          data-active={active || undefined}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        >
          <Icon name={active ? "filter" : "columnFilter"} size={14} />
        </button>
      }
    >
      <div className="flex w-56 flex-col gap-2" data-kit="table-filter">
        {filter.searchPlaceholder != null ? (
          <SearchInput
            id={`table-filter-search-${colKey}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder={filter.searchPlaceholder}
            aria-label={filter.label}
          />
        ) : null}
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
          {shown.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-body text-kit-slate-12">
              <Checkbox
                id={`table-filter-${colKey}-${o.value.replace(/[^\w-]/g, "_")}`}
                ariaLabel={o.label}
                checked={filter.selected.has(o.value)}
                onCheckedChange={() => {
                  const next = new Set(filter.selected);
                  if (next.has(o.value)) next.delete(o.value);
                  else next.add(o.value);
                  filter.onChange(next);
                }}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {filter.range ? (
          /* Excel's own tail item: presets first, the custom pair last. Native
           * date fields on purpose — a DatePicker popover inside this popover
           * would stack two floating layers for a two-field form. */
          <div
            className="flex flex-col gap-1.5 border-t border-kit-slate-5 pt-2"
            data-kit="table-filter-range"
          >
            <span className="text-label text-kit-slate-11">{filter.range.label}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                aria-label={`${filter.range.label} from`}
                data-testid={`table-filter-range-from-${colKey}`}
                className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                aria-label={`${filter.range.label} to`}
                data-testid={`table-filter-range-to-${colKey}`}
                className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={rangeFrom === "" || rangeTo === "" || rangeTo < rangeFrom}
              onClick={() => filter.range?.onApply(rangeFrom, rangeTo)}
              data-testid={`table-filter-range-apply-${colKey}`}
            >
              {filter.range.applyLabel}
            </Button>
          </div>
        ) : null}
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => filter.onChange(new Set())}
            data-testid={`table-filter-clear-${colKey}`}
          >
            {filter.clearLabel}
          </Button>
        ) : null}
      </div>
    </Popover>
  );
}

export default function DataTable<Row>({
  rows,
  columns,
  rowId,
  onRowOpen,
  selection,
  empty,
  loading = false,
  label,
  sort = null,
  onSortChange,
  rowLate,
  rowMuted,
  group,
  expansion,
  layout,
  totals,
  /* NO DEFAULT VALUE — `undefined` IS `"fill"`, the same way `order` and
   * `widthPct` are null until something is dragged. §10.1's guard forbids
   * defaulting a prop to a string, and it is right to: the default must be
   * the ABSENCE of the caller's choice, never a copy of it. */
  sizing,
}: DataTableProps<Row>) {
  const selectableRows = selection
    ? rows.filter((r) => selection.selectable?.(r) ?? true)
    : [];
  const selectedCount = selection
    ? selectableRows.filter((r) => selection.selected.has(rowId(r))).length
    : 0;
  const allSelected =
    selection != null && selectableRows.length > 0 && selectedCount === selectableRows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  /* ── D0.5d · the operator's grid ──────────────────────────────────────────
   * Both pieces of state are `null` until something is dragged, and `null`
   * means "the caller's". That is what makes a page which passes no `layout`
   * render exactly the markup D0.5c rendered — the default is not a copy of
   * the caller's values, it is their ABSENCE. Neither is written anywhere that
   * survives a reload (§0.4).
   */
  const [order, setOrder] = useState<string[] | null>(null);
  const [widthPct, setWidthPct] = useState<Record<string, number> | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const headRef = useRef<HTMLTableRowElement | null>(null);

  const ordered = useMemo(() => applyColumnOrder(columns, order), [columns, order]);
  /* P16 — the filler is a CELL in every row, so it counts here or a group
   * header and an expanded record would both stop short of the right edge. */
  const fills = sizing === "content";
  const colSpan =
    ordered.length + (selection ? 1 : 0) + (expansion ? 1 : 0) + (fills ? 1 : 0);

  /**
   * Resize by pointer. The FIRST drag snapshots every column's rendered width
   * as a percentage — including the ones the caller declared in `px` or as
   * `auto` — so that from the first frame onward the widths are one unit that
   * sums to the table, and `resizeColumnPair` can hold that sum constant.
   *
   * A measurement of zero means we are not in a browser (jsdom returns zero
   * for every rect), and the drag is REFUSED rather than acted on: resizing
   * off numbers we did not really read would set every column to `NaN%`.
   */
  const startResize = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const headRow = headRef.current;
      if (!headRow) return;
      const cells = Array.from(headRow.querySelectorAll("th[data-column]"));
      const px = cells.map((c) => c.getBoundingClientRect().width);
      const total = px.reduce((a, b) => a + b, 0);
      if (total <= 0 || px.length !== ordered.length) return;
      const startPct = px.map((w) => (w / total) * 100);
      const startX = e.clientX;
      const target = e.currentTarget;
      target.setPointerCapture?.(e.pointerId);

      const move = (ev: PointerEvent) => {
        const deltaPct = ((ev.clientX - startX) / total) * 100;
        const next = resizeColumnPair(startPct, index, deltaPct, MIN_COLUMN_PCT);
        setWidthPct(Object.fromEntries(ordered.map((c, i) => [c.key, next[i]!])));
      };
      const end = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", end);
        target.removeEventListener("pointercancel", end);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", end);
      target.addEventListener("pointercancel", end);
    },
    [ordered],
  );

  /* A column the caller stopped passing must not keep a width, or the grid
   * silently narrows for every operator who dragged it before it went. */
  useEffect(() => {
    if (widthPct == null) return;
    const live = new Set(columns.map((c) => c.key));
    if (Object.keys(widthPct).every((k) => live.has(k))) return;
    setWidthPct(null);
  }, [columns, widthPct]);

  return (
    <div
      data-kit="data-table"
      /* NO TOP RADIUS (card P16, Loo 2026-08-04). A rounded lip under a
       * square toolbar reads as a card floating on a page; a list grid is a
       * SHEET and meets what is above it flush. A page that wants a rounded
       * frame still gets one from its own wrapper — the kit stopped drawing a
       * corner nobody asked it for. Checked on all three pages that render
       * this file: To Order, Purchase Orders, Receiving. */
      className="min-h-0 flex-1 overflow-auto border border-kit-slate-5 bg-white"
    >
      <table
        aria-label={label}
        /* 40px FIXED rows. `whitespace-nowrap` kills the silent row-growers —
         * text WRAPPING inside a narrow fixed column is what makes one row
         * taller than the rest and the whole list stop being scannable. */
        className="w-full table-fixed border-separate border-spacing-0 text-body [&_td]:h-10 [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:align-middle"
      >
        {/* PERCENTAGE widths + `table-fixed` → the table is always exactly the
         *  container width, so it never scrolls sideways on a laptop. */}
        <colgroup>
          {/* The kit's own two. In `content` sizing they are PIXELS measured
           *  against what they hold — the 24px disclosure button in its 8+8
           *  padding and 2px late bar (42), the 16px checkbox in its own (32)
           *  — because 3%/4% of a table that no longer stretches is a control
           *  narrower than itself. */}
          {expansion && <col style={{ width: fills ? "42px" : "3%" }} />}
          {selection && <col style={{ width: fills ? "32px" : "4%" }} />}
          {ordered.map((c) => (
            <col
              key={c.key}
              style={{
                width:
                  widthPct?.[c.key] != null
                    ? `${widthPct[c.key]}%`
                    : typeof c.width === "number"
                      ? `${c.width}%`
                      : c.width,
              }}
            />
          ))}
          {/* The filler — `auto`, so `table-fixed` gives IT the slack instead
           *  of sharing it out over the columns above. */}
          {fills && <col style={{ width: "auto" }} />}
        </colgroup>

        <thead className={`sticky top-0 ${Z_TABLE_HEADER}`}>
          {/* border-separate + cell-level wash: with border-collapse, Chrome
              refuses to stick a thead's backgrounds at all — the classic
              see-through header (Jess caught it live, 2026-08-01). */}
          <tr className="h-10" ref={headRef}>
            {/* Header wash = slate-3 (Jess, 2026-08-02 surface law): one step
                above the near-white strip, always lighter than the data. */}
            {expansion && <th className="bg-kit-slate-3 border-b border-kit-slate-6" />}
            {selection && (
              <th className="px-2 bg-kit-slate-3 border-b border-kit-slate-6">
                <Checkbox
                  id="kit-table-select-all"
                  ariaLabel={selection.label}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={selection.onToggleAll}
                />
              </th>
            )}
            {ordered.map((c, ci) => (
              <th
                key={c.key}
                data-column={c.key}
                title={c.headerTitle}
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                /* REORDER — the whole header is the handle, which is the
                 * shape every grid an operator has met uses. It is only
                 * draggable while `layout` is passed, so a frozen page's
                 * header keeps exactly the attributes it had. */
                draggable={layout != null || undefined}
                onDragStart={
                  layout
                    ? (e) => {
                        setDragKey(c.key);
                        e.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
                onDragOver={layout ? (e) => e.preventDefault() : undefined}
                onDrop={
                  layout
                    ? (e) => {
                        e.preventDefault();
                        if (dragKey == null) return;
                        setOrder(
                          moveColumnOrder(
                            order ?? ordered.map((x) => x.key),
                            dragKey,
                            c.key,
                          ),
                        );
                        setDragKey(null);
                      }
                    : undefined
                }
                onDragEnd={layout ? () => setDragKey(null) : undefined}
                /* The name is PINNED to the column word, and that is a repair
                 * rather than a preference: the resize handle below is a
                 * descendant, so its own label was being folded into this
                 * header's accessible name and a screen reader read
                 * `Order Order — Drag to resize`. §7 says the header word is
                 * typed once; without this pin, turning the grid draggable
                 * quietly said it twice. What the operator may DO to the
                 * header is `aria-roledescription`, never part of its name. */
                aria-label={layout ? c.label : undefined}
                aria-roledescription={layout?.reorderLabel}
                className={`relative px-2 bg-kit-slate-3 border-b border-kit-slate-6 text-label font-medium text-kit-slate-12 ${
                  layout ? "cursor-grab" : ""
                } ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {/* The word first, its controls after — `Qty ▼`, never
                 * `▼ Qty` (Jess, 2026-08-01), whatever the alignment. A
                 * right-aligned column's cluster hugs the column edge so the
                 * numbers line up under it. */}
                <span
                  className={
                    c.align === "right"
                      ? "flex w-full items-center justify-end gap-0.5"
                      : "inline-flex items-center gap-0.5"
                  }
                >
                  {c.sortable && onSortChange ? (
                    /* Header click = sort, asc ⇄ desc — the Excel reflex.
                     * The kit shows the arrow; the PAGE reorders the rows. */
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange(
                          sort?.key !== c.key
                            ? { key: c.key, dir: "asc" }
                            : sort.dir === "asc"
                              ? { key: c.key, dir: "desc" }
                              : null,
                        )
                      }
                      aria-label={c.label}
                      data-testid={`table-sort-${c.key}`}
                      className="group inline-flex items-center gap-0.5"
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        <Icon name={sort.dir === "asc" ? "collapse" : "expand"} size={14} />
                      ) : (
                        /* GitHub's whisper: the arrow appears on hover, so a
                         * sortable header announces itself before the click. */
                        <span className="hidden group-hover:inline-flex opacity-60">
                          <Icon name="expand" size={14} />
                        </span>
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                  {c.filter ? <HeaderFilter colKey={c.key} filter={c.filter} /> : null}
                </span>
                {/* RESIZE — a 4px grab strip on the right edge, invisible
                 * until the pointer is on it. The LAST column has none: there
                 * is no neighbour to take from, and a handle that cannot move
                 * anything is a promise the grid cannot keep. */}
                {layout && ci < ordered.length - 1 ? (
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`${c.label} — ${layout.resizeLabel}`}
                    data-testid={`table-resize-${c.key}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(ci, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-kit-blue-9"
                  />
                ) : null}
              </th>
            ))}
            {/* The filler carries the header's own wash and rule so the band
             *  reaches the right edge. It holds no word — there is nothing
             *  here to sort, filter or read — and is hidden from a screen
             *  reader for the same reason. */}
            {fills && (
              <th
                aria-hidden="true"
                data-kit="table-filler"
                className="bg-kit-slate-3 border-b border-kit-slate-6"
              />
            )}
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} className="p-8">
                <Loading variant="skeleton" label={`Loading ${label}`} />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="p-0">
                {typeof empty === "string" ? <EmptyState title={empty} /> : empty}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row, rowIndex) => {
              const id = rowId(row);
              const isSelected = selection?.selected.has(id) ?? false;
              const late = rowLate?.(row) ?? false;
              const isExpanded = expansion?.expanded.has(id) ?? false;
              /* The late bar rides the row's FIRST cell, whichever that is
               * today — a disclosure column would otherwise have pushed the
               * one mark that says "act now" out of the reader's way. */
              const lateBar = late ? "border-kit-red-9" : "border-transparent";
              // A header is emitted whenever the key CHANGES from the row
              // above — so the PAGE's sort decides where groups begin and the
              // kit re-orders nothing of its own.
              const opensGroup =
                group != null &&
                (rowIndex === 0 || group.keyOf(row) !== group.keyOf(rows[rowIndex - 1]!));
              return (
                <Fragment key={`grp-${id}`}>
                {opensGroup ? (
                  <tr data-kit="data-group" className="border-b border-kit-slate-5">
                    <td colSpan={colSpan} className="px-2 h-9 bg-kit-slate-2 align-middle">
                      {group!.header(row)}
                    </td>
                  </tr>
                ) : null}
                <tr
                  key={id}
                  data-kit="data-row"
                  data-selected={isSelected || undefined}
                  onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                  /* HOVER IS GREY, SELECTION IS BLUE (Loo, 2026-08-03).
                   * Hover says "the mouse is here" — one second long, no
                   * meaning — so it may not spend the accent. Selection is a
                   * lasting state with a consequence, and keeps blue-3.
                   * (This row was still blue-2 after the portal-wide sweep,
                   * because the sweep looked for blue-3 — found by reading
                   * this file, not by the lint.) */
                  data-muted={rowMuted?.(row) || undefined}
                  className={`border-b border-kit-slate-5 ${
                    isSelected ? "bg-kit-blue-3" : "hover:bg-kit-slate-3"
                  } ${onRowOpen ? "cursor-pointer" : ""} ${
                    rowMuted?.(row) ? "opacity-50 grayscale" : ""
                  }`}
                >
                  {expansion && (
                    /* The disclosure must not open the record it is unfolding
                     * — the same stopPropagation the checkbox cell has, for
                     * the same reason: two different things happen on one
                     * click and only one of them was asked for. */
                    <td
                      className={`px-2 border-l-2 ${lateBar}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(expansion.expandable?.(row) ?? true) ? (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={expansion.label(row)}
                          data-testid={`table-expand-${id}`}
                          onClick={() => expansion.onToggle(id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
                        >
                          <Icon name={isExpanded ? "collapse" : "expand"} size={14} />
                        </button>
                      ) : null}
                    </td>
                  )}
                  {selection && (
                    /* The checkbox must not open the record it is ticking. */
                    <td
                      className={`px-2 ${expansion ? "" : `border-l-2 ${lateBar}`}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(selection.selectable?.(row) ?? true) ? (
                        <Checkbox
                          id={`kit-table-row-${id}`}
                          ariaLabel={`Select ${id}`}
                          checked={isSelected}
                          onCheckedChange={() => selection.onToggleRow(id)}
                        />
                      ) : null}
                    </td>
                  )}
                  {ordered.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-2 text-kit-slate-12 ${
                        !selection && !expansion && i === 0 ? `border-l-2 ${lateBar}` : ""
                      } ${c.align === "right" ? "text-right" : ""} ${
                        c.numeric ? "tabular-nums" : ""
                      }`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {fills && <td aria-hidden="true" data-kit="table-filler" />}
                  </tr>
                {isExpanded ? (
                  /* THE ONE CELL THAT MAY BE TALL. The table's own rule is
                   * `[&_td]:h-10` + `whitespace-nowrap`, and it binds the rows
                   * you SCAN — a record that unfolded into 40 clipped pixels
                   * would not have opened at all. `!` because that rule is a
                   * descendant selector and outranks a plain class. */
                  <tr data-kit="data-expansion" data-row={id}>
                    <td
                      colSpan={colSpan}
                      className="!h-auto !overflow-visible !whitespace-normal border-b border-kit-slate-5 bg-kit-slate-2 px-4 py-3 align-top"
                    >
                      {expansion!.render(row)}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
        </tbody>

        {/* TOTALS — pinned under the last row the way the head is pinned over
         *  the first. It is withheld while the table is loading or empty: a
         *  totals strip over no rows states a total of nothing. */}
        {totals && !loading && rows.length > 0 ? (
          <tfoot className={`sticky bottom-0 ${Z_TABLE_FOOTER}`}>
            <tr className="h-10" aria-label={totals.label} data-kit="data-totals">
              {expansion && <td className="bg-kit-slate-3 border-t border-kit-slate-6" />}
              {selection && <td className="bg-kit-slate-3 border-t border-kit-slate-6" />}
              {ordered.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 bg-kit-slate-3 border-t border-kit-slate-6 text-kit-slate-12 ${
                    c.align === "right" ? "text-right" : ""
                  } ${c.numeric ? "tabular-nums" : ""}`}
                >
                  {totals.cell(c, rows)}
                </td>
              ))}
              {fills && (
                <td
                  aria-hidden="true"
                  data-kit="table-filler"
                  className="bg-kit-slate-3 border-t border-kit-slate-6"
                />
              )}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
