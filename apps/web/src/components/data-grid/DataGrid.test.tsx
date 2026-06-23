import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataGrid, { formatCell, type DataGridColumn, type DataGridRow } from "./DataGrid";

const columns: DataGridColumn[] = [
  { key: "so", label: "Doc No.", type: "text", width: 100 },
  { key: "customer_name", label: "Debtor Name", type: "text", width: 160 },
  { key: "item_group", label: "Item Group", type: "option", width: 120, option: true, options: ["bedframe", "sofa"] },
  { key: "qty", label: "Qty", type: "number", width: 70, align: "right" },
  { key: "unit_price", label: "Unit Price", type: "money", width: 110, align: "right" },
];

const rows: DataGridRow[] = [
  { rowId: "r1", so: "SO-1001", customer_name: "Tan", item_group: "bedframe", qty: 2, unit_price: 100 },
  { rowId: "r2", so: "SO-1002", customer_name: "Lim", item_group: "sofa", qty: 1, unit_price: 300 },
];

const getRowId = (r: DataGridRow) => String(r.rowId);

describe("formatCell", () => {
  it("formats money / number / bool / empty", () => {
    expect(formatCell(100, "money")).toBe("RM 100.00");
    expect(formatCell(2, "number")).toBe("2");
    expect(formatCell(true, "bool")).toBe("Yes");
    expect(formatCell(false, "bool")).toBe("No");
    expect(formatCell(null, "text")).toBe("");
  });
});

describe("DataGrid", () => {
  it("renders headers + formatted cells", () => {
    render(<DataGrid columns={columns} rows={rows} getRowId={getRowId} />);
    expect(screen.getByText("Doc No.")).toBeInTheDocument();
    expect(screen.getByText("Unit Price")).toBeInTheDocument();
    expect(screen.getByText("SO-1001")).toBeInTheDocument();
    expect(screen.getByText("RM 100.00")).toBeInTheDocument();
    expect(screen.getByText("RM 300.00")).toBeInTheDocument();
    expect(screen.getAllByTestId("dg-row")).toHaveLength(2);
  });

  it("global search narrows rows", () => {
    const { rerender } = render(
      <DataGrid columns={columns} rows={rows} getRowId={getRowId} search="" />,
    );
    expect(screen.getAllByTestId("dg-row")).toHaveLength(2);
    rerender(<DataGrid columns={columns} rows={rows} getRowId={getRowId} search="Lim" />);
    const visible = screen.getAllByTestId("dg-row");
    expect(visible).toHaveLength(1);
    expect(screen.getByText("Lim")).toBeInTheDocument();
    expect(screen.queryByText("Tan")).not.toBeInTheDocument();
  });

  it("click-header sort reorders rows", () => {
    render(<DataGrid columns={columns} rows={rows} getRowId={getRowId} />);
    // default input order: Tan (qty 2), Lim (qty 1)
    let body = screen.getAllByTestId("dg-row");
    expect(body[0].textContent).toContain("Tan");
    // sort ascending by Qty → Lim (1) first
    fireEvent.click(screen.getByTitle("Sort by Qty"));
    body = screen.getAllByTestId("dg-row");
    expect(body[0].textContent).toContain("Lim");
  });

  it("option-column funnel filters by selected value", () => {
    render(<DataGrid columns={columns} rows={rows} getRowId={getRowId} />);
    fireEvent.click(screen.getByLabelText("Filter Item Group"));
    // popover shows one checkbox per curated option choice (bedframe, sofa)
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    // pick "sofa" (second choice) → only the Lim row remains
    fireEvent.click(boxes[1]);
    const body = screen.getAllByTestId("dg-row");
    expect(body).toHaveLength(1);
    expect(body[0].textContent).toContain("Lim");
  });

  it("emits onResize from a handle drag", () => {
    const onResize = vi.fn();
    render(<DataGrid columns={columns} rows={rows} getRowId={getRowId} onResize={onResize} />);
    const handles = document.querySelectorAll('[role="separator"]');
    expect(handles.length).toBe(columns.length);
    fireEvent.pointerDown(handles[0], { clientX: 100 });
    fireEvent.pointerUp(document, { clientX: 160 });
    expect(onResize).toHaveBeenCalledWith("so", expect.any(Number));
  });
});
