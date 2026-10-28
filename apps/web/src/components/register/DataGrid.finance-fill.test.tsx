/**
 * FINANCE LOOK · ONE FILL COLUMN, AND A DRAGGED WIDTH REMEMBERED
 * (Chew 2026-10-14, docs/finance/MASTER.md §4.2).
 *
 * With `look="finance"` and `fillColumn`, the table is at least as wide as its
 * box again and the named column takes the rest: it carries no fixed width,
 * its declared width is its minimum, and every other column keeps its pixels.
 * A width the person saved for the fill column wins and fixes it. Without the
 * Finance look, `fillColumn` changes nothing, and a non-Finance grid draws
 * exactly what it drew before.
 */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row {
  id: string;
  bill: string;
  supplier: string;
  amount: number;
}

const ROWS: Row[] = [
  { id: "a", bill: "BL-0001", supplier: "Lumen Furniture Sdn Bhd", amount: 1200 },
  { id: "b", bill: "BL-0002", supplier: "Kayu Jati", amount: 80 },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { key: "bill", label: "Bill No", width: 120, accessor: (r) => r.bill },
  { key: "supplier", label: "Supplier", width: 260, accessor: (r) => r.supplier },
  { key: "amount", label: "Amount", width: 128, align: "right", accessor: (r) => String(r.amount),
    footerTotal: (rows) => String(rows.reduce((s, r) => s + r.amount, 0)) },
];

const header = (label: string) => screen.getAllByRole("columnheader").find((th) => th.getAttribute("title") === label)!;
const bodyCell = (text: string) => screen.getByText(text).closest("td")!;
const table = () => screen.getByRole("table");

afterEach(() => window.localStorage.clear());

describe("DataGrid · Finance look fill column", () => {
  it("gives the fill column no fixed width and the table min-width 100%", () => {
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.1" rowKey={(r) => r.id}
      look="finance" fillColumn="supplier" />);
    expect(table().style.minWidth).toBe("100%");
    // The fill column: no fixed width, never less than its own width.
    expect(header("Supplier").style.width).toBe("");
    expect(header("Supplier").style.minWidth).toBe("260px");
    expect(bodyCell("Kayu Jati").style.width).toBe("");
    expect(bodyCell("Kayu Jati").style.maxWidth).toBe("0");
    // Every other column keeps its pixels, the footer too.
    expect(header("Bill No").style.width).toBe("120px");
    expect(header("Amount").style.width).toBe("128px");
    expect(bodyCell("BL-0001").style.width).toBe("120px");
    expect(bodyCell("BL-0001").style.maxWidth).toBe("120px");
    const foot = screen.getByTestId("footer-totals").querySelectorAll("td");
    expect(foot[1]!.style.width).toBe("");
    expect(foot[1]!.style.maxWidth).toBe("0");
    expect(foot[2]!.style.width).toBe("128px");
  });

  it("honours a width the person saved for the fill column: it keeps it and stops filling", () => {
    window.localStorage.setItem("t.fill.2", JSON.stringify({ order: [], hidden: [], widths: { supplier: 333 }, groupBy: [], sort: null }));
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.2" rowKey={(r) => r.id}
      look="finance" fillColumn="supplier" />);
    expect(header("Supplier").style.width).toBe("333px");
    expect(bodyCell("Kayu Jati").style.width).toBe("333px");
    expect(table().style.minWidth).toBe("");
  });

  it("resizes a Finance column by dragging its header edge, and remembers it", () => {
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.3" rowKey={(r) => r.id}
      look="finance" fillColumn="supplier" />);
    const handle = screen.getByTestId("grid-resize-amount");
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 540 });
    fireEvent.mouseUp(window);
    expect(header("Amount").style.width).toBe("168px");
    expect(JSON.parse(window.localStorage.getItem("t.fill.3")!).widths.amount).toBe(168);
    // The fill column has its own edge too.
    expect(screen.getByTestId("grid-resize-supplier")).toBeInTheDocument();
  });

  it("does nothing without the Finance look: a non-Finance grid is unchanged", () => {
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.4" rowKey={(r) => r.id}
      fillColumn="supplier" />);
    expect(table().style.width).toBe("");
    expect(table().style.minWidth).toBe("");
    expect(header("Supplier").style.width).toBe("260px");
    expect(header("Supplier").style.minWidth).toBe("40px");
    expect(bodyCell("Kayu Jati").style.width).toBe("260px");
    expect(bodyCell("Kayu Jati").style.maxWidth).toBe("260px");
    // The plain edge is unchanged.
    expect(screen.queryByTestId("grid-resize-supplier")).not.toBeInTheDocument();
  });

  it("a Finance grid without fillColumn behaves as before", () => {
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.5" rowKey={(r) => r.id} look="finance" />);
    expect(table().style.width).toBe("");
    expect(header("Supplier").style.width).toBe("260px");
  });

  it("fills inside governed groups: the fill column's <col> has no width, the section is 100% wide", () => {
    render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey="t.fill.6" rowKey={(r) => r.id}
      look="finance" fillColumn="supplier"
      fixedGroups={{ groups: [{ key: "all", label: "All bills", alwaysOpen: true }], groupOf: () => "all" }} />);
    const section = screen.getByTestId("grid-section-all");
    expect(section.style.width).toBe("100%");
    const cols = section.querySelectorAll("col");
    expect(cols[0]!.style.width).toBe("120px");
    expect(cols[1]!.style.width).toBe("");
    expect(cols[2]!.style.width).toBe("128px");
  });
});
