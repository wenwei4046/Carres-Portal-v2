/**
 * D0.5d — the four grid powers `DataTable` grew, and the ONE it did not.
 *
 * **The first describe block is the whole safety argument of the card.** Three
 * live pages render through `DataTable` today and two of them are FROZEN, so
 * the property that matters more than any new feature is that a caller who
 * passes none of the new props gets the D0.5c table back, attribute for
 * attribute. Every other block here is a feature; that one is the licence.
 *
 * **Why so much of this is a PURE-function test and not a drag.** jsdom has no
 * layout: `getBoundingClientRect()` returns zero for every element, so a
 * simulated resize drag can prove that a handler fired and NOTHING about where
 * the column landed. The arithmetic therefore lives in `grid-layout.ts` and is
 * asserted directly — the same reason D0.5b opened its menus with the keyboard
 * once it measured that jsdom has no `PointerEvent`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DataTable, { type Column } from "./DataTable";
import { applyColumnOrder, moveColumnOrder, resizeColumnPair } from "./grid-layout";

interface Row {
  id: string;
  ref: string;
  qty: number;
}

const ROWS: Row[] = [
  { id: "1", ref: "SO-1256", qty: 2 },
  { id: "2", ref: "SO-1257", qty: 3 },
];

const COLUMNS: Column<Row>[] = [
  { key: "ref", label: "Order", width: 60, cell: (r) => r.ref },
  { key: "qty", label: "Qty", width: 25, align: "right", numeric: true, cell: (r) => r.qty },
  { key: "note", label: "Remarks", width: 15, cell: () => "—" },
];

const base = {
  rows: ROWS,
  columns: COLUMNS,
  rowId: (r: Row) => r.id,
  empty: "none",
  label: "Orders",
} as const;

const headers = () => screen.getAllByRole("columnheader").map((h) => h.textContent);

/* ───────────────────────────────────────────────────────────────────────────
 * THE LICENCE — pass nothing new, get D0.5c back
 * ────────────────────────────────────────────────────────────────────────── */

