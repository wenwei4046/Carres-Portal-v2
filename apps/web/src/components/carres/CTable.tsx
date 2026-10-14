/**
 * CTable — the Carres Table: the one list table of the v12 kit (Sales Order
 * Outright v12, owner 14 Oct 2026: "this is the last"; UI MASTER, one kit in
 * code). A page brings its columns, rows and cells; the table brings the frame:
 *
 *   ┌ card · data-carres-table ─────────────────────────────────────────────┐
 *   │ [▸][☐] [frozen 1st] [col] [col] …  sticky grey 40 header, 54 rows     │
 *   │  ▸ opens the row: one frame round the row and what opens under it     │
 *   │  …the list scrolls inside its own box; ▸ ☐ and the identifier stay    │
 *   ├───────────────────────────────────────────────────────────────────────┤
 *   │ n orders · Qty: … (2 lines at most)           Rows 20 ▾   ‹ 1 / 2 ›   │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * Every cell is one line, so every row is 54 (fix list 14 Oct, point 4): a
 * column is as wide as its longest value, never narrower than its v12 track,
 * and a list wider than its box scrolls sideways in its own box with ▸, ☐ and
 * the identifier fixed. Nothing is cut. The card has ONE column,
 * `minmax(0,1fr)`, so nothing in the footer can widen the list.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import MIcon from "./MIcon";
import CPill, { type CPillTone } from "./CPill";
import CPopover, { CMenuItem } from "./CPopover";
import ItemRows from "@/components/register/ItemRows";

/** One cell: the main words, then an optional grey second line. */
export type CCell = {
  t: string;
  sub?: string;
  /** Sub-line colour: muted grey (default secondary), ok green, warn amber. */
  subTone?: "muted" | "ok" | "warn";
  /** 400 · 500 · 600. */
  fw?: 400 | 500 | 600;
  /** Text colour: ink (default: the unselected-tab grey, c-tab), muted, warn. */
  fg?: "ink" | "muted" | "warn";
  pill?: boolean;
  tone?: CPillTone | "none";
  align?: "start" | "end";
  /** The full sentence behind a short state word (hover). */
  title?: string;
  /** The full words behind a short second line, e.g. `MS, BF` (hover). */
  subTitle?: string;
  /** The second line ends with … when its column is short (a customer's name;
   *  owner 14 Oct 2026); `subTitle` carries the full words on hover. */
  subClip?: boolean;
};

export type CTableColumn = {
  key: string;
  label: string;
  /** A long header printed on two lines; `label` stays its accessible name. */
  head?: readonly [string, string];
  /** The grid track, as v12 sets it (`120px`, `minmax(150px,1fr)`): the
   *  narrowest the column gets; a longer value widens it. */
  width: string;
  align?: "end";
};

const TICK = 24;
const GAP = 10;
/* Row insets: a 6px margin and 14px padding on each side (v12 table rows). */
const INSET = 6 + 14;

/** The px floor of a track: `120px` → 120, `minmax(150px,1fr)` → 150. */
export const trackFloor = (width: string) => Number(/(\d+)px/.exec(width)?.[1]) || 0;

/** A track widened to its longest value: `120px` + 164 → `164px`,
 *  `minmax(150px,1fr)` + 190 → `minmax(190px,1fr)`. */
export function widenTrack(width: string, need: number | undefined): string {
  const floor = trackFloor(width);
  return need && need > floor ? width.replace(/\d+px/, `${need}px`) : width;
}

/** The narrowest the table may be before it scrolls: every column's floor. */
export function tableMinWidth(columns: readonly CTableColumn[], selectable: boolean, expandable = false) {
  const lead = (selectable ? 1 : 0) + (expandable ? 1 : 0);
  const tracks = columns.reduce((sum, c) => sum + trackFloor(c.width), 0);
  const gaps = GAP * (columns.length - 1 + lead);
  return lead * TICK + tracks + gaps + 2 * INSET;
}

/** The header words: one line, or the two lines a long header is split into. */
export function CTableHead({ column }: { column: CTableColumn }) {
  return column.head ? (
    <span className="text-left leading-[1.25]" title={column.label}>
      <span className="block whitespace-nowrap">{column.head[0]}</span>
      <span className="block whitespace-nowrap">{column.head[1]}</span>
    </span>
  ) : (
    <span className="whitespace-nowrap text-left leading-[1.25]">{column.label}</span>
  );
}

