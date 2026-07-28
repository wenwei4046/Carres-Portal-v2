/**
 * DataTable — the frame, and what a page can no longer do to it (card D0.5c).
 *
 * The Orders page's own 134 tests are the real proof that the extraction is
 * faithful: they render through this component now and none of them changed.
 * What is asserted HERE is the frame's own contract — the geometry that made
 * 26 hand-rolled tables disagree with each other.
 *
 * NEGATIVE CONTROL: drop `table-fixed` from the table's class string — the
 * "never scrolls sideways" test fails and nothing else does.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DataTable from "./DataTable";

const COLS = [
  { key: "sel", widthPct: 3, head: <input type="checkbox" aria-label="Select all" /> },
  { key: "order", widthPct: 50, label: "Order" },
  { key: "customer", widthPct: 47, label: "Customer", title: "Who bought it" },
];

const row = (
  <tr key="1">
    <td>
      <input type="checkbox" aria-label="Select SO-1256" />
    </td>
    <td>SO-1256</td>
    <td>Tan Wei Ming</td>
  </tr>
);

describe("the frame", () => {
  it("is table-fixed with percentage widths, so it never scrolls sideways", () => {
    const { container } = render(<DataTable columns={COLS}>{row}</DataTable>);
    expect(container.querySelector("table")).toHaveClass("table-fixed");
    const cols = [...container.querySelectorAll("col")];
    expect(cols.map((c) => (c as HTMLElement).style.width)).toEqual(["3%", "50%", "47%"]);
  });

  it("keeps the head sticky on layer 1 — it rises over the rows and nothing else", () => {
    const { container } = render(<DataTable columns={COLS}>{row}</DataTable>);
    const head = container.querySelector("thead");
    expect(head).toHaveClass("sticky");
    expect(head).toHaveClass("z-10");
  });

  it("holds the row height at 40px — content adapts to the row, never the reverse", () => {
    const { container } = render(<DataTable columns={COLS}>{row}</DataTable>);
    const cls = container.querySelector("table")!.className;
    expect(cls).toContain("[&_td]:h-[40px]");
    expect(cls).toContain("[&_td]:whitespace-nowrap"); // a wrapping cell is how a list grows silently
  });

  it("renders a marker column's head and a word column's label", () => {
    render(<DataTable columns={COLS}>{row}</DataTable>);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Order" })).toBeInTheDocument();
  });

  it("says something when there is nothing — and only then", () => {
    const { rerender, container } = render(<DataTable columns={COLS}>{row}</DataTable>);
    expect(screen.queryByText("No orders in this tab.")).not.toBeInTheDocument();
    rerender(
      <DataTable columns={COLS} empty="No orders in this tab.">
        {null}
      </DataTable>,
    );
    const cell = screen.getByText("No orders in this tab.");
    // It spans the whole table, so the message sits under the list, not in column one.
    expect(cell.closest("td")).toHaveAttribute("colspan", String(COLS.length));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("takes a trailing row — the infinite-scroll sentinel lives inside tbody, not after it", () => {
    const { container } = render(
      <DataTable columns={COLS} after={<tr data-testid="sentinel"><td>Loading more…</td></tr>}>
        {row}
      </DataTable>,
    );
    expect(container.querySelector("tbody [data-testid='sentinel']")).toBeInTheDocument();
  });
});

describe("what a page cannot do to it", () => {
  it("refuses a restyle and refuses to own the row", () => {
    // @ts-expect-error — className is not a prop of a kit component
    void <DataTable columns={COLS} className="text-lg">{row}</DataTable>;
    // @ts-expect-error — the kit does not render rows: a row is business rendering
    void <DataTable columns={COLS} rows={[{ id: 1 }]} />;
    // @ts-expect-error — a column needs a width; the percentage IS the layout
    void <DataTable columns={[{ key: "order", label: "Order" }]}>{row}</DataTable>;
    expect(true).toBe(true);
  });
});
