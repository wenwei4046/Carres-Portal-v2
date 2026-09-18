/**
 * ⭐ PERSONAL SAVED LAYOUTS — ui MASTER §6.7 rule 4 (Jess, 2026-09-17).
 *
 * The engine owns WHAT a layout is (order · widths · visibility · sort, never
 * search / filters / group state) and the Columns-menu grammar; the page owns
 * storage. Off by default: no other Register gains the menu.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DataGrid, type DataGridColumn, type DataGridPersonalLayouts, type DataGridSavedLayout } from "./DataGrid";

interface Row { id: string; po: string; date: string; supplier: string; group: string }
const ROWS: Row[] = [
  { id: "a", po: "PO-20260901-1001", date: "1 Sep", supplier: "Hooka Furniture Manufacturing", group: "issued" },
  { id: "b", po: "PO-20260902-1002", date: "2 Sep", supplier: "Nice Future", group: "completed" },
];
const COLUMNS: DataGridColumn<Row>[] = [
  { key: "date", label: "PO Date", width: 100, accessor: (r) => r.date },
  { key: "po", label: "PO No", width: 150, accessor: (r) => r.po },
  { key: "supplier", label: "Supplier", width: 90, accessor: (r) => r.supplier },
  { key: "grn", label: "GRN No", width: 120, accessor: () => "GRN-1" },
];

function mount(personal?: Partial<DataGridPersonalLayouts>, key = "test.personal") {
  const props: DataGridPersonalLayouts | undefined = personal
    ? { layouts: [], limit: 10, onSave: vi.fn(async () => {}), onSetDefault: vi.fn(async () => {}), ...personal }
    : undefined;
  const utils = render(
    <DataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      storageKey={key}
      rowKey={(r) => r.id}
      leadingColumns={{ date: "date", identity: "po" }}
      searchPresentation="responsive"
      fixedGroups={{
        groups: [
          { key: "issued", label: "Issued", alwaysOpen: true },
          { key: "completed", label: "Completed", initiallyCollapsed: true },
        ],
        groupOf: (r) => r.group,
      }}
      expandable={{ renderExpansion: (r) => <div>goods of {r.po}</div> }}
      personalLayouts={props}
    />,
  );
  return { ...utils, props };
}
/**
 * ⭐ THE HEADER OF A GROUPED REGISTER IS INSIDE ITS GROUPS (owner ruling
 * 2026-09-18) — and there is still only ONE of it.
 *
 * These tests are about a layout the person saved: order, widths, visibility
 * and sort. The ruling moved where that header is DRAWN, not what it contains,
 * so the assertions read the first expanded group's header and the layout law
 * they protect is unchanged. Reading `thead th` here would now find nothing —
 * which is the point: a grouped Register has no header above its groups.
 */
const heads = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-testid^="grid-group-header-"] th')]
    .map((th) => th.title)
    .filter(Boolean);
const openColumns = () => fireEvent.click(screen.getByRole("button", { name: "Columns" }));

afterEach(() => window.localStorage.clear());