/** One body cell: plain words or a pill, then the grey second line, each on one
 *  line. A value widens its column rather than be cut (fix list 14 Oct); only a
 *  `subClip` line (the customer's name) ends with …, its full words on hover. */
export function CTableCell({ cell }: { cell: CCell }) {
  const fg =
    cell.fg === "ink" ? "text-c-ink" : cell.fg === "muted" ? "text-c-muted" : cell.fg === "warn" ? "text-c-warn-fg" : cell.fw === 600 ? "text-c-ink" : "text-c-tab";
  const fw = cell.fw === 600 ? "font-semibold" : cell.fw === 500 ? "font-medium" : "font-normal";
  const subFg = cell.subTone === "muted" ? "text-c-muted" : cell.subTone === "ok" ? "text-c-ok-fg" : cell.subTone === "warn" ? "text-c-warn-fg" : "text-c-secondary";
  return (
    <>
      {cell.pill ? (
        cell.tone === "none" ? (
          <span className="text-[13px] text-c-muted">{cell.t}</span>
        ) : (
          <CPill tone={cell.tone ?? "info"}>{cell.t}</CPill>
        )
      ) : (
        <span className={`whitespace-nowrap tabular-nums ${fw} ${fg}`} title={cell.title}>
          {cell.t}
        </span>
      )}
      {cell.sub && (
        <span className={`${cell.subClip ? "max-w-full truncate" : "whitespace-nowrap"} text-[12px] ${subFg}`} title={cell.subTitle}>
          {cell.sub}
        </span>
      )}
    </>
  );
}

export type CTableSelection<R> = {
  isSelected: (row: R) => boolean;
  toggle: (row: R) => void;
  allSelected: boolean;
  toggleAll: () => void;
  /** The tick's accessible name, e.g. `Select SO-1371`. */
  rowLabel: (row: R) => string;
};

/** The table's own columns, handed to what opens under a row. */
export type CTableGrid = { columns: string; lead: number; leadLefts: number[]; firstLeft: number };

export type CTableExpand<R> = {
  isOpen: (row: R) => boolean;
  toggle: (row: R) => void;
  /** The ▸ button's accessible name, e.g. `Show the items of SO-1371`. */
  label: (row: R) => string;
  /**
   * What opens under the row: its items. `grid` is the table's own column
   * template and how many lead columns (▸, ☐) it starts with, so the item rows
   * line up under the table's columns.
   */
  render: (row: R, grid: CTableGrid) => ReactNode;
};

/* A frozen cell repeats its row's own background, and its shadow covers the
   gap beside it, so the scrolled columns pass underneath without showing. */
const FROZEN = "sticky z-[1] bg-[var(--row-bg)]";
const frozen = (left: number, coverLeft: boolean): CSSProperties => ({
  left,
  boxShadow: coverLeft ? `-${INSET}px 0 0 var(--row-bg), ${GAP}px 0 0 var(--row-bg)` : `${GAP}px 0 0 var(--row-bg)`,
});