describe("D0.5d is additive — a caller who passes none of it sees no change", () => {
  it("adds no column, no footer, no totals strip and nothing draggable", () => {
    render(<DataTable {...base} />);
    // No disclosure column: the header row is exactly the caller's columns.
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(document.querySelector('[data-kit="data-table-footer"]')).toBeNull();
    expect(document.querySelector('[data-kit="data-totals"]')).toBeNull();
    expect(document.querySelector('[data-kit="data-expansion"]')).toBeNull();
    expect(document.querySelector("tfoot")).toBeNull();
    expect(document.querySelector("th[draggable]")).toBeNull();
    expect(document.querySelector('[role="separator"]')).toBeNull();
    // And the one root element it has always had is still the scroll box.
    expect(document.querySelector('[data-kit="data-table"]')).toBeInTheDocument();
  });

  it("keeps the header's accessible NAME as the column word when nothing is draggable", () => {
    render(<DataTable {...base} />);
    expect(screen.getByRole("columnheader", { name: "Order" })).toBeInTheDocument();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * POWER 3 — a row opens. The one P10 is waiting on.
 * ────────────────────────────────────────────────────────────────────────── */

describe("row expand", () => {
  const expansion = (expanded: string[], onToggle = vi.fn()) => ({
    expanded: new Set(expanded),
    onToggle,
    render: (r: Row) => <div data-testid={`lines-${r.id}`}>{r.ref} lines</div>,
    label: (r: Row) => `Open ${r.ref}`,
  });

  it("renders the control with the caller's word and nothing of its own", () => {
    render(<DataTable {...base} expansion={expansion([])} />);
    expect(screen.getByRole("button", { name: "Open SO-1256" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("lines-1")).not.toBeInTheDocument();
  });

  it("renders the caller's content — and ONLY the caller's — when the row is open", () => {
    render(<DataTable {...base} expansion={expansion(["1"])} />);
    expect(screen.getByTestId("lines-1")).toBeInTheDocument();
    expect(screen.queryByTestId("lines-2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SO-1256" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("spans the whole width, so the record is not folded into one column", () => {
    render(<DataTable {...base} expansion={expansion(["1"])} />);
    const cell = document.querySelector('[data-kit="data-expansion"] td')!;
    // 3 columns + the disclosure column.
    expect(cell.getAttribute("colspan")).toBe("4");
  });

  it("is the ONE cell allowed to be tall and to wrap — the 40px law binds rows you scan", () => {
    render(<DataTable {...base} expansion={expansion(["1"])} />);
    const cell = document.querySelector('[data-kit="data-expansion"] td')!;
    expect(cell.className).toContain("!h-auto");
    expect(cell.className).toContain("!whitespace-normal");
    expect(cell.className).toContain("!overflow-visible");
  });

  it("opens the row it is told to, and does NOT open the record underneath", () => {
    const onToggle = vi.fn();
    const onRowOpen = vi.fn();
    render(<DataTable {...base} onRowOpen={onRowOpen} expansion={expansion([], onToggle)} />);
    fireEvent.click(screen.getByTestId("table-expand-1"));
    expect(onToggle).toHaveBeenCalledWith("1");
    expect(onRowOpen).not.toHaveBeenCalled();
  });

  it("gives a row with nothing to open NO control, rather than a dead one", () => {
    render(
      <DataTable
        {...base}
        expansion={{ ...expansion([]), expandable: (r: Row) => r.id === "1" }}
      />,
    );
    expect(screen.getByTestId("table-expand-1")).toBeInTheDocument();
    expect(screen.queryByTestId("table-expand-2")).not.toBeInTheDocument();
  });

  it("moves the late bar onto the disclosure cell — the first cell still carries it", () => {
    render(<DataTable {...base} expansion={expansion([])} rowLate={(r) => r.id === "1"} />);
    const firstRow = document.querySelector('[data-kit="data-row"]')!;
    expect(firstRow.querySelector("td")!.className).toContain("border-kit-red-9");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * POWER 1 — resize · reorder
 * ────────────────────────────────────────────────────────────────────────── */

const LAYOUT = { resizeLabel: "Drag to resize", reorderLabel: "Drag to reorder" };

describe("resizeColumnPair — a resize may never widen the table (§7)", () => {
  it("takes from the right neighbour, so the sum never moves", () => {
    const before = [40, 30, 30];
    const after = resizeColumnPair(before, 0, 10, 5);
    expect(after).toEqual([50, 20, 30]);
    expect(after.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("clamps the MOVEMENT, not the result — a fast drag cannot teleport a neighbour", () => {
    // Asking for +25 when the neighbour only has 25 above its floor of 5.
    expect(resizeColumnPair([40, 30, 30], 0, 999, 5)).toEqual([65, 5, 30]);
    expect(resizeColumnPair([40, 30, 30], 0, -999, 5)).toEqual([5, 65, 30]);
  });

  it("refuses the last column — there is no neighbour to take from", () => {
    expect(resizeColumnPair([40, 30, 30], 2, 10, 5)).toEqual([40, 30, 30]);
    expect(resizeColumnPair([40, 30, 30], -1, 10, 5)).toEqual([40, 30, 30]);
  });
});

describe("moveColumnOrder + applyColumnOrder", () => {
  it("puts the dragged key where the dropped-on key is", () => {
    expect(moveColumnOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveColumnOrder(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });

  it("refuses a drop it cannot place rather than inventing a position", () => {
    expect(moveColumnOrder(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveColumnOrder(["a", "b"], "z", "a")).toEqual(["a", "b"]);
    expect(moveColumnOrder(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });

  it("drops a key the caller stopped passing and APPENDS a column it has never seen", () => {
    const cols = [{ key: "a" }, { key: "b" }, { key: "new" }];
    expect(applyColumnOrder(cols, ["b", "gone", "a"]).map((c) => c.key)).toEqual([
      "b",
      "a",
      "new",
    ]);
  });

  it("returns the caller's own order untouched when nothing has been dragged", () => {
    const cols = [{ key: "a" }, { key: "b" }];
    expect(applyColumnOrder(cols, null)).toBe(cols);
  });
});

describe("the draggable grid, in the DOM", () => {
  it("reorders the headers on a drop", () => {
    render(<DataTable {...base} layout={LAYOUT} />);
    expect(headers()).toEqual(["Order", "Qty", "Remarks"]);
    const [order, , remarks] = screen.getAllByRole("columnheader");
    fireEvent.dragStart(remarks!, { dataTransfer: { effectAllowed: "" } });
    fireEvent.drop(order!);
    expect(headers()).toEqual(["Remarks", "Order", "Qty"]);
  });

  it("describes what may be done to a header without renaming it", () => {
    render(<DataTable {...base} layout={LAYOUT} />);
    const th = screen.getByRole("columnheader", { name: "Order" });
    expect(th).toHaveAttribute("aria-roledescription", "Drag to reorder");
    expect(th).toHaveAttribute("draggable", "true");
  });

  it("still says the column word exactly ONCE with the handle inside it (§7)", () => {
    /* The handle is a DESCENDANT, so its own label was being folded into the
     * header's accessible name — `Order Order — Drag to resize`. Turning the
     * grid draggable must not make §7's typed-once word be read twice. */
    render(<DataTable {...base} layout={LAYOUT} />);
    for (const th of screen.getAllByRole("columnheader")) {
      expect(th).toHaveAccessibleName(/^(?:Order|Qty|Remarks)$/);
    }
  });

  it("puts a resize handle on every column EXCEPT the last", () => {
    render(<DataTable {...base} layout={LAYOUT} />);
    expect(screen.getByTestId("table-resize-ref")).toBeInTheDocument();
    expect(screen.getByTestId("table-resize-qty")).toBeInTheDocument();
    expect(screen.queryByTestId("table-resize-note")).not.toBeInTheDocument();
    expect(screen.getByTestId("table-resize-ref")).toHaveAccessibleName("Order — Drag to resize");
  });

  it("refuses to resize off a measurement it did not really take (jsdom rects are 0)", () => {
    render(<DataTable {...base} layout={LAYOUT} />);
    const widths = () =>
      Array.from(document.querySelectorAll("col")).map((c) => (c as HTMLElement).style.width);
    fireEvent.pointerDown(screen.getByTestId("table-resize-ref"), { clientX: 0, pointerId: 1 });
    // Nothing measurable, so nothing changed — never a column set to NaN%.
    expect(widths()).toEqual(["60%", "25%", "15%"]);
  });
});

describe("putting the grid back", () => {
  it("adds no reset control and no bar to hold one — a reload is the reset", () => {
    /* Which is only true BECAUSE nothing is persisted (§0.4). If a
     * `storageKey` ever lands, this test is the one that must be rewritten
     * first: a remembered grid has no way back without a control. */
    render(<DataTable {...base} layout={LAYOUT} />);
    const [order, , remarks] = screen.getAllByRole("columnheader");
    fireEvent.dragStart(remarks!, { dataTransfer: { effectAllowed: "" } });
    fireEvent.drop(order!);
    expect(headers()).toEqual(["Remarks", "Order", "Qty"]);

    // A fresh mount is a reload: the company's grid is back.
    render(<DataTable {...base} layout={LAYOUT} />);
    expect(headers().slice(3)).toEqual(["Order", "Qty", "Remarks"]);
    expect(document.querySelector('[data-kit="data-table-footer"]')).toBeNull();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * POWER 4 — the totals strip
 * ────────────────────────────────────────────────────────────────────────── */

describe("footer totals", () => {
  const totals = {
    label: "Totals",
    cell: (c: Column<Row>, rows: readonly Row[]) =>
      c.key === "qty" ? String(rows.reduce((a, r) => a + r.qty, 0)) : null,
  };

  it("aggregates nothing itself — the caller's cell is what appears", () => {
    render(<DataTable {...base} totals={totals} />);
    const strip = document.querySelector('[data-kit="data-totals"]')!;
    expect(strip.getAttribute("aria-label")).toBe("Totals");
    expect(strip.textContent).toBe("5");
  });

  it("lines the strip up with the columns above it, blanks included", () => {
    render(<DataTable {...base} totals={totals} />);
    const cells = document.querySelectorAll('[data-kit="data-totals"] td');
    expect(cells).toHaveLength(3);
    expect(cells[1]!.className).toContain("tabular-nums");
    expect(cells[1]!.className).toContain("text-right");
  });

  it("is withheld over no rows — a total of nothing is not a total", () => {
    const { rerender } = render(<DataTable {...base} rows={[]} totals={totals} />);
    expect(document.querySelector('[data-kit="data-totals"]')).toBeNull();
    rerender(<DataTable {...base} loading totals={totals} />);
    expect(document.querySelector('[data-kit="data-totals"]')).toBeNull();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * POWER 5 — the record bar, which already existed
 * ────────────────────────────────────────────────────────────────────────── */

describe("the record bar is PageShell's, and stays PageShell's", () => {
  it("grows no second band under the table", () => {
    render(<DataTable {...base} totals={{ label: "Totals", cell: () => "1" }} />);
    expect(document.querySelector('[data-kit="data-table-footer"]')).toBeNull();
  });

  it("is already built, in both halves — measured, not assumed", () => {
    /* The reason `records` is not a prop. `PageShell.footer` is a 36px band
     * whose own doc says "Count + pagination" and `chips` is the clearable
     * filter statement; a second copy in this file would have been §6.6's
     * failure in the one component whose header says it spells no word. */
    const shell = readFileSync(join(DIR, "PageShell.tsx"), "utf8");
    expect(shell).toMatch(/data-kit="page-footer"/);
    expect(shell).toMatch(/footer\?:\s*ReactNode/);
    expect(shell).toMatch(/chips\?:/);
    expect(readFileSync(join(DIR, "PageShell.tsx"), "utf8")).toMatch(/footer:\s*36/);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * The type constraints. These pass by FAILING TO COMPILE, so they are checked
 * by `tsc -p tsconfig.app.json` and not by the runner — delete the constraint
 * each one guards and typecheck goes red.
 *
 * Written WITHOUT a `{...spread}`, which is the D0.5c lesson: TypeScript
 * switches excess-property checking OFF for a JSX element carrying a spread,
 * so a directive above one reports as unused and proves nothing.
 * ────────────────────────────────────────────────────────────────────────── */

describe("what the new props refuse", () => {
  it("makes every visible word the caller's, and every one of them required", () => {
    // The kit still takes no className — D0.5d added four props and no door.
    void (
      // @ts-expect-error — no kit component accepts a className (§6.0)
      <DataTable rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" label="Orders" className="p-4" />
    );
    void (
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        empty="none"
        label="Orders"
        /* The directive sits on the ATTRIBUTE, not on the element: for a
         * multi-line JSX element TypeScript reports a missing property at
         * the attribute's own position, so a directive above the opening tag
         * reports as unused and guards nothing. The sibling of the spread
         * trap, and measured the same way. */
        // @ts-expect-error — `expansion` without `label`: a disclosure a screen reader cannot name
        expansion={{ expanded: new Set<string>(), onToggle: () => {}, render: () => null }}
      />
    );
    void (
      // @ts-expect-error — `totals` without `label`
      <DataTable rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" label="Orders" totals={{ cell: () => null }} />
    );
    void (
      // @ts-expect-error — there is no `records` prop: that band is PageShell's
      <DataTable rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" label="Orders" records={{ statement: "Record 2 of 55" }} />
    );
    void (
      // @ts-expect-error — `layout` without the two words its affordances need
      <DataTable rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="none" label="Orders" layout={{}} />
    );
    void (
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        empty="none"
        label="Orders"
        // @ts-expect-error — §0.4: there is no place to remember a per-user grid
        layout={{ ...LAYOUT, storageKey: "carres.grid.orders" }}
      />
    );
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * The two laws this card had to hold while adding five things
 * ────────────────────────────────────────────────────────────────────────── */

const DIR = dirname(fileURLToPath(import.meta.url));
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCES = ["DataTable.tsx", "grid-layout.ts"].map((f) => ({
  file: f,
  code: stripComments(readFileSync(join(DIR, f), "utf8")),
}));

describe("§0.4 — the grid remembers nothing between sessions", () => {
  it("stores no UI shape in the browser, in the kit or anywhere it could hide", () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/);
      expect(code, file).not.toMatch(/\bdocument\.cookie\b/);
    }
  });

  it("takes no storageKey — the prop that would make it possible does not exist", () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/storageKey/i);
    }
  });
});

describe("§10.1 — this file spells no word", () => {
  it("supplies no fallback string for anything a person can read", () => {
    for (const { file, code } of SOURCES) {
      // A default or a fallback is the only way a word could get onto the
      // screen without a caller having chosen it. A fallback to the EMPTY
      // string is not a word — it is the absence of one, and the range
      // filter's two date fields have used it since D0.5c.
      expect(code, file).not.toMatch(/\?\?\s*["'`][^"'`]/);
      expect(code, file).not.toMatch(/\|\|\s*["'`][^"'`]/);
    }
  });

  it("defaults no prop to a word — an unsupplied label renders nothing, never English", () => {
    /* Scoped to the PROP LIST on purpose. A first draft scanned the whole file
     * for `name = "value"` and matched every JSX attribute in it — `type=
     * "button"`, `role="separator"` — which is a scan measuring the wrong
     * thing while looking strict. The only place a word can enter without a
     * caller is a default, and defaults live here. */
    const code = SOURCES.find((s) => s.file === "DataTable.tsx")!.code;
    const params = code.match(/export default function DataTable<Row>\(\{([\s\S]*?)\}:/)?.[1];
    expect(params).toBeTruthy();
    expect(params).not.toMatch(/=\s*["'`]/);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * P16 — `sizing="content"`: the columns take what they measured, and a
 * FILLER takes the rest.
 *
 * The kit half of Loo's rule ① (2026-08-04): *"A table's WIDTH does not
 * decide a COLUMN's width. Content does."* In `table-fixed` the browser hands
 * spare width back out over the columns unless something `auto` is sitting
 * there to take it — so without the filler, "size a column to its content" is
 * a number the browser immediately overrides. jsdom cannot prove the LAYOUT;
 * it can prove the structure that produces it.
 * ────────────────────────────────────────────────────────────────────────── */

const PX_COLUMNS: Column<Row>[] = [
  { key: "ref", label: "Order", width: "120px", cell: (r) => r.ref },
  { key: "qty", label: "Qty", width: "55px", align: "right", numeric: true, cell: (r) => r.qty },
];

const cols = () => [...document.querySelectorAll("colgroup col")] as HTMLElement[];

const SELECTION = {
  selected: new Set<string>(),
  onToggleRow: () => {},
  onToggleAll: () => {},
  label: "Select all",
};

const EXPANSION = {
  expanded: new Set<string>(),
  onToggle: () => {},
  render: (r: Row) => <div>{r.ref} lines</div>,
  label: (r: Row) => `Open ${r.ref}`,
};

describe("P16 · sizing — the default is still fill, and it is untouched", () => {
  it("adds no filler and keeps the kit's own columns proportional", () => {
    render(<DataTable {...base} selection={SELECTION} expansion={EXPANSION} />);
    expect(document.querySelector('[data-kit="table-filler"]')).toBeNull();
    // 3% + 4% — the shares D0.5c shipped. Purchase Orders and Receiving are
    // on this path, so a change here would reach two frozen pages.
    expect(cols()[0]!.style.width).toBe("3%");
    expect(cols()[1]!.style.width).toBe("4%");
  });
});

describe('P16 · sizing="content" — nothing but the filler grows', () => {
  it("keeps each column at exactly the width its def asked for", () => {
    render(<DataTable {...base} columns={PX_COLUMNS} sizing="content" />);
    expect(cols().map((c) => c.style.width)).toEqual(["120px", "55px", "auto"]);
  });

  it("fixes the kit's own two columns in pixels, not shares of the table", () => {
    render(
      <DataTable {...base} columns={PX_COLUMNS} selection={SELECTION} expansion={EXPANSION} sizing="content" />,
    );
    // A 3% share of a table that no longer stretches is a 24px disclosure
    // button in 20px of column.
    expect(cols()[0]!.style.width).toBe("42px");
    expect(cols()[1]!.style.width).toBe("32px");
  });

  it("gives the filler no word, no role and nothing to read", () => {
    render(<DataTable {...base} columns={PX_COLUMNS} sizing="content" />);
    const head = document.querySelector('thead th[data-kit="table-filler"]')!;
    expect(head).toBeInTheDocument();
    expect(head.textContent).toBe("");
    expect(head.getAttribute("aria-hidden")).toBe("true");
    // It is not a column: the header row a screen reader hears is the caller's.
    expect(headers()).toEqual(["Order", "Qty"]);
  });

  it("puts one filler cell in every row, so no row stops short of the edge", () => {
    render(<DataTable {...base} columns={PX_COLUMNS} sizing="content" />);
    for (const tr of document.querySelectorAll('tbody tr[data-kit="data-row"]')) {
      expect(tr.querySelectorAll('[data-kit="table-filler"]')).toHaveLength(1);
    }
  });

  it("counts the filler in colSpan — a group header still spans the table", () => {
    render(
      <DataTable
        {...base}
        columns={PX_COLUMNS}
        sizing="content"
        group={{ keyOf: () => "one", header: () => <span>SO-1256</span> }}
      />,
    );
    const cell = document.querySelector('[data-kit="data-group"] td')!;
    // 2 columns + the filler. Without this the group header would end where
    // the last column ends and the band would break mid-sheet.
    expect(cell.getAttribute("colspan")).toBe("3");
  });

  it("counts the filler in colSpan — an expanded record still spans the table", () => {
    render(
      <DataTable
        {...base}
        columns={PX_COLUMNS}
        sizing="content"
        expansion={{ ...EXPANSION, expanded: new Set(["1"]) }}
      />,
    );
    const cell = document.querySelector('[data-kit="data-expansion"] td')!;
    // 2 columns + the disclosure column + the filler.
    expect(cell.getAttribute("colspan")).toBe("4");
  });
});

describe("P16 · the kit draws no top corner", () => {
  it("leaves the frame to the page — a list grid is a sheet, not a card", () => {
    render(<DataTable {...base} />);
    const root = document.querySelector('[data-kit="data-table"]')!;
    expect(root.className).not.toMatch(/rounded/);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * P17 — the grid gets its column separators (Loo, 2026-08-05)
 *
 * Ruled from two photographs of the live page. Measured on production before
 * a line was written: **every cell in all four Purchasing grids carried
 * `border-right: 0px`** — 7 on To Order, 220 on Purchase Orders, 110 on
 * Receiving, 11 on Claims.
 *
 * These are CLASS assertions, and that is on purpose: jsdom has no layout, so
 * it cannot tell whether a hairline PAINTS. What it can prove is the thing
 * that actually regressed — that the rule is declared, on the right cells,
 * in one token. Whether it renders was measured in a real browser.
 * ────────────────────────────────────────────────────────────────────────── */

const RULE = /border-r\b/;
const rowCells = () => [...document.querySelectorAll('tr[data-kit="data-row"]')[0]!.children];
const headCells = () => [...document.querySelectorAll("thead th")];

describe("P17 · a data grid carries column separators", () => {
  it("rules every interior DATA cell of the header and of a data row", () => {
    render(<DataTable {...base} selection={SELECTION} expansion={EXPANSION} />);
    for (const cells of [headCells(), rowCells()]) {
      expect(cells.length).toBe(5); // disclosure + checkbox + 3 columns
      // cells[2] and cells[3] are data columns with a neighbour to their right.
      for (const c of cells.slice(2, -1)) expect(c.className).toMatch(RULE);
    }
  });

  it("costs the kit's own zero-slack columns NOTHING — the gutter rules from the other side", () => {
    render(<DataTable {...base} selection={SELECTION} expansion={EXPANSION} />);
    for (const cells of [headCells(), rowCells()]) {
      // P16 sized these to their contents EXACTLY (8+16+8 and 2+8+24+8), so a
      // right border here shaves the control it holds — measured live, the
      // 16px checkbox overflowed a 15px box and was clipped.
      expect(cells[0]!.className).not.toMatch(RULE); // disclosure
      expect(cells[1]!.className).not.toMatch(RULE); // checkbox
      // The gutter's boundary is the FIRST DATA column's left border — the
      // same pixel, paid for by a column that has room.
      expect(cells[2]!.className).toMatch(/border-l border-kit-slate-5/);
    }
  });

  it("gives the first column NO left rule when there is no gutter to divide off", () => {
    render(<DataTable {...base} />);
    // No control column ⇒ column 0 IS the table's left edge, and it is also the
    // cell carrying the 2px late bar. Two claims on one border is a fight.
    expect(headCells()[0]!.className).not.toMatch(/border-l border-kit-slate-5/);
    expect(rowCells()[0]!.className).not.toMatch(/border-l border-kit-slate-5/);
  });

  it("leaves the LAST cell unruled — the edge belongs to the wrapper, not to a cell", () => {
    render(<DataTable {...base} selection={SELECTION} expansion={EXPANSION} />);
    // A rule here would sit 1px inside the wrapper's own border and read 2px.
    expect(headCells().at(-1)!.className).not.toMatch(RULE);
    expect(rowCells().at(-1)!.className).not.toMatch(RULE);
  });

  it("draws it in ONE token — slate-5, the row hairline's own value", () => {
    render(<DataTable {...base} selection={SELECTION} expansion={EXPANSION} />);
    for (const c of [...headCells(), ...rowCells()]) {
      if (!RULE.test(c.className)) continue;
      expect(c.className).toMatch(/border-r border-kit-slate-5/);
      // NOT `divider` (slate-6). That is the head's own bottom edge, and a
      // column line drawn in it changes colour at the header.
      expect(c.className).not.toMatch(/border-r border-kit-slate-6/);
    }
  });

  it("BOUNDS the trailing whitespace: the last real column rules, the filler does not", () => {
    render(
      <DataTable
        {...base}
        columns={PX_COLUMNS}
        sizing="content"
        totals={{ label: "Totals", cell: () => null }}
      />,
    );
    // The empty region reads as CLOSED rather than as a table that stopped …
    expect(headCells().at(-2)!.className).toMatch(RULE);
    expect(rowCells().at(-2)!.className).toMatch(RULE);
    // … and is never latticed with lines for columns that do not exist (P16).
    // EVERY filler — head, body AND totals. A body-only lattice passed this
    // test when it checked the header alone; the negative control caught it.
    const fillers = [...document.querySelectorAll('[data-kit="table-filler"]')];
    expect(fillers.length).toBe(2 + ROWS.length); // head + totals + one per row
    for (const f of fillers) expect(f.className).not.toMatch(RULE);
  });

  it("does NOT slice the group band — it is one sentence, anchored from below", () => {
    render(
      <DataTable
        {...base}
        group={{ keyOf: (r) => r.ref, header: (r) => <span>{r.ref}</span> }}
      />,
    );
    const bands = [...document.querySelectorAll('tr[data-kit="data-group"]')];
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      // ONE cell spanning the width — never one cell per column.
      expect(band.children).toHaveLength(1);
      expect(band.children[0]!.className).not.toMatch(RULE);
    }
  });

  it("does NOT slice an expanded record either", () => {
    render(<DataTable {...base} expansion={{ ...EXPANSION, expanded: new Set(["1"]) }} />);
    const cell = document.querySelector('[data-kit="data-expansion"] td')!;
    expect(cell.className).not.toMatch(RULE);
  });

  it("rules the totals strip too, so a column line runs the whole grid", () => {
    render(
      <DataTable {...base} totals={{ label: "Totals", cell: (c) => (c.key === "qty" ? 5 : null) }} />,
    );
    const foot = [...document.querySelectorAll("tfoot td")];
    expect(foot).toHaveLength(3);
    for (const c of foot.slice(0, -1)) expect(c.className).toMatch(RULE);
    expect(foot.at(-1)!.className).not.toMatch(RULE);
  });

  it("changes no width and no row height — the rule is structure, not a column", () => {
    const { unmount } = render(<DataTable {...base} columns={PX_COLUMNS} sizing="content" />);
    const withRule = [...document.querySelectorAll("col")].map((c) => c.style.width);
    unmount();
    // The widths are the caller's defs, untouched by P17 — no cell was added
    // and no column was taken from to pay for a line.
    expect(withRule).toEqual(PX_COLUMNS.map((c) => String(c.width)).concat("auto"));
  });
});
