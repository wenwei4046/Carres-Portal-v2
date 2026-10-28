/**
 * Kit DataTable · `resizable` (Chew 2026-10-14, Finance first). Opt-in: a
 * table without it renders no handle and the widths its caller declared; with
 * it, every column has a named edge that reports a new pixel width on a drag
 * or an arrow key, and the caller's saved widths override the declared ones.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  amount: string;
}
const ROWS: Row[] = [{ id: "1", name: "Public Bank", amount: "RM 10.00" }];
const COLUMNS: Column<Row>[] = [
  { key: "name", label: "Account", width: "auto", cell: (r) => r.name },
  { key: "amount", label: "Amount", width: "128px", align: "right", cell: (r) => r.amount },
];
const cols = () => Array.from(document.querySelectorAll("col")).map((c) => c.style.width);

describe("DataTable · resizable", () => {
  it("without the prop renders exactly as before: no handle, the declared widths", () => {
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None" />);
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(document.querySelector('[data-kit="table-resize"]')).toBeNull();
    expect(cols()).toEqual(["auto", "128px"]);
    expect(screen.getAllByRole("columnheader")[0]).not.toHaveAttribute("aria-label");
  });

  it("with the prop renders a named handle per column and keeps the header's own name", () => {
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      resizable={{ widths: {}, onResize: () => {} }} />);
    expect(screen.getByRole("separator", { name: "Resize Account" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize Amount" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    expect(cols()).toEqual(["auto", "128px"]);
  });

  it("calls back with a new width on a drag, from the declared width where nothing is laid out", () => {
    const onResize = vi.fn();
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      resizable={{ widths: {}, onResize }} />);
    fireEvent.mouseDown(screen.getByTestId("table-resize-amount"), { clientX: 300, button: 0 });
    fireEvent.mouseMove(window, { clientX: 350 });
    expect(onResize).toHaveBeenLastCalledWith("amount", 178);
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(onResize).toHaveBeenLastCalledWith("amount", 40);
    fireEvent.mouseUp(window);
    onResize.mockClear();
    fireEvent.mouseMove(window, { clientX: 400 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it("moves a focused edge with the arrow keys, from the saved width", () => {
    const onResize = vi.fn();
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      resizable={{ widths: { name: 300 }, onResize }} />);
    expect(cols()).toEqual(["300px", "128px"]);
    fireEvent.keyDown(screen.getByTestId("table-resize-name"), { key: "ArrowRight" });
    expect(onResize).toHaveBeenLastCalledWith("name", 310);
  });
});