export default function CTable<R>({
  label,
  columns,
  rows,
  rowKey,
  renderCell,
  renderHeader,
  onRowClick,
  rowTitle,
  rowTestId,
  selection,
  expand,
  identifier = 0,
  failure,
  placeholder,
  footer,
  testId,
}: {
  label: string;
  columns: readonly CTableColumn[];
  rows: readonly R[];
  rowKey: (row: R) => string;
  /** The contents of one cell (the table draws the cell box). */
  renderCell: (row: R, column: CTableColumn) => ReactNode;
  /** A header with its own control (a filter menu); default: the words. */
  renderHeader?: (column: CTableColumn) => ReactNode;
  onRowClick?: (row: R, e: MouseEvent) => void;
  rowTitle?: string;
  rowTestId?: (row: R) => string;
  selection?: CTableSelection<R>;
  /** ▸ opens a row (v12: expand has one job, showing what the row holds). */
  expand?: CTableExpand<R>;
  /**
   * The identifier column (SO No): with ▸ and ☐ it stays fixed on the left while
   * the list scrolls sideways (Layout Standard 14 Oct); a column before it scrolls
   * away beneath it.
   */
  identifier?: number;
  /** Replaces the whole table: a failed read. */
  failure?: ReactNode;
  /** Stands under the header instead of the rows: a loading or empty line. */
  placeholder?: ReactNode;
  footer: ReactNode;
  testId?: string;
}) {
  const ticks = selection != null;
  const arrows = expand != null;
  const lead = (arrows ? 1 : 0) + (ticks ? 1 : 0);
  /* Each column's longest value (header included), measured after every render:
     the rows are separate grids, so the widths are set here, the same for all. */
  const tableRef = useRef<HTMLDivElement>(null);
  const [need, setNeed] = useState<readonly number[]>([]);
  const [, setFontsTick] = useState(0);
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsTick((n) => n + 1));
  }, []);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const next = columns.map((_, i) => {
      let most = 0;
      table.querySelectorAll<HTMLElement>(`[data-ct-col="${i}"]`).forEach((cell) => {
        const left = cell.getBoundingClientRect().left;
        for (const child of cell.children) most = Math.max(most, child.getBoundingClientRect().right - left);
      });
      return Math.ceil(most);
    });
    setNeed((was) => (was.length === next.length && was.every((n, i) => n === next[i]) ? was : next));
  });
  const widths = columns.map((c, i) => widenTrack(c.width, need[i]));
  const widened = columns.map((c, i) => ({ ...c, width: widths[i]! }));
  const gcols = `${`${TICK}px `.repeat(lead)}${widths.join(" ")}`;
  /* ▸, then ☐, then the first column: each frozen at its own left. */
  const tickLeft = arrows ? INSET + TICK + GAP : INSET;
  const firstLeft = INSET + lead * (TICK + GAP);
  const isFrozen = (i: number) => i === identifier;
  const frozenStyle = () => frozen(firstLeft, lead === 0);
  return (
    <section
      aria-label={label}
      data-carres-table="list"
      data-testid={testId}
      className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-c-card-border bg-c-card"
    >
      <div className="min-h-0 min-w-0 overflow-auto [scrollbar-width:thin]" data-list-scroll>
        {failure ?? (
          <div ref={tableRef} role="table" aria-label={label} style={{ minWidth: tableMinWidth(widened, ticks, arrows) }}>
            <div
              role="row"
              className="sticky top-0 z-10 grid h-10 items-center gap-2.5 border-b border-c-head-line bg-[var(--row-bg)] px-5 text-[12px] font-medium text-c-muted [--row-bg:var(--c-band)]"
              style={{ gridTemplateColumns: gcols }}
            >
              {arrows && <span className={`${FROZEN} z-[2] self-stretch`} style={frozen(INSET, true)} role="columnheader" />}
              {selection && (
                <span className={`${FROZEN} z-[2] flex items-center self-stretch`} style={frozen(tickLeft, !arrows)} role="columnheader">
                  <input
                    type="checkbox"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 cursor-pointer accent-[var(--c-select-fg)]"
                  />
                </span>
              )}
              {columns.map((c, i) => (
                <div
                  key={c.key}
                  role="columnheader"
                  aria-label={c.head ? c.label : undefined}
                  data-ct-col={i}
                  className={`flex min-w-0 self-stretch items-center ${c.align === "end" ? "justify-end" : ""} ${isFrozen(i) ? `${FROZEN} z-[2]` : ""}`}
                  style={isFrozen(i) ? frozenStyle() : undefined}
                >
                  {renderHeader ? renderHeader(c) : <CTableHead column={c} />}
                </div>
              ))}
            </div>
            {placeholder ?? rows.map((r) => {
              const on = selection?.isSelected(r) ?? false;
              const opened = expand?.isOpen(r) ?? false;
              const row = (
                <div
                  role="row"
                  onClick={onRowClick ? (e) => onRowClick(r, e) : undefined}
                  title={rowTitle}
                  data-testid={rowTestId?.(r)}
                  aria-expanded={expand ? opened : undefined}
                  className={`grid min-h-[54px] items-center gap-2.5 bg-[var(--row-bg)] px-3.5 py-1.5 text-[13px] -outline-offset-2 hover:[outline:var(--c-focus)] ${
                    opened ? "rounded-t-[7px]" : "mx-1.5 rounded-[10px] border-b border-c-row-line"
                  } ${onRowClick ? "cursor-pointer" : ""} ${on ? "[--row-bg:var(--c-select-bg)]" : "[--row-bg:var(--c-card)] hover:[--row-bg:var(--c-search-bg)]"}`}
                  style={{ gridTemplateColumns: gcols }}
                >
                  {expand && (
                    <span className={`${FROZEN} flex items-center self-stretch`} style={frozen(INSET, true)} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => expand.toggle(r)}
                        aria-expanded={opened}
                        aria-label={expand.label(r)}
                        title={expand.label(r)}
                        className={`grid h-6 w-6 place-items-center rounded-full hover:bg-c-hover ${opened ? "text-c-tab" : "text-c-muted"}`}
                      >
                        <MIcon name={opened ? "expand_more" : "chevron_right"} size={20} />
                      </button>
                    </span>
                  )}
                  {selection && (
                    <span className={`${FROZEN} flex items-center self-stretch`} style={frozen(tickLeft, !arrows)} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => selection.toggle(r)}
                        aria-label={selection.rowLabel(r)}
                        className="h-4 w-4 cursor-pointer accent-[var(--c-select-fg)]"
                      />
                    </span>
                  )}
                  {columns.map((c, i) => (
                    <span
                      key={c.key}
                      role="cell"
                      data-ct-col={i}
                      className={`flex min-w-0 flex-col self-stretch justify-center leading-[1.3] ${c.align === "end" ? "items-end" : "items-start"} ${isFrozen(i) ? FROZEN : ""}`}
                      style={isFrozen(i) ? frozenStyle() : undefined}
                    >
                      {renderCell(r, c)}
                    </span>
                  ))}
                </div>
              );
              /* An opened row and what it holds are one box (v12: one frame round
                 the row and its items). The frame never clips: a clipping box would
                 become what the frozen ▸, ☐ and identifier stick to. */
              return opened && expand ? (
                <div key={rowKey(r)} className="mx-[5px] my-2 rounded-lg border border-c-open-frame">
                  {row}
                  <div>{expand.render(r, { columns: gcols, lead, leadLefts: [...(arrows ? [INSET] : []), ...(ticks ? [tickLeft] : [])], firstLeft })}</div>
                </div>
              ) : (
                <Fragment key={rowKey(r)}>{row}</Fragment>
              );
            })}
          </div>
        )}
      </div>
      {footer}
    </section>
  );
}