describe("DataGrid · personalLayouts", () => {
  it("is OFF by default — the Columns menu offers no layout actions", () => {
    mount();
    openColumns();
    expect(screen.queryByText("Save layout as…")).toBeNull();
    expect(screen.queryByTestId("personal-layout-actions")).toBeNull();
    expect(screen.getByRole("button", { name: "Reset columns" })).toBeInTheDocument();
  });

  it("lists the seven governed actions, in order", () => {
    mount({});
    openColumns();
    const actions = within(screen.getByTestId("personal-layout-actions")).getAllByRole("button").map((b) => b.textContent);
    expect(actions).toEqual(["Save layout as…", "Load layout", "Set as my default", "Reset columns", "Best fit", "Expand all", "Collapse all"]);
  });

  it("saves order, widths, visibility and sort ONLY — never the search or group state", async () => {
    const { props } = mount({});
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "Hooka" } });
    fireEvent.click(screen.getByRole("button", { name: "PO No" }));
    openColumns();
    fireEvent.click(screen.getByRole("checkbox", { name: "GRN No" }));
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "  Chase  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props!.onSave).toHaveBeenCalledTimes(1));
    const [name, saved] = vi.mocked(props!.onSave).mock.calls[0]!;
    expect(name).toBe("Chase");
    expect(Object.keys(saved).sort()).toEqual(["hidden", "order", "sort", "widths"]);
    expect(saved).toEqual({ order: ["date", "po", "supplier", "grn"], hidden: ["grn"], widths: {}, sort: { key: "po", dir: "asc" } });
  });

  it("shows a refused save in the menu", async () => {
    mount({ onSave: vi.fn(async () => { throw new Error("You can keep 10 layouts"); }) });
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Eleventh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("personal-layout-problem")).toHaveTextContent("You can keep 10 layouts");
  });

  it("Load layout applies the saved arrangement, but can never hide or move the date and identity", () => {
    const saved: DataGridSavedLayout = { order: ["grn", "supplier", "po", "date"], hidden: ["date", "supplier"], widths: { grn: 200 }, sort: null };
    const { container } = mount({ layouts: [{ id: "l1", name: "Receiving view", layout: saved, isDefault: false }] });
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "GRN No"]);
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Load layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Receiving view" }));
    expect(heads(container)).toEqual(["PO Date", "PO No", "GRN No"]);
    const grn = [...container.querySelectorAll<HTMLElement>('[data-testid^="grid-group-header-"] th')].find((th) => th.title === "GRN No")!;
    expect(grn.style.width).toBe("200px");
  });

  it("applies the person's default when their layouts arrive", () => {
    const saved: DataGridSavedLayout = { order: ["date", "po", "grn", "supplier"], hidden: [], widths: {}, sort: null };
    const { container } = mount({ layouts: [{ id: "l1", name: "Mine", layout: saved, isDefault: true }] });
    expect(heads(container)).toEqual(["PO Date", "PO No", "GRN No", "Supplier"]);
  });

  it("Set as my default hands the chosen layout to the page", async () => {
    const saved: DataGridSavedLayout = { order: [], hidden: [], widths: {}, sort: null };
    const { props } = mount({ layouts: [{ id: "l1", name: "A", layout: saved, isDefault: false }, { id: "l2", name: "B", layout: saved, isDefault: true }] });
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Set as my default" }));
    expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    await waitFor(() => expect(props!.onSetDefault).toHaveBeenCalledWith("l1"));
  });

  it("Reset columns returns the company layout and sort, leaving the search untouched", () => {
    const { container } = mount({});
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "Hooka" } });
    fireEvent.click(screen.getByRole("button", { name: "Supplier" }));
    openColumns();
    fireEvent.click(screen.getByRole("checkbox", { name: "GRN No" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(heads(container)).toEqual(["PO Date", "PO No", "Supplier", "GRN No"]);
    expect(JSON.parse(window.localStorage.getItem("test.personal")!).sort).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("Hooka");
  });

  it("Expand all opens every row and collapsible group; Collapse all never closes a mandatory-open heading", () => {
    mount({});
    expect(screen.queryByText("goods of PO-20260902-1002")).toBeNull();
    openColumns();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Expand all" })); });
    expect(screen.getByText("goods of PO-20260901-1001")).toBeInTheDocument();
    expect(screen.getByText("goods of PO-20260902-1002")).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Collapse all" })); });
    expect(screen.queryByText("goods of PO-20260901-1001")).toBeNull();
    expect(screen.getByTestId("grid-group-issued")).toBeInTheDocument();
    expect(screen.getByText("PO-20260901-1001")).toBeInTheDocument();
    expect(screen.queryByText("PO-20260902-1002")).toBeNull();
  });

  it("Best fit widens a column to its longest value", () => {
    const { container } = mount({});
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Best fit" }));
    const supplier = [...container.querySelectorAll<HTMLElement>('[data-testid^="grid-group-header-"] th')].find((th) => th.title === "Supplier")!;
    // `Hooka Furniture Manufacturing` = 29 characters → 29 × 7 + 17 = 220.
    expect(supplier.style.width).toBe("220px");
  });
});
