/**
 * Kit DataTable · `contextMenu` (Chew 2026-10-21, Finance first). Opt-in: a
 * table without it draws exactly the markup it always drew and leaves the
 * browser's own menu alone; with it, a right-click, Shift+F10 or the Menu key
 * opens the ONE ROW MENU — the same RowContextMenu, markup and classes DataGrid
 * opens.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";
import { documentRowMenu } from "@/components/register/row-menu";
import { DataGrid } from "@/components/register/DataGrid";

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [{ id: "1", name: "Public Bank" }, { id: "2", name: "Maybank" }];
const COLUMNS: Column<Row>[] = [{ key: "name", label: "Account", width: "auto", cell: (r) => <a href="#x">{r.name}</a> }];
const words = () => Array.from(screen.getByRole("menu", { name: "Row actions" }).children)
  .map((el) => (el.getAttribute("role") === "separator" ? "─" : el.textContent ?? ""));

describe("DataTable · contextMenu", () => {
  it("without the prop draws the same markup as with it, and opens no menu", () => {
    const plain = render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None" />);
    const before = plain.container.innerHTML;
    const event = fireEvent.contextMenu(screen.getByText("Public Bank"));
    expect(event).toBe(true); // not prevented: the browser's own menu
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    plain.unmount();
    const withMenu = render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      contextMenu={() => documentRowMenu({ view: () => {} })} />);
    expect(withMenu.container.innerHTML).toBe(before);
  });

  it("opens the row's menu on a right-click and runs the chosen item", () => {
    const view = vi.fn();
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      contextMenu={(r) => documentRowMenu({ view: () => view(r.id), more: [{ label: "Duplicate", onClick: () => {} }] })} />);
    fireEvent.contextMenu(screen.getByText("Maybank"), { clientX: 40, clientY: 50 });
    expect(words()).toEqual(["View", "─", "Duplicate"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    expect(view).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens from the keyboard (Shift+F10 or the Menu key) on a control inside the row, and Escape returns focus", () => {
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      contextMenu={() => documentRowMenu({ view: () => {} })} />);
    const link = screen.getByText("Public Bank");
    link.focus();
    fireEvent.keyDown(link, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menuitem", { name: "View" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(link).toHaveFocus();
    fireEvent.keyDown(link, { key: "ContextMenu" });
    expect(words()).toEqual(["View"]);
  });

  it("a row that returns no items keeps the browser's own menu", () => {
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None" contextMenu={() => []} />);
    expect(fireEvent.contextMenu(screen.getByText("Public Bank"))).toBe(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("draws the same menu element and classes as DataGrid", () => {
    const grid = render(<DataGrid storageKey="test.kit.context-menu" rows={ROWS} rowKey={(r) => r.id} columns={[{ key: "name", label: "Account", accessor: (r) => r.name }]}
      contextMenu={() => documentRowMenu({ view: () => {}, print: () => {} })} />);
    fireEvent.contextMenu(screen.getByText("Maybank"), { clientX: 10, clientY: 20 });
    const fromGrid = screen.getByRole("menu", { name: "Row actions" }).outerHTML;
    grid.unmount();
    render(<DataTable label="Accounts" rows={ROWS} columns={COLUMNS} rowId={(r) => r.id} empty="None"
      contextMenu={() => documentRowMenu({ view: () => {}, print: () => {} })} />);
    fireEvent.contextMenu(screen.getByText("Maybank"), { clientX: 10, clientY: 20 });
    expect(screen.getByRole("menu", { name: "Row actions" }).outerHTML).toBe(fromGrid);
  });
});