/**
 * The item rows that ▸ opens under a row (v12 Carres Table): a 32px sub-header
 * on the grey band, then one 44px row per item on the row's own columns. `Item`
 * (the model, then its grey spec line) spans the first three columns and keeps
 * its words in view while the list scrolls sideways; `Qty` sits under the fourth
 * and `Supplier`, when the page gives one, under the fifth and sixth (v12).
 * The ▸ and ☐ spaces stay fixed, so nothing scrolls out from under them.
 */
export function CTableItems({
  label,
  grid,
  items,
  empty,
  testId,
}: {
  label: string;
  grid: CTableGrid;
  /** `qty` is the words, `1 pc` · `2 pcs` · `1 set`; `supplier` is the owner's cell. */
  items: readonly { key: string; name: string; detail?: string; qty: string; supplier?: CCell }[];
  /** The line for a row with no items, e.g. `No items on this order`. */
  empty: string;
  testId?: string;
}) {
  const lead = grid.leadLefts.map((left, i) => (
    <span
      key={i}
      aria-hidden="true"
      className="sticky z-[1] self-stretch bg-[var(--row-bg)]"
      style={{ left, boxShadow: i === 0 ? `-${INSET}px 0 0 var(--row-bg), ${GAP}px 0 0 var(--row-bg)` : `${GAP}px 0 0 var(--row-bg)` }}
    />
  ));
  const item = { gridColumn: `${grid.lead + 1} / span 3` };
  const qty = { gridColumn: `${grid.lead + 4} / span 1` };
  const supplier = { gridColumn: `${grid.lead + 5} / span 2` };
  const suppliers = items.some((it) => it.supplier);
  const keep = { left: grid.firstLeft };
  return (
    <ItemRows label={label} stepBack={0} testId={testId}>
      <div role="row" className="grid h-8 items-center gap-2.5 bg-[var(--row-bg)] px-3.5 text-meta font-medium text-c-secondary [--row-bg:var(--c-band)]" style={{ gridTemplateColumns: grid.columns }}>
        {lead}
        <span role="columnheader" className="flex min-w-0 items-center self-stretch" style={item}>
          <span className="sticky z-[1] bg-[var(--row-bg)]" style={keep}>Item</span>
        </span>
        <span role="columnheader" style={qty}>Qty</span>
        {suppliers ? <span role="columnheader" style={supplier}>Supplier</span> : null}
      </div>
      {items.length === 0 ? <div role="row" className="border-t border-c-row-line px-3.5 py-3 text-body text-c-secondary">{empty}</div> : null}
      {items.map((it) => (
        <div key={it.key} role="row" className="grid min-h-[44px] items-center gap-2.5 border-t border-c-row-line bg-[var(--row-bg)] px-3.5 py-1 [--row-bg:var(--c-card)]" style={{ gridTemplateColumns: grid.columns }}>
          {lead}
          <span role="cell" className="flex min-w-0 items-center self-stretch" style={item}>
            <span className="sticky z-[1] flex min-w-0 flex-col bg-[var(--row-bg)] leading-[1.3]" style={keep}>
              <span className="break-words text-body text-c-ink">{it.name}</span>
              {it.detail ? <span className="break-words text-meta text-c-secondary">{it.detail}</span> : null}
            </span>
          </span>
          <span role="cell" className="whitespace-nowrap text-body tabular-nums text-c-ink" style={qty}>{it.qty}</span>
          {suppliers ? (
            <span role="cell" className="flex min-w-0 flex-col text-body" style={supplier}>
              {it.supplier ? <CTableCell cell={it.supplier} /> : null}
            </span>
          ) : null}
        </div>
      ))}
    </ItemRows>
  );
}

const PAGE_SIZES = [20, 50, 100] as const;
/* The footer's line height (leading-4). */
const LINE = 16;

/** `Rows 20 ▾`. */
function RowsMenu({ size, onSize }: { size: number; onSize: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <CPopover
      label="Rows per page"
      role="menu"
      width={120}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-c-secondary">
          Rows {size}
          <MIcon name="arrow_drop_down" size={18} />
        </button>
      }
    >
      {PAGE_SIZES.map((n) => (
        <CMenuItem key={n} checked={n === size} onSelect={() => { onSize(n); setOpen(false); }}>
          {n}
        </CMenuItem>
      ))}
    </CPopover>
  );
}

/** The footer's totals: `Qty:` then its parts; `short` is the same parts in short forms. */
export type CTableTotals = { lead: string; parts: readonly string[]; short?: readonly string[] };

/** `72 orders · Qty: Mattress 72 · Pillow 91`: one flow, one space each side of `·`, each part kept whole. */
function TotalsLine({ count, totals }: { count: string; totals?: CTableTotals | undefined; }) {
  const parts = (list: readonly string[]) =>
    list.map((p, i) => (
      <Fragment key={i}>
        {" · "}
        <span className="whitespace-nowrap">{p}</span>
      </Fragment>
    ));
  return (
    <>
      <span className="whitespace-nowrap">{count}</span>
      {totals && totals.parts.length > 0 ? (
        <>
          {" · "}
          <span className="whitespace-nowrap">{totals.lead}</span>{" "}
          <span className="whitespace-nowrap">{totals.parts[0]}</span>
          {parts(totals.parts.slice(1))}
        </>
      ) : null}
    </>
  );
}

/**
 * The footer (44 high): the count and the totals in one line of words, then rows
 * per page and the pager. The words take two lines at most (fix list 14 Oct):
 * when the full words need a third, the short forms show and the full words are
 * on hover; the footer never pushes the pager out of the card.
 */
export function CTableFooter({
  count,
  totals,
  pageSize,
  onPageSize,
  page,
  pages,
  onPage,
  testId,
}: {
  count: string;
  totals?: CTableTotals;
  pageSize: number;
  onPageSize: (n: number) => void;
  page: number;
  pages: number;
  onPage: (n: number) => void;
  testId?: string;
}) {
  const full = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = full.current;
    if (!el) return;
    /* The hidden copy holds the full words at the footer's own width. */
    const check = () => setShort(Boolean(totals?.short) && el.getBoundingClientRect().height > 2 * LINE + 1);
    check();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [count, totals]);
  const words = (list?: readonly string[]) => [count, ...(totals && list?.length ? [`${totals.lead} ${list.join(" · ")}`] : [])].join(" · ");
  return (
    <div className="flex min-h-[44px] min-w-0 items-center gap-3 border-t border-c-footer-line px-3.5 py-1 text-[13px] text-c-secondary" data-testid={testId}>
      <span className="relative min-w-0 flex-1 leading-4">
        <span ref={full} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          <TotalsLine count={count} totals={totals} />
        </span>
        <span
          className="line-clamp-2"
          title={short ? words(totals?.parts) : undefined}
          data-testid={testId ? `${testId}-qty` : undefined}
        >
          <TotalsLine count={count} totals={totals && short ? { ...totals, parts: totals.short ?? totals.parts } : totals} />
        </span>
      </span>
      <RowsMenu size={pageSize} onSize={onPageSize} />
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-c-ink">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
          <MIcon name="chevron_left" size={18} />
        </button>
        {page} / {pages}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
          <MIcon name="chevron_right" size={18} />
        </button>
      </span>
    </div>
  );
}
